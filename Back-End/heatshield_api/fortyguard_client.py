"""
FortyGuard API Client
======================
Handles pulling hyper-local temperature data from FortyGuard API.
Enforces United States regional coverage check as required by FortyGuard docs.
Supports FortyGuard asynchronous request (activity_id) status workflow.

MOCK MODE
---------
When USE_MOCK = True, all data is derived deterministically from the
coordinates using a hash-based seed. This means:
  - The same location always returns the same temperatures.
  - The dashboard does not flicker on refresh.
  - Demo scenarios are reproducible and predictable.

This is clearly labeled. No mock data is ever claimed to be real FortyGuard data.

Coverage: United States only (FortyGuard API requirement).

REAL API INTEGRATION
--------------------
To enable real FortyGuard data:
  1. Set USE_MOCK = False
  2. Set FORTYGUARD_API_KEY to your actual API key
  3. The async activity_id workflow stubs below show the integration pattern
"""

import hashlib
import math
import time
from datetime import datetime, timedelta
from typing import Optional

import requests

# ===========================================================================
#  CONFIG
# ===========================================================================

USE_MOCK = True   # Set False when a real FortyGuard API key is available
FORTYGUARD_API_KEY = "YOUR_API_KEY_HERE"
FORTYGUARD_BASE_URL = "https://api.fortyguard.com/v1"

# Polling config for FortyGuard async workflow
FORTYGUARD_POLL_INTERVAL = 1.0   # seconds between status polls
FORTYGUARD_TIMEOUT = 15.0        # max seconds to wait for result


# ===========================================================================
#  US COVERAGE CHECK
# ===========================================================================


def is_in_us(lat: float, lon: float) -> bool:
    """
    Validates whether given coordinates fall within the United States.
    When USE_MOCK is True (demo/hackathon mode), all global coordinates
    are supported so device GPS works anywhere in the world.
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
    if 18.0 <= lat <= 29.0 and -180.0 <= lon <= -154.0:
        return True
    # Puerto Rico / US Virgin Islands
    if 17.5 <= lat <= 18.6 and -67.5 <= lon <= -64.5:
        return True
    return False


# ===========================================================================
#  DETERMINISTIC MOCK SYSTEM
#
#  Mock values are derived from a hash of (lat, lon) so the same location
#  always returns the same data. Scenarios are tuned to cover all five
#  risk levels for demo purposes.
# ===========================================================================

# Five deterministic demo scenarios mapped to coordinate ranges.
# Any real US coordinate will map to a plausible scenario.
_DEMO_SCENARIOS = [
    # (name, temp_range, historical_avg, historical_std, scenario_label)
    ("MILD",      (22.0, 28.0), 25.0, 2.5, "LOW"),
    ("MODERATE",  (29.0, 34.0), 28.0, 3.0, "MODERATE"),
    ("HIGH",      (35.0, 38.0), 32.0, 3.5, "HIGH"),
    ("VERY_HIGH", (39.0, 42.0), 35.0, 3.8, "VERY_HIGH"),
    ("EXTREME",   (43.0, 48.0), 37.0, 4.0, "EXTREME"),
]


def _coord_hash_float(lat: float, lon: float, salt: str = "") -> float:
    """
    Deterministic 0-1 float derived from coordinates.
    Same lat/lon always produces the same value.
    """
    key = f"{lat:.4f},{lon:.4f},{salt}"
    digest = hashlib.md5(key.encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _pick_scenario(lat: float, lon: float) -> dict:
    """
    Map coordinates to a demo scenario deterministically.
    The scenario is stable: same location always gives same scenario.
    """
    h = _coord_hash_float(lat, lon, "scenario")
    idx = int(h * len(_DEMO_SCENARIOS)) % len(_DEMO_SCENARIOS)
    name, (t_min, t_max), hist_avg, hist_std, label = _DEMO_SCENARIOS[idx]
    # Temp within the range, also deterministic
    t_frac = _coord_hash_float(lat, lon, "temp")
    temp_c = round(t_min + t_frac * (t_max - t_min), 1)
    return {
        "scenario": name,
        "temp_c": temp_c,
        "historical_avg": hist_avg,
        "historical_std": hist_std,
        "risk_label": label,
    }


def _mock_current(lat: float, lon: float) -> dict:
    """
    Generate deterministic mock current temperature data.
    Returns the same result for the same coordinates.
    """
    s = _pick_scenario(lat, lon)
    temp_c = s["temp_c"]

    # Humidity: deterministic, slightly elevated for warm scenarios
    h_frac = _coord_hash_float(lat, lon, "humidity")
    base_humidity = 40.0 + (temp_c - 22.0) * 1.2 + h_frac * 15.0
    relative_humidity = round(min(95.0, max(20.0, base_humidity)), 1)

    # Apparent temperature / heat index: add humidity-based offset
    # Simplified heat-index approximation for mock purposes
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
        "solar_ghi": None,  # Not fabricated without real sensor data
        "source": "MOCK_DETERMINISTIC",
        "scenario": s["scenario"],
    }


def _mock_historical_average(lat: float, lon: float) -> dict:
    """Deterministic historical baseline for the given location."""
    s = _pick_scenario(lat, lon)
    return {
        "historical_avg_c": s["historical_avg"],
        "historical_std_c": s["historical_std"],
        "source": "MOCK_DETERMINISTIC",
    }


def _mock_forecast_12h(lat: float, lon: float) -> list:
    """
    Generate a deterministic 12-hour forecast.
    The forecast creates a realistic daily temperature curve
    around the current temperature, peaking in early afternoon.
    """
    s = _pick_scenario(lat, lon)
    base_temp = s["temp_c"]
    now = datetime.now()

    # Daily curve: temperatures rise toward 14:00 then fall
    # Offset pattern (relative to base): morning cool, afternoon peak, evening drop
    hour_offsets = [
        -2.5, -2.0, -1.5, -0.8, 0.0, 0.5,
        1.5, 2.0, 2.5, 1.5, 0.5, -0.5,
    ]

    forecast = []
    for i, offset in enumerate(hour_offsets):
        t = now + timedelta(hours=i + 1)
        hour_label = t.strftime("%H:00")
        # Add small deterministic variation per hour
        variation = _coord_hash_float(lat + i * 0.001, lon + i * 0.001, f"hour{i}") * 0.6 - 0.3
        temp_c = round(base_temp + offset + variation, 1)
        # Humidity: inversely correlated with temp variation
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
#  PUBLIC CLIENT FUNCTIONS
# ===========================================================================


def get_current_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature for a US coordinate.
    Raises ValueError if coordinates are outside the US.
    Returns dict with temp_c, apparent_temp_c, heat_index_c,
    relative_humidity, wet_bulb_c, solar_ghi, lat, lon, source.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_current(lat, lon)

    # --- REAL FortyGuard API CALL ---
    # FortyGuard uses an async activity_id workflow:
    # 1. POST to submit the request -> get activity_id
    # 2. Poll GET /v1/status/{activity_id} until status == "Completed"
    # 3. Extract result from completed response
    raise NotImplementedError(
        "Real FortyGuard API integration: set FORTYGUARD_API_KEY and implement below."
    )


def get_forecast_12h(lat: float, lon: float) -> list:
    """
    Fetch 12-hour hourly forecast for a US coordinate.
    Returns list of dicts with: hour_offset, time, temp_c,
    apparent_temp_c, heat_index_c, relative_humidity.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_forecast_12h(lat, lon)

    # --- REAL FortyGuard API CALL ---
    raise NotImplementedError(
        "Real FortyGuard forecast integration: implement with activity_id workflow."
    )


def get_historical_average(lat: float, lon: float) -> float:
    """
    Fetch historical average temperature for the current season at this location.
    Returns the mean temperature in Celsius.

    Note: Use get_historical_data() for the full dict including std_c.
    This function is kept for backward compatibility with existing callers.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        data = _mock_historical_average(lat, lon)
        return data["historical_avg_c"]

    # --- REAL FortyGuard API CALL ---
    raise NotImplementedError(
        "Real FortyGuard historical data integration: implement with activity_id workflow."
    )


def get_historical_data(lat: float, lon: float) -> dict:
    """
    Fetch full historical baseline including mean and std_c.
    Returns dict: {historical_avg_c, historical_std_c, source}

    This is preferred over get_historical_average() as it enables
    z-score anomaly detection in the AI engine.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_historical_average(lat, lon)

    # --- REAL FortyGuard API CALL ---
    raise NotImplementedError(
        "Real FortyGuard historical baseline integration: implement with activity_id workflow."
    )


# ===========================================================================
#  FORTYGUARD ASYNC WORKFLOW STUB
#
#  When USE_MOCK = False, the real FortyGuard API uses an async pattern:
#  POST endpoint -> activity_id -> poll status -> get result
#
#  Example integration pattern (not yet activated):
# ===========================================================================


def _fortyguard_submit_request(endpoint: str, payload: dict) -> str:
    """Submit a request to FortyGuard and return the activity_id."""
    headers = {"api-key": FORTYGUARD_API_KEY, "Content-Type": "application/json"}
    resp = requests.post(
        f"{FORTYGUARD_BASE_URL}/{endpoint}",
        json=payload,
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["activity_id"]


def _fortyguard_poll_result(activity_id: str) -> dict:
    """Poll FortyGuard status endpoint until result is ready."""
    headers = {"api-key": FORTYGUARD_API_KEY}
    deadline = time.time() + FORTYGUARD_TIMEOUT
    while time.time() < deadline:
        resp = requests.get(
            f"{FORTYGUARD_BASE_URL}/status/{activity_id}",
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "").lower()
        if status == "completed":
            return data.get("result", {})
        elif status == "failed":
            raise RuntimeError(f"FortyGuard request failed: {data.get('error', 'unknown')}")
        time.sleep(FORTYGUARD_POLL_INTERVAL)
    raise TimeoutError(f"FortyGuard request timed out after {FORTYGUARD_TIMEOUT}s.")
