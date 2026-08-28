"""
HeatShield API -- FortyGuard Hackathon 2026 | Team Nexio
==========================================================
FastAPI backend with SQLite database user authentication, US-only FortyGuard
API checks, HeatShield Explainable AI Heat Risk Engine, and nearby safer
micro-zone detection.

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
"""

from fastapi import FastAPI, Query, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any

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
from fortyguard_client import (
    get_current_temperature,
    get_forecast_12h,
    get_historical_average,
    get_historical_data,
    is_in_us,
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

app = FastAPI(
    title="HeatShield API",
    description=(
        "HeatShield Explainable AI Heat Risk Engine -- "
        "powered by FortyGuard hyper-local temperature intelligence. "
        "Provides 0-100 risk scores, 5-level classification, historical "
        "anomaly detection, forecast persistence analysis, and peak heat "
        "window identification. Model: heatshield-risk-v1."
    ),
    version="2.1.0",
)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


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
    # Extended fields (optional -- don't break existing frontend)
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
        user = create_user(req.name, req.email, req.password)
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


@app.get("/api/heat-risk", response_model=HeatRiskResponse)
def get_heat_risk(
    lat: float = Query(..., description="Latitude", examples=[40.7128]),
    lon: float = Query(..., description="Longitude", examples=[-74.0060]),
):
    """
    Given a US coordinate, returns the full HeatShield AI risk analysis:
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
    """
    if not is_in_us(lat, lon):
        raise HTTPException(
            status_code=400,
            detail="This service is currently available only in the United States.",
        )

    # ------------------------------------------------------------------
    # 1. Fetch data from FortyGuard client
    # ------------------------------------------------------------------
    try:
        current_data = get_current_temperature(lat, lon)
        forecast_data = get_forecast_12h(lat, lon)
        hist_data = get_historical_data(lat, lon)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FortyGuard API error: {e}")

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

    baseline = HistoricalBaseline(
        mean_c=hist_data["historical_avg_c"],
        std_c=hist_data.get("historical_std_c"),
        percentile=hist_data.get("historical_percentile"),
    )

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
    # 3. Run the AI engine
    # ------------------------------------------------------------------
    analysis = analyze_heat_risk(snapshot, baseline, forecast_points)

    # ------------------------------------------------------------------
    # 4. Determine feels_like_c
    #    Priority: heat_index_c > apparent_temp_c > temp + 1.5 (fallback only)
    # ------------------------------------------------------------------
    if current_data.get("heat_index_c") is not None:
        feels_like_c = round(current_data["heat_index_c"], 1)
    elif current_data.get("apparent_temp_c") is not None:
        feels_like_c = round(current_data["apparent_temp_c"], 1)
    else:
        # Fallback: labeled as estimated, not real data
        feels_like_c = round(current_data["temp_c"] + 1.5, 1)

    # ------------------------------------------------------------------
    # 5. Map engine output to frontend contract
    #    - temperature = thermal severity (primary heat stress indicator)
    #    - historical_gap = anomaly score (how unusual today is)
    #    - heat_duration = persistence score (true temporal exposure)
    # ------------------------------------------------------------------
    risk_factors = RiskFactors(
        temperature=round(analysis.thermal_score),
        historical_gap=round(analysis.anomaly_score),
        heat_duration=round(analysis.persistence_score),
    )

    # vs_historical: add backward-compatible 'message' field
    vs_historical = dict(analysis.anomaly)
    if "anomaly_description" in vs_historical and "message" not in vs_historical:
        vs_historical["message"] = vs_historical["anomaly_description"]
    vs_historical["diff"] = vs_historical.get("diff", 0)
    vs_historical["is_unusual"] = vs_historical.get("is_unusual", False)
    vs_historical["historical_average"] = vs_historical.get("historical_average") or round(baseline.mean_c, 1)

    # peak_next_12h: ensure all fields the frontend needs exist
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
        historical_avg_c=round(baseline.mean_c, 1),
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
        data_source="MOCK_DETERMINISTIC" if current_data.get("source") == "MOCK_DETERMINISTIC" else "FORTYGUARD_LIVE",
    )


# ===========================================================================
#  NEARBY SAFER ENDPOINT
# ===========================================================================


@app.get("/api/nearby-safer", response_model=SaferNearbyResponse)
def get_nearby_safer(
    lat: float = Query(..., description="Latitude", examples=[40.7128]),
    lon: float = Query(..., description="Longitude", examples=[-74.0060]),
    radius_m: float = Query(300, description="Search radius in meters", ge=50, le=2000),
):
    """
    Finds the coolest nearby point within `radius_m` meters by sampling
    8 directions around the given US coordinate.
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
        raise HTTPException(status_code=502, detail=f"FortyGuard API error: {e}")

    maps_url = (
        f"https://www.google.com/maps/dir/?api=1"
        f"&destination={result['lat']},{result['lon']}"
    )
    return SaferNearbyResponse(**result, maps_url=maps_url)


# ===========================================================================
#  ROOT / HEALTH CHECK
# ===========================================================================


@app.get("/")
def root():
    return {
        "status": "HeatShield API is running",
        "version": "2.1.0",
        "model": "heatshield-risk-v1",
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
        ],
    }
