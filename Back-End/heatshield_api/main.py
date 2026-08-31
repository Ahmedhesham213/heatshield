"""
HeatShield API -- FortyGuard Hackathon 2026 | Team Nexio
==========================================================
FastAPI backend with SQLite database user authentication, FortyGuard
real-data integration, HeatShield Explainable AI Heat Risk Engine,
and nearby safer micro-zone detection.

Configuration (environment variables):
    FORTYGUARD_API_KEY       - Your FortyGuard API key
    FORTYGUARD_BASE_URL      - FortyGuard base URL (default: https://api.fortyguard.com/v1)
    USE_MOCK                 - true/false (auto-detected if not set)
    FORTYGUARD_POLL_INTERVAL - Seconds between polls (default: 3.0)
    FORTYGUARD_TIMEOUT       - Max seconds to wait (default: 90.0)

Run with:
    py -m uvicorn main:app --reload --port 8000

Endpoints:
    GET  /                                  -- health check
    POST /api/auth/register                 -- user registration
    POST /api/auth/login                    -- user login
    GET  /api/auth/me                       -- current user
    POST /api/auth/logout                   -- logout
    GET  /api/user/saved-locations          -- list saved locations
    POST /api/user/saved-locations          -- save a location
    DEL  /api/user/saved-locations/{id}     -- delete a saved location
    GET  /api/heat-risk?lat=&lon=           -- AI heat risk analysis (MAIN)
    GET  /api/nearby-safer?lat=&lon=        -- find cooler nearby location
    GET  /api/heatmap?lat=&lon=             -- hyper-local thermal heatmap
"""

import os
import logging
from fastapi import FastAPI, Query, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any

# ── configure basic logging ──────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("heatshield.main")

from database import (
    init_db,
    create_user,
    authenticate_user,
    get_user_by_token,
    delete_session,
    get_saved_locations,
    add_saved_location,
    delete_saved_location,
)
import fortyguard_client as _fg
from fortyguard_client import (
    get_current_temperature,
    get_forecast_12h,
    get_historical_average,
    get_historical_data,
    get_heatmap_data,
    is_in_us,
    USE_MOCK,
)
from risk_engine import (
    HeatSnapshot,
    HistoricalBaseline,
    ForecastPoint,
    analyze_heat_risk,
    score_forecast_timeline,
    find_peak_risk_window,
    is_unusually_hot,
    compute_risk_score,
    score_to_level,
    build_ai_recommendation,
    find_safer_nearby,
    SCORE_LABELS,
)

# ── CORS origins ─────────────────────────────────────────────────────────
# Reads from CORS_ORIGINS env var (comma-separated) or defaults to wildcard.
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_env.split(",")] if _cors_env else ["*"]

app = FastAPI(
    title="HeatShield API",
    description=(
        "HeatShield Explainable AI Heat Risk Engine -- "
        "powered by FortyGuard hyper-local temperature intelligence. "
        "Provides 0-100 risk scores, 5-level classification, historical "
        "anomaly detection, forecast persistence analysis, and peak heat "
        "window identification. Model: heatshield-risk-v1."
    ),
    version="3.0.0",
)

if "*" in _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )


@app.on_event("startup")
def on_startup():
    init_db()
    mode = "MOCK (deterministic)" if USE_MOCK else "LIVE (FortyGuard real data)"
    logger.info("HeatShield API started — data mode: %s", mode)


# ===========================================================================
#  AUTH DEPENDENCY
# ===========================================================================


def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication token required.")
    token = authorization.split(" ")[1]
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    return user


# ===========================================================================
#  REQUEST & RESPONSE SCHEMAS
# ===========================================================================


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class SavedLocationRequest(BaseModel):
    name: str
    lat: float
    lon: float


class ForecastHour(BaseModel):
    hour_offset: int
    time: str
    temp_c: float
    level: str
    emoji: str
    label: str
    risk_score: Optional[int] = None
    thermal_score: Optional[float] = None


class RiskFactors(BaseModel):
    temperature: int    # thermal severity score (0-100)
    historical_gap: int # anomaly score (0-100)
    heat_duration: int  # persistence/exposure score (0-100)


class HeatRiskResponse(BaseModel):
    location: dict
    current_temp_c: float
    current_temp_f: float
    feels_like_c: Optional[float] = None
    risk_score: int
    risk_level: str
    risk_label: str
    risk_emoji: str
    risk_factors: RiskFactors
    historical_avg_c: float
    vs_historical: dict
    peak_next_12h: dict
    forecast_12h: list[ForecastHour]
    ai_recommendation: str
    # Extended fields (optional -- do not break existing frontend)
    explainability: Optional[dict] = None
    persistence_detail: Optional[dict] = None
    data_source: Optional[str] = None


class SaferNearbyResponse(BaseModel):
    base_temp_c: float
    safer_temp_c: float
    delta_c: float
    distance_m: float
    direction: str
    lat: float
    lon: float
    is_meaningfully_cooler: bool
    maps_url: str


# ===========================================================================
#  AUTH ENDPOINTS
# ===========================================================================


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    if len(req.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    try:
        create_user(req.name, req.email, req.password)
        auth_data = authenticate_user(req.email, req.password)
        return auth_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/login")
def login(req: LoginRequest):
    try:
        return authenticate_user(req.email, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": user}


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        delete_session(token)
    return {"status": "success"}


# ===========================================================================
#  SAVED LOCATIONS ENDPOINTS
# ===========================================================================


@app.get("/api/user/saved-locations")
def list_locations(user: dict = Depends(get_current_user)):
    return get_saved_locations(user["id"])


@app.post("/api/user/saved-locations")
def save_location(req: SavedLocationRequest, user: dict = Depends(get_current_user)):
    if not is_in_us(req.lat, req.lon):
        raise HTTPException(
            status_code=400,
            detail="Location must be within the United States.",
        )
    return add_saved_location(user["id"], req.name, req.lat, req.lon)


@app.delete("/api/user/saved-locations/{location_id}")
def remove_location(location_id: int, user: dict = Depends(get_current_user)):
    delete_saved_location(user["id"], location_id)
    return {"status": "deleted"}


# ===========================================================================
#  HEAT RISK ENDPOINT -- MAIN AI ENGINE INTEGRATION
# ===========================================================================


@app.head("/api/heat-risk")
def head_heat_risk():
    return {}


@app.get("/api/heat-risk", response_model=HeatRiskResponse)
def get_heat_risk(
    lat: float = Query(..., description="Latitude", examples=[40.7128]),
    lon: float = Query(..., description="Longitude", examples=[-74.0060]),
):
    """
    Given a coordinate, returns the full HeatShield AI risk analysis:
      - 0-100 Heat Risk Score (heatshield-risk-v1 model)
      - 5-level risk classification (Low/Moderate/High/Very High/Extreme)
      - Current thermal severity analysis
      - Historical temperature anomaly detection
      - 12-hour forecast risk timeline
      - True heat exposure duration / persistence
      - Peak heat window (contiguous segment detection)
      - Explainability (top drivers, factor contributions, data quality)
      - Personalized safety recommendation

    Coverage: United States only (FortyGuard API requirement).
    In MOCK mode, accepts all coordinates globally for GPS demo purposes.
    """
    if not is_in_us(lat, lon):
        raise HTTPException(
            status_code=400,
            detail="This service is currently available only in the United States.",
        )

    # ------------------------------------------------------------------
    # 1. Fetch data from FortyGuard (real or deterministic mock)
    # ------------------------------------------------------------------
    try:
        current_data = get_current_temperature(lat, lon)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except PermissionError as pe:
        raise HTTPException(status_code=502, detail="FortyGuard API authentication failed. Check FORTYGUARD_API_KEY.")
    except (TimeoutError, ConnectionError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=f"FortyGuard data service is temporarily unavailable. ({type(e).__name__})")
    except Exception as e:
        logger.exception("Unexpected error fetching current temperature")
        raise HTTPException(status_code=502, detail="FortyGuard data service encountered an unexpected error.")

    try:
        forecast_data = get_forecast_12h(lat, lon)
    except Exception as e:
        logger.warning("Forecast fetch failed (%s), proceeding with empty forecast", e)
        forecast_data = []

    try:
        hist_data = get_historical_data(lat, lon)
    except Exception as e:
        logger.warning("Historical data fetch failed (%s), proceeding without baseline", e)
        hist_data = {"historical_avg_c": None, "historical_std_c": None, "source": "UNAVAILABLE"}

    # ------------------------------------------------------------------
    # 2. Build engine input structures
    # ------------------------------------------------------------------
    snapshot = HeatSnapshot(
        temp_c=current_data["temp_c"],
        apparent_temp_c=current_data.get("apparent_temp_c"),
        heat_index_c=current_data.get("heat_index_c"),
        wet_bulb_c=current_data.get("wet_bulb_c"),
        relative_humidity=current_data.get("relative_humidity"),
        solar_ghi=current_data.get("solar_ghi"),
    )

    # If historical_avg_c is None, pass None baseline (engine handles gracefully)
    hist_avg = hist_data.get("historical_avg_c")
    baseline = HistoricalBaseline(
        mean_c=hist_avg if hist_avg is not None else current_data["temp_c"],
        std_c=hist_data.get("historical_std_c"),
        percentile=hist_data.get("historical_percentile"),
    ) if hist_avg is not None else None

    forecast_points = [
        ForecastPoint(
            hour_offset=h["hour_offset"],
            time=h["time"],
            temp_c=h["temp_c"],
            apparent_temp_c=h.get("apparent_temp_c"),
            heat_index_c=h.get("heat_index_c"),
        )
        for h in forecast_data
    ]

    # ------------------------------------------------------------------
    # 3. Run the explainable AI engine
    # ------------------------------------------------------------------
    analysis = analyze_heat_risk(snapshot, baseline, forecast_points)

    # ------------------------------------------------------------------
    # 4. Determine feels_like_c
    #    Priority: real heat_index > real apparent_temp > raw temp
    #    Do NOT add fabricated offsets to real values.
    # ------------------------------------------------------------------
    if current_data.get("heat_index_c") is not None:
        feels_like_c = round(current_data["heat_index_c"], 1)
    elif current_data.get("apparent_temp_c") is not None:
        feels_like_c = round(current_data["apparent_temp_c"], 1)
    else:
        # Last resort estimated fallback (not real FortyGuard data)
        feels_like_c = round(current_data["temp_c"] + 1.5, 1)

    # ------------------------------------------------------------------
    # 5. Map engine output to frontend contract
    # ------------------------------------------------------------------
    risk_factors = RiskFactors(
        temperature=round(analysis.thermal_score),
        historical_gap=round(analysis.anomaly_score),
        heat_duration=round(analysis.persistence_score),
    )

    # vs_historical: ensure both 'message' and 'anomaly_description' are present
    vs_historical = dict(analysis.anomaly)
    if "anomaly_description" in vs_historical and "message" not in vs_historical:
        vs_historical["message"] = vs_historical["anomaly_description"]
    if "message" not in vs_historical:
        diff = vs_historical.get("diff", 0)
        if diff > 0:
            vs_historical["message"] = f"Current temperature is {abs(diff):.1f}°C above the local historical baseline."
        elif diff < 0:
            vs_historical["message"] = f"Current temperature is {abs(diff):.1f}°C below the local historical baseline."
        else:
            vs_historical["message"] = "Current temperature matches the local historical baseline."
    vs_historical["diff"] = vs_historical.get("diff", 0)
    vs_historical["is_unusual"] = vs_historical.get("is_unusual", False)
    vs_historical["historical_average"] = vs_historical.get("historical_average") or round(
        baseline.mean_c if baseline else current_data["temp_c"], 1
    )

    # peak_next_12h: ensure all fields the frontend needs
    peak = dict(analysis.peak_window) if analysis.peak_window else {}
    peak.setdefault("peak_temp", None)
    peak.setdefault("peak_time", None)
    peak.setdefault("window_start", None)
    peak.setdefault("window_end", None)
    peak.setdefault("duration_hours", 0)
    peak.setdefault("peak_risk_level", analysis.risk_level)

    # Forecast: cast to ForecastHour schema
    forecast_12h = [
        ForecastHour(
            hour_offset=h["hour_offset"],
            time=h["time"],
            temp_c=h["temp_c"],
            level=h["level"],
            emoji=h["emoji"],
            label=h["label"],
            risk_score=h.get("risk_score"),
            thermal_score=h.get("thermal_score"),
        )
        for h in analysis.forecast_scored
    ]

    # Determine data source honestly
    raw_source = current_data.get("source", "UNKNOWN")
    if raw_source == "MOCK_DETERMINISTIC":
        data_source = "MOCK_DETERMINISTIC"
    elif raw_source in ("FORTYGUARD_LIVE", "FORTYGUARD_LIVE_PARTIAL"):
        # Downgrade to PARTIAL if historical baseline was unavailable
        if hist_data.get("source") == "UNAVAILABLE":
            data_source = "FORTYGUARD_LIVE_PARTIAL"
        else:
            data_source = "FORTYGUARD_LIVE"
    else:
        data_source = "UNKNOWN"

    # historical_avg_c to show in response
    historical_avg_display = round(baseline.mean_c, 1) if baseline else round(current_data["temp_c"], 1)

    return HeatRiskResponse(
        location={"lat": lat, "lon": lon},
        current_temp_c=current_data["temp_c"],
        current_temp_f=round(current_data["temp_c"] * 9 / 5 + 32, 1),
        feels_like_c=feels_like_c,
        risk_score=analysis.risk_score,
        risk_level=analysis.risk_level,
        risk_label=analysis.risk_label,
        risk_emoji=analysis.risk_emoji,
        risk_factors=risk_factors,
        historical_avg_c=historical_avg_display,
        vs_historical=vs_historical,
        peak_next_12h=peak,
        forecast_12h=forecast_12h,
        ai_recommendation=analysis.recommendation,
        explainability=analysis.explainability,
        persistence_detail={
            "high_risk_hours": analysis.persistence.get("high_risk_hours", 0),
            "very_high_risk_hours": analysis.persistence.get("very_high_risk_hours", 0),
            "extreme_hours": analysis.persistence.get("extreme_hours", 0),
            "longest_continuous_high_risk_hours": analysis.persistence.get(
                "longest_continuous_high_risk_hours", 0
            ),
        },
        data_source=data_source,
    )


# ===========================================================================
#  NEARBY SAFER ENDPOINT
# ===========================================================================


@app.head("/api/nearby-safer")
def head_nearby_safer():
    return {}


@app.get("/api/nearby-safer", response_model=SaferNearbyResponse)
def get_nearby_safer(
    lat: float = Query(..., description="Latitude", examples=[40.7128]),
    lon: float = Query(..., description="Longitude", examples=[-74.0060]),
    radius_m: float = Query(300, description="Search radius in meters", ge=50, le=2000),
):
    """
    Finds the coolest nearby point within radius_m meters by sampling
    8 directions around the given coordinate.

    Note: In mock mode, returns a realistic deterministic result.
    In live mode, temperatures are derived from FortyGuard heatmap data.
    The data_source field in the nearby result reflects the actual source.
    """
    if not is_in_us(lat, lon):
        raise HTTPException(
            status_code=400,
            detail="This service is currently available only in the United States.",
        )

    try:
        result = find_safer_nearby(lat, lon, radius_m=radius_m)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.warning("nearby-safer error: %s", e)
        raise HTTPException(status_code=502, detail="Unable to compute nearby safer location.")

    maps_url = (
        f"https://www.google.com/maps/dir/?api=1"
        f"&destination={result['lat']},{result['lon']}"
    )
    return SaferNearbyResponse(**result, maps_url=maps_url)


# ===========================================================================
#  HEATMAP ENDPOINT — hyper-local thermal intelligence
# ===========================================================================


@app.get("/api/heatmap")
def get_heatmap(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """
    Returns a hyper-local thermal heatmap for the area surrounding the
    given coordinate.

    Powered by FortyGuard's high-resolution thermal intelligence.
    Response includes GeoJSON map_data (if available) and temperature stats.
    """
    if not is_in_us(lat, lon):
        raise HTTPException(
            status_code=400,
            detail="This service is currently available only in the United States.",
        )

    try:
        result = get_heatmap_data(lat, lon)
    except PermissionError:
        raise HTTPException(status_code=502, detail="FortyGuard API authentication failed.")
    except (TimeoutError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=f"Heatmap service temporarily unavailable. ({type(e).__name__})")
    except Exception as e:
        logger.exception("Unexpected heatmap error")
        raise HTTPException(status_code=502, detail="Heatmap service encountered an unexpected error.")

    return {
        "location": {"lat": lat, "lon": lon},
        "map_data": result.get("map_data"),
        "stats": result.get("stats_data"),
        "source": result.get("source", "UNKNOWN"),
    }


# ===========================================================================
#  ROOT / HEALTH CHECK
# ===========================================================================


@app.head("/")
def head_root():
    return {}


@app.get("/")
def root():
    return {
        "status": "HeatShield API is running",
        "version": "3.0.0",
        "model": "heatshield-risk-v1",
        "data_mode": "MOCK_DETERMINISTIC" if USE_MOCK else "FORTYGUARD_LIVE",
        "docs": "/docs",
        "disclaimer": (
            "HeatShield provides heat-risk decision support and does not "
            "replace official weather warnings, occupational safety guidance, "
            "or medical advice."
        ),
        "endpoints": [
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/me",
            "/api/user/saved-locations",
            "/api/heat-risk?lat=40.7128&lon=-74.0060",
            "/api/nearby-safer?lat=40.7128&lon=-74.0060&radius_m=300",
            "/api/heatmap?lat=40.7128&lon=-74.0060",
        ],
    }
