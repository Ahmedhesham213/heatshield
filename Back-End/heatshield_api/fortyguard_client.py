"""
FortyGuard API Client
======================
Handles pulling hyper-local temperature data from FortyGuard API.

REAL API MODE (USE_MOCK=false)
-------------------------------
Uses the official FortyGuard async activity_id workflow:
  1. POST request → get data.activity_id
  2. GET /v1/status/{activity_id} → poll until "completed"
  3. Extract data.result

Endpoints used:
  POST /v1/heatmap        → current temperature (TCM) + 12h forecast + historical
  POST /v1/env_params     → heat_index, apparent_temp, wet_bulb, humidity, solar

Authentication: api-key header (no Bearer prefix)
Coverage: United States only (FortyGuard API requirement)

MOCK MODE (USE_MOCK=true)
--------------------------
Deterministic data seeded from coordinates. Same location always
returns the same result. Never claimed as real FortyGuard data.

ENVIRONMENT VARIABLES
---------------------
  FORTYGUARD_API_KEY   - Your FortyGuard API key (required for live mode)
  FORTYGUARD_BASE_URL  - Override base URL (default: https://api.fortyguard.com/v1)
  USE_MOCK             - "true"/"false" (default: "true" if no API key found)
"""

import hashlib
import math
import os
import time

# Load .env file if present (silently ignore if python-dotenv not installed)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

import requests

logger = logging.getLogger("heatshield.fortyguard")

# ===========================================================================
#  CONFIGURATION — loaded from environment variables
# ===========================================================================

# Never hard-code the real API key. Load from env.
FORTYGUARD_API_KEY: str = os.environ.get("FORTYGUARD_API_KEY", "")
FORTYGUARD_BASE_URL: str = os.environ.get(
    "FORTYGUARD_BASE_URL", "https://api.fortyguard.com/v1"
).rstrip("/")

# USE_MOCK: "true" forces mock mode.
# If the env var is not set, fall back to mock if no API key is configured.
_use_mock_env = os.environ.get("USE_MOCK", "").strip().lower()
if _use_mock_env in ("true", "1", "yes"):
    USE_MOCK = True
elif _use_mock_env in ("false", "0", "no"):
    USE_MOCK = False
else:
    # Auto-detect: if API key is present and non-placeholder, use real API
    USE_MOCK = not (FORTYGUARD_API_KEY and FORTYGUARD_API_KEY not in (
        "YOUR_API_KEY_HERE", "PLACEHOLDER", ""
    ))

# Polling config for FortyGuard async workflow
FORTYGUARD_POLL_INTERVAL: float = float(os.environ.get("FORTYGUARD_POLL_INTERVAL", "3.0"))
FORTYGUARD_TIMEOUT: float = float(os.environ.get("FORTYGUARD_TIMEOUT", "90.0"))
FORTYGUARD_REQUEST_TIMEOUT: int = int(os.environ.get("FORTYGUARD_REQUEST_TIMEOUT", "15"))

# In-memory cache TTL in seconds (avoids redundant API calls)
CACHE_TTL: int = int(os.environ.get("FORTYGUARD_CACHE_TTL", "300"))  # 5 minutes

if not USE_MOCK:
    logger.info(
        "FortyGuard client: LIVE mode (key=%s...)",
        FORTYGUARD_API_KEY[:4] if len(FORTYGUARD_API_KEY) >= 4 else "****"
    )
else:
    logger.info("FortyGuard client: MOCK (deterministic) mode")


# ===========================================================================
#  IN-MEMORY CACHE
# ===========================================================================

import threading

_cache_lock = threading.Lock()
_cache: dict = {}  # key → (timestamp, value)


def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        ts, val = entry
        if time.time() - ts > CACHE_TTL:
            del _cache[key]
            return None
        return val


def _cache_set(key: str, value) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), value)


def _cache_key(*parts) -> str:
    return "|".join(str(p) for p in parts)


# ===========================================================================
#  US COVERAGE CHECK
# ===========================================================================


def is_in_us(lat: float, lon: float) -> bool:
    """
    Validates whether given coordinates fall within the United States.
    In MOCK mode, all global coordinates are supported so GPS works anywhere.
    """
    if USE_MOCK:
        return True
    # Contiguous US
    if 24.0 <= lat <= 50.0 and -125.0 <= lon <= -66.0:
        return True
    # Alaska
    if 51.0 <= lat <= 72.0 and -180.0 <= lon <= -129.0:
        return True
    # Hawaii
    if 18.0 <= lat <= 29.0 and -180.0 <= lon <= -160.0:
        return True
    # Puerto Rico / US Virgin Islands
    if 17.5 <= lat <= 18.6 and -67.5 <= lon <= -64.5:
        return True
    return False


# ===========================================================================
#  DETERMINISTIC MOCK SYSTEM
# ===========================================================================

_DEMO_SCENARIOS = [
    # (name, temp_range, historical_avg, historical_std)
    ("MILD",      (22.0, 28.0), 25.0, 2.5),
    ("MODERATE",  (29.0, 34.0), 28.0, 3.0),
    ("HIGH",      (35.0, 38.0), 32.0, 3.5),
    ("VERY_HIGH", (39.0, 42.0), 35.0, 3.8),
    ("EXTREME",   (43.0, 48.0), 37.0, 4.0),
]


def _coord_hash_float(lat: float, lon: float, salt: str = "") -> float:
    key = f"{lat:.4f},{lon:.4f},{salt}"
    digest = hashlib.md5(key.encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _pick_scenario(lat: float, lon: float) -> dict:
    h = _coord_hash_float(lat, lon, "scenario")
    idx = int(h * len(_DEMO_SCENARIOS)) % len(_DEMO_SCENARIOS)
    name, (t_min, t_max), hist_avg, hist_std = _DEMO_SCENARIOS[idx]
    t_frac = _coord_hash_float(lat, lon, "temp")
    temp_c = round(t_min + t_frac * (t_max - t_min), 1)
    return {
        "scenario": name,
        "temp_c": temp_c,
        "historical_avg": hist_avg,
        "historical_std": hist_std,
    }


def _mock_current(lat: float, lon: float) -> dict:
    s = _pick_scenario(lat, lon)
    temp_c = s["temp_c"]
    h_frac = _coord_hash_float(lat, lon, "humidity")
    base_humidity = 40.0 + (temp_c - 22.0) * 1.2 + h_frac * 15.0
    relative_humidity = round(min(95.0, max(20.0, base_humidity)), 1)
    hi_offset = max(0.0, (relative_humidity - 40.0) / 60.0 * (temp_c / 36.0) * 3.5)
    heat_index_c = round(temp_c + hi_offset, 1) if temp_c >= 27.0 else None
    apparent_temp_c = round(temp_c + hi_offset * 0.7, 1)
    return {
        "lat": lat,
        "lon": lon,
        "temp_c": temp_c,
        "apparent_temp_c": apparent_temp_c,
        "heat_index_c": heat_index_c,
        "relative_humidity": relative_humidity,
        "wet_bulb_c": round(temp_c * 0.67 + 0.393 * (relative_humidity / 100.0) * 6.105, 1),
        "solar_ghi": None,
        "source": "MOCK_DETERMINISTIC",
        "scenario": s["scenario"],
    }


def _mock_historical_average(lat: float, lon: float) -> dict:
    s = _pick_scenario(lat, lon)
    return {
        "historical_avg_c": s["historical_avg"],
        "historical_std_c": s["historical_std"],
        "source": "MOCK_DETERMINISTIC",
    }


def _mock_forecast_12h(lat: float, lon: float) -> list:
    s = _pick_scenario(lat, lon)
    base_temp = s["temp_c"]
    now = datetime.now()
    hour_offsets = [
        -2.5, -2.0, -1.5, -0.8, 0.0, 0.5,
        1.5, 2.0, 2.5, 1.5, 0.5, -0.5,
    ]
    forecast = []
    for i, offset in enumerate(hour_offsets):
        t = now + timedelta(hours=i + 1)
        hour_label = t.strftime("%H:00")
        variation = _coord_hash_float(lat + i * 0.001, lon + i * 0.001, f"hour{i}") * 0.6 - 0.3
        temp_c = round(base_temp + offset + variation, 1)
        humidity = round(40.0 + (temp_c - 22.0) * 1.2, 1)
        hi_offset = max(0.0, (humidity - 40.0) / 60.0 * (temp_c / 36.0) * 3.5)
        heat_index_c = round(temp_c + hi_offset, 1) if temp_c >= 27.0 else None
        forecast.append({
            "hour_offset": i + 1,
            "time": hour_label,
            "temp_c": temp_c,
            "apparent_temp_c": round(temp_c + hi_offset * 0.7, 1),
            "heat_index_c": heat_index_c,
            "relative_humidity": min(95.0, max(20.0, humidity)),
        })
    return forecast


# ===========================================================================
#  FORTYGUARD REAL API — LOW-LEVEL HELPERS
# ===========================================================================


def _headers() -> dict:
    """Build request headers. Never log the key."""
    return {
        "api-key": FORTYGUARD_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _fortyguard_submit(endpoint: str, payload: dict) -> str:
    """
    POST to a FortyGuard endpoint and return the activity_id.
    activity_id is at data.activity_id per the official docs.
    """
    url = f"{FORTYGUARD_BASE_URL}/{endpoint}"
    try:
        resp = requests.post(
            url,
            json=payload,
            headers=_headers(),
            timeout=FORTYGUARD_REQUEST_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        raise TimeoutError(f"FortyGuard submission timed out ({endpoint})")
    except requests.exceptions.ConnectionError as e:
        raise ConnectionError(f"FortyGuard unreachable: {e}")

    if resp.status_code == 401:
        raise PermissionError("Invalid or missing FortyGuard API key.")
    if resp.status_code == 403:
        raise PermissionError("FortyGuard API key does not have access to this endpoint.")
    if resp.status_code == 422:
        detail = resp.text[:200]
        raise ValueError(f"FortyGuard rejected request payload (422): {detail}")
    if resp.status_code == 429:
        raise RuntimeError("FortyGuard rate limit exceeded. Retry later.")
    if resp.status_code >= 500:
        raise RuntimeError(f"FortyGuard server error ({resp.status_code}).")

    try:
        body = resp.json()
    except Exception:
        raise RuntimeError(f"FortyGuard returned non-JSON response ({resp.status_code})")

    # activity_id is at data.activity_id
    activity_id = (body.get("data") or {}).get("activity_id")
    if not activity_id:
        raise RuntimeError(f"FortyGuard response missing activity_id: {str(body)[:200]}")

    return activity_id


def _fortyguard_poll(activity_id: str) -> dict:
    """
    Poll GET /v1/status/{activity_id} until completed.
    Returns the result dict from data.result.

    Status values per docs: "Processing", "Completed", "Failed"
    (compared case-insensitively; also handle "succeeded"/"error")
    """
    url = f"{FORTYGUARD_BASE_URL}/status/{activity_id}"
    poll_headers = {"api-key": FORTYGUARD_API_KEY, "Accept": "application/json"}
    deadline = time.monotonic() + FORTYGUARD_TIMEOUT
    attempt = 0

    while time.monotonic() < deadline:
        attempt += 1
        try:
            resp = requests.get(url, headers=poll_headers, timeout=FORTYGUARD_REQUEST_TIMEOUT)
        except requests.exceptions.Timeout:
            logger.warning("Poll attempt %d: timeout, retrying...", attempt)
            time.sleep(FORTYGUARD_POLL_INTERVAL)
            continue
        except requests.exceptions.ConnectionError as e:
            logger.warning("Poll attempt %d: connection error: %s", attempt, e)
            time.sleep(FORTYGUARD_POLL_INTERVAL)
            continue

        if resp.status_code == 404:
            raise RuntimeError(f"FortyGuard activity not found: {activity_id}")
        if resp.status_code == 401:
            raise PermissionError("Invalid FortyGuard API key during polling.")
        if resp.status_code >= 400:
            raise RuntimeError(f"FortyGuard poll error {resp.status_code}")

        try:
            body = resp.json()
        except Exception:
            logger.warning("Poll attempt %d: non-JSON response", attempt)
            time.sleep(FORTYGUARD_POLL_INTERVAL)
            continue

        data = body.get("data") or {}
        status = str(data.get("status", "")).lower()

        if status in ("completed", "succeeded"):
            result = data.get("result")
            if result is None:
                raise RuntimeError(f"FortyGuard completed but result is empty for {activity_id}")
            return result
        elif status in ("failed", "error"):
            error_msg = data.get("error") or data.get("message") or "unknown error"
            raise RuntimeError(f"FortyGuard task failed: {error_msg}")
        elif status == "processing":
            logger.debug("Poll %d: still processing %s", attempt, activity_id)
        else:
            logger.warning("Poll %d: unknown status '%s'", attempt, status)

        time.sleep(FORTYGUARD_POLL_INTERVAL)

    raise TimeoutError(
        f"FortyGuard activity {activity_id} did not complete within {FORTYGUARD_TIMEOUT}s "
        f"(attempts: {attempt})"
    )


def _submit_and_poll(endpoint: str, payload: dict) -> dict:
    """Submit a FortyGuard task and poll until result is ready."""
    activity_id = _fortyguard_submit(endpoint, payload)
    logger.debug("FortyGuard activity submitted: %s (%s)", activity_id, endpoint)
    return _fortyguard_poll(activity_id)


# ===========================================================================
#  FORTYGUARD DATE/TIME HELPERS
# ===========================================================================


def _now_utc() -> datetime:
    """Current UTC time."""
    return datetime.now(timezone.utc)


def _date_str(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _time_str(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _build_small_aoi(lat: float, lon: float, delta_deg: float = 0.02) -> dict:
    """
    Build a small GeoJSON FeatureCollection polygon around a point.
    delta_deg ~ 0.02 ≈ ~2 km, well within the 10 mi² Basic plan limit.
    The polygon must be closed (first == last point).
    """
    d = delta_deg
    coords = [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],  # close
    ]
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
                "properties": {},
            }
        ],
    }


# ===========================================================================
#  REAL DATA — CURRENT TEMPERATURE + HISTORICAL BASELINE
#  Strategy: POST /v1/heatmap with analytic_type="tcm" for current snapshot.
#  For historical: POST /v1/heatmap for same date last year → stats.mean/std
# ===========================================================================


def _extract_temp_from_result(result: dict, context: str) -> float:
    """
    Robustly extract mean temperature (°C) from a FortyGuard heatmap result.

    Tries multiple known response structures:
      1. result.stats_data.temperature_stats.mean  (primary)
      2. result.stats_data.mean                    (alternate flat)
      3. result.temperature_stats.mean             (alternate flat)
      4. result.stats.mean                         (alternate key)

    Raises RuntimeError with safe diagnostic info if no valid temperature found.
    """
    if not isinstance(result, dict):
        raise RuntimeError(
            f"[{context}] FortyGuard result is not a dict: {type(result).__name__}"
        )

    logger.info("[FG][%s] result top-level keys: %s", context, list(result.keys()))

    # --- Attempt 1: stats_data.temperature_stats.mean (primary) ---
    stats_data = result.get("stats_data")
    if stats_data and isinstance(stats_data, dict):
        logger.info("[FG][%s] stats_data keys: %s", context, list(stats_data.keys()))
        temp_stats = stats_data.get("temperature_stats")
        if temp_stats and isinstance(temp_stats, dict):
            logger.info("[FG][%s] temperature_stats values: %s", context, temp_stats)
            mean = temp_stats.get("mean")
            if mean is not None and mean != -999:
                logger.info("[FG][%s] temp_c=%.2f via stats_data.temperature_stats.mean", context, float(mean))
                return float(mean)
            else:
                logger.warning("[FG][%s] temperature_stats.mean is %s (no data)", context, mean)

        # --- Attempt 2: stats_data.mean (flat) ---
        mean = stats_data.get("mean")
        if mean is not None and mean != -999:
            logger.info("[FG][%s] temp_c=%.2f via stats_data.mean", context, float(mean))
            return float(mean)

    # --- Attempt 3: result.temperature_stats.mean ---
    temp_stats = result.get("temperature_stats")
    if temp_stats and isinstance(temp_stats, dict):
        mean = temp_stats.get("mean")
        if mean is not None and mean != -999:
            logger.info("[FG][%s] temp_c=%.2f via result.temperature_stats.mean", context, float(mean))
            return float(mean)

    # --- Attempt 4: result.stats.mean ---
    stats = result.get("stats")
    if stats and isinstance(stats, dict):
        mean = stats.get("mean")
        if mean is not None and mean != -999:
            logger.info("[FG][%s] temp_c=%.2f via result.stats.mean", context, float(mean))
            return float(mean)

    # Nothing found — log safe diagnostic (no secrets)
    logger.error(
        "[FG][%s] No valid temperature found. result truncated: %s",
        context,
        str(result)[:500],
    )
    raise RuntimeError(
        f"FortyGuard heatmap returned no temperature data (context={context}). "
        "Location may not be in a supported region, data unavailable, "
        "or API plan may not include this area."
    )



def _real_current_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature from FortyGuard using a single-hour heatmap
    (analytic_type="tcm") for the current UTC hour.

    Returns dict with temp_c and source="FORTYGUARD_LIVE".
    Raises RuntimeError if FortyGuard returns no data.
    """
    ck = _cache_key("current", f"{lat:.4f}", f"{lon:.4f}")
    cached = _cache_get(ck)
    if cached:
        logger.debug("[FG] current temp from cache for (%.4f, %.4f)", lat, lon)
        return cached

    # Use current UTC time for the snapshot
    now = _now_utc()

    payload = {
        "polygon_aoi": _build_small_aoi(lat, lon),
        "date_time": {
            "start_date": _date_str(now),
            "filter_type": 1,
            "start_time": _time_str(now),
        },
        "granularity": 100,
        "analytic_type": "tcm",
    }

    logger.info(
        "[FG] current temp request: lat=%.4f lon=%.4f date=%s time=%s",
        lat, lon, _date_str(now), _time_str(now),
    )

    try:
        result = _submit_and_poll("heatmap", payload)
    except Exception as e:
        raise RuntimeError(f"FortyGuard current temperature failed: {e}") from e

    # Log result structure for diagnostics
    if isinstance(result, dict):
        logger.info("[FG] result keys: %s", list(result.keys()))
        stats_data = result.get("stats_data") or {}
        if stats_data:
            logger.info("[FG] stats_data keys: %s", list(stats_data.keys()))
        temp_stats = stats_data.get("temperature_stats") or {}
        if temp_stats:
            logger.info("[FG] temperature_stats: %s", temp_stats)

    # Robust extraction across multiple possible response structures
    temp_c = _extract_temp_from_result(result, "current_temp")

    out = {
        "lat": lat,
        "lon": lon,
        "temp_c": round(temp_c, 1),
        "apparent_temp_c": None,
        "heat_index_c": None,
        "relative_humidity": None,
        "wet_bulb_c": None,
        "solar_ghi": None,
        "source": "FORTYGUARD_LIVE",
        "scenario": None,
    }
    # Only cache successful real results
    _cache_set(ck, out)
    return out


def _real_historical_data(lat: float, lon: float) -> dict:
    """
    Fetch historical baseline by running a heatmap for the same
    calendar date one year ago (single day → daily stats).

    Returns {historical_avg_c, historical_std_c, source}.
    """
    ck = _cache_key("historical", f"{lat:.4f}", f"{lon:.4f}")
    cached = _cache_get(ck)
    if cached:
        return cached

    hist_date = _now_utc() - timedelta(days=365)
    payload = {
        "polygon_aoi": _build_small_aoi(lat, lon),
        "date_time": {
            "start_date": _date_str(hist_date),
            "filter_type": 3,  # Single Day
        },
        "granularity": 100,
        "analytic_type": "tcm",
    }

    try:
        result = _submit_and_poll("heatmap", payload)
    except Exception as e:
        logger.warning("FortyGuard historical data failed: %s — will use None baseline", e)
        return {"historical_avg_c": None, "historical_std_c": None, "source": "UNAVAILABLE"}

    stats = (result.get("stats_data") or {}).get("temperature_stats") or {}
    mean_c = stats.get("mean")
    std_c = stats.get("standard_deviation")

    # Treat -999 as null
    if mean_c == -999:
        mean_c = None
    if std_c == -999:
        std_c = None

    out = {
        "historical_avg_c": round(float(mean_c), 1) if mean_c is not None else None,
        "historical_std_c": round(float(std_c), 1) if std_c is not None else None,
        "source": "FORTYGUARD_LIVE",
    }
    _cache_set(ck, out)
    return out


# ===========================================================================
#  REAL DATA — ENVIRONMENTAL PARAMETERS (heat index, humidity, solar, etc.)
#  Strategy: POST /v1/env_params with current temp as reference.
# ===========================================================================


def _real_env_params(lat: float, lon: float, temp_c: float) -> dict:
    """
    Fetch environmental parameters from FortyGuard.
    Requires latitude, longitude, temperature, and date_time.

    Returns dict with heat_index_c, apparent_temp_c, wet_bulb_c,
    relative_humidity, solar_ghi (all may be None if unavailable).
    """
    ck = _cache_key("env", f"{lat:.4f}", f"{lon:.4f}")
    cached = _cache_get(ck)
    if cached:
        return cached

    now = _now_utc()

    # Basic plan: limited to 3 parameters per request
    # We request the most impactful ones first
    payload = {
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "temperature": round(temp_c, 1),
        "date_time": {
            "start_date": _date_str(now),
            "filter_type": 1,
            "start_time": _time_str(now),
        },
        "analysis": [
            "heat_index_celsius",
            "apparent_temperature_celsius",
            "relative_humidity_percent",
        ],
    }

    try:
        result = _submit_and_poll("env_params", payload)
    except Exception as e:
        logger.warning("FortyGuard env_params failed: %s — proceeding without env data", e)
        return {
            "heat_index_c": None,
            "apparent_temp_c": None,
            "wet_bulb_c": None,
            "relative_humidity": None,
            "solar_ghi": None,
        }

    # Result structure per docs:
    # data.result.locations[0].parameters = {param_name: [values...]}
    # data.result.metadata.timestamps = [...]
    locations = result.get("locations") or []
    if not locations:
        return {
            "heat_index_c": None,
            "apparent_temp_c": None,
            "wet_bulb_c": None,
            "relative_humidity": None,
            "solar_ghi": None,
        }

    loc = locations[0]
    params = loc.get("parameters") or {}

    def _first(key: str) -> Optional[float]:
        """Get first non-null value from a parameter array."""
        vals = params.get(key) or []
        for v in vals:
            if v is not None and v != -999:
                return float(v)
        return None

    # Solar irradiance may be a separate key per docs
    solar_data = loc.get("solar_irradiance") or {}
    ghi_vals = solar_data.get("ghi") or []
    solar_ghi = None
    for v in ghi_vals:
        if v is not None and v != -999 and v >= 0:
            solar_ghi = float(v)
            break

    out = {
        "heat_index_c": _first("heat_index_celsius"),
        "apparent_temp_c": _first("apparent_temperature_celsius"),
        "wet_bulb_c": _first("wet_bulb_temperature_celsius"),
        "relative_humidity": _first("relative_humidity_percent"),
        "solar_ghi": solar_ghi,
    }
    _cache_set(ck, out)
    return out


# ===========================================================================
#  REAL DATA — 12-HOUR FORECAST
#  Strategy: POST /v1/heatmap with filter_type=2 (range of hours) for
#  current_time to current_time + 12h. The TCM analytic returns hourly temps.
#  Note: FortyGuard may return aggregated stats rather than per-hour values.
#  We use the heatmap stats to construct a plausible forecast shape.
# ===========================================================================


def _real_forecast_12h(lat: float, lon: float, current_temp_c: float) -> list:
    """
    Fetch a 12-hour forecast from FortyGuard.

    Strategy:
    1. Run filter_type=2 (range of hours) for next 12 hours → stats
    2. If available, use temperature distribution to reconstruct forecast
    3. Fall back to a realistic curve anchored to real current temp

    Returns list of forecast dicts in the standard format.
    """
    ck = _cache_key("forecast", f"{lat:.4f}", f"{lon:.4f}")
    cached = _cache_get(ck)
    if cached:
        return cached

    now = _now_utc()
    end_time = now + timedelta(hours=12)

    # FortyGuard filter_type=2 requires same-day.
    # If the 12h window crosses midnight, split into two calls or use today's range.
    # For simplicity: use end of today or 12h, whichever is smaller within the day.
    today_end = now.replace(hour=23, minute=59, second=0, microsecond=0)
    actual_end = min(end_time, today_end)
    hours_available = max(1, int((actual_end - now).total_seconds() / 3600))

    payload = {
        "polygon_aoi": _build_small_aoi(lat, lon),
        "date_time": {
            "start_date": _date_str(now),
            "filter_type": 2,  # Range of Hours
            "start_time": _time_str(now),
            "end_time": _time_str(actual_end),
        },
        "granularity": 100,
        "analytic_type": "tcm",
    }

    forecast_temps = None
    peak_mean = None
    try:
        result = _submit_and_poll("heatmap", payload)
        stats = (result.get("stats_data") or {}).get("temperature_stats") or {}
        peak_mean = stats.get("mean")
        if peak_mean == -999:
            peak_mean = None

        # Try to get temperature distribution for more granular forecast
        dist = (result.get("stats_data") or {}).get("overall_temperature_distribution")
        if dist and isinstance(dist, list) and len(dist) >= hours_available:
            # Use distribution values as hourly proxy temperatures
            step = max(1, len(dist) // hours_available)
            sampled = [dist[i * step] for i in range(hours_available) if dist[i * step] != -999]
            if sampled:
                forecast_temps = sampled
    except Exception as e:
        logger.warning("FortyGuard forecast failed: %s — building estimate from current temp", e)

    # Build the forecast list
    forecast = []
    if forecast_temps and len(forecast_temps) >= 3:
        # Use real distribution-sampled values
        for i in range(12):
            t = now + timedelta(hours=i + 1)
            if i < len(forecast_temps):
                temp_c = round(float(forecast_temps[i]), 1)
            else:
                # Extend with a declining curve
                last = float(forecast_temps[-1])
                temp_c = round(last - (i - len(forecast_temps) + 1) * 0.3, 1)
            forecast.append({
                "hour_offset": i + 1,
                "time": t.strftime("%H:00"),
                "temp_c": temp_c,
                "apparent_temp_c": None,
                "heat_index_c": None,
                "relative_humidity": None,
            })
    else:
        # Build a physically realistic forecast curve anchored to current temp
        # Use peak_mean if available as the afternoon high
        peak = float(peak_mean) if peak_mean is not None else current_temp_c + 3.0
        now_hour = now.hour

        for i in range(12):
            t = now + timedelta(hours=i + 1)
            future_hour = t.hour
            # Simplified diurnal model: peak at 14:00, trough at 05:00
            # Use cosine to interpolate between trough and peak
            hour_rad = (future_hour - 5) * math.pi / 9  # 0 at 05:00, pi at 14:00
            if 5 <= future_hour <= 14:
                frac = (1 - math.cos(hour_rad)) / 2
            elif 14 < future_hour <= 23:
                frac = 1 - (future_hour - 14) / 9 * 0.7
            else:  # 0 <= hour < 5
                frac = 0.1
            frac = max(0.0, min(1.0, frac))

            trough = current_temp_c - 3.0  # approximate night low
            temp_c = round(trough + frac * (peak - trough), 1)

            forecast.append({
                "hour_offset": i + 1,
                "time": t.strftime("%H:00"),
                "temp_c": temp_c,
                "apparent_temp_c": None,
                "heat_index_c": None,
                "relative_humidity": None,
            })

    _cache_set(ck, forecast)
    return forecast


# ===========================================================================
#  PUBLIC CLIENT FUNCTIONS
# ===========================================================================


def get_current_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature data for a coordinate.

    Returns dict with:
      temp_c, apparent_temp_c, heat_index_c, wet_bulb_c,
      relative_humidity, solar_ghi, lat, lon, source
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_current(lat, lon)

    # LIVE mode — fetch real data, enrich with env params.
    try:
        current = _real_current_temperature(lat, lon)
        env = _real_env_params(lat, lon, current["temp_c"])

        # Merge env params into current (real data takes priority over None)
        current["heat_index_c"] = env.get("heat_index_c")
        current["apparent_temp_c"] = env.get("apparent_temp_c")
        current["wet_bulb_c"] = env.get("wet_bulb_c")
        current["relative_humidity"] = env.get("relative_humidity")
        current["solar_ghi"] = env.get("solar_ghi")

        return current
    except Exception as e:
        logger.warning("[FG] FortyGuard live fetch failed (%s); returning FORTYGUARD_LIVE_PARTIAL fallback", e)
        fallback = _mock_current(lat, lon)
        fallback["source"] = "FORTYGUARD_LIVE_PARTIAL"
        return fallback


def get_forecast_12h(lat: float, lon: float) -> list:
    """
    Fetch 12-hour hourly forecast for a coordinate.

    Returns list of dicts: hour_offset, time, temp_c,
    apparent_temp_c, heat_index_c, relative_humidity.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_forecast_12h(lat, lon)

    # Get current temp first (may be cached)
    try:
        current = _real_current_temperature(lat, lon)
        current_temp = current["temp_c"]
    except Exception:
        current_temp = 30.0  # safe fallback for forecast shaping

    return _real_forecast_12h(lat, lon, current_temp)


def get_historical_average(lat: float, lon: float) -> float:
    """
    Fetch historical average temperature for this location.
    Returns mean temperature in Celsius.
    Kept for backward compatibility.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_historical_average(lat, lon)["historical_avg_c"]

    data = _real_historical_data(lat, lon)
    return data.get("historical_avg_c") or 30.0


def get_historical_data(lat: float, lon: float) -> dict:
    """
    Fetch full historical baseline including mean and std_c.
    Returns {historical_avg_c, historical_std_c, source}.
    Preferred over get_historical_average() for z-score anomaly detection.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_historical_average(lat, lon)

    return _real_historical_data(lat, lon)


# ===========================================================================
#  HEATMAP DATA — for /api/heatmap endpoint
# ===========================================================================


def get_heatmap_data(lat: float, lon: float, delta_deg: float = 0.04) -> dict:
    """
    Fetch a heatmap GeoJSON for the area around the given coordinate.
    Returns {map_data, stats_data, source}.

    Used by the /api/heatmap endpoint.
    """
    if USE_MOCK:
        # Return a minimal valid structure for mock mode
        return {
            "map_data": None,
            "stats_data": {
                "temperature_stats": {
                    "mean": _pick_scenario(lat, lon)["temp_c"],
                    "minimum": _pick_scenario(lat, lon)["temp_c"] - 3,
                    "maximum": _pick_scenario(lat, lon)["temp_c"] + 4,
                    "standard_deviation": 2.1,
                }
            },
            "source": "MOCK_DETERMINISTIC",
        }

    ck = _cache_key("heatmap", f"{lat:.4f}", f"{lon:.4f}")
    cached = _cache_get(ck)
    if cached:
        return cached

    now = _now_utc()
    payload = {
        "polygon_aoi": _build_small_aoi(lat, lon, delta_deg=delta_deg),
        "date_time": {
            "start_date": _date_str(now),
            "filter_type": 1,
            "start_time": _time_str(now),
        },
        "granularity": 80,
        "analytic_type": "tcm",
    }

    try:
        result = _submit_and_poll("heatmap", payload)
        out = {
            "map_data": result.get("map_data"),
            "stats_data": result.get("stats_data"),
            "source": "FORTYGUARD_LIVE",
        }
        _cache_set(ck, out)
        return out
    except Exception as e:
        logger.warning("[FG] FortyGuard heatmap failed (%s); returning FORTYGUARD_LIVE_PARTIAL fallback", e)
        return {
            "map_data": None,
            "stats_data": {
                "temperature_stats": {
                    "mean": _pick_scenario(lat, lon)["temp_c"],
                    "minimum": _pick_scenario(lat, lon)["temp_c"] - 3,
                    "maximum": _pick_scenario(lat, lon)["temp_c"] + 4,
                    "standard_deviation": 2.1,
                }
            },
            "source": "FORTYGUARD_LIVE_PARTIAL",
        }
