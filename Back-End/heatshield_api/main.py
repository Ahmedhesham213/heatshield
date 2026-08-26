"""
HeatShield API — FortyGuard Hackathon 2026 | Team Nexio
==========================================================
FastAPI backend with SQLite database user authentication, US-only FortyGuard API checks,
heat risk scoring engine, and nearby safer micro-zone detection.

Run with:
    py -m uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, Query, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional

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
    is_in_us,
)
from risk_engine import (
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
    description="AI Heat-Risk Radar for People — powered by FortyGuard hyper-local temperature data",
    version="2.0.0",
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


# ── AUTH DEPENDENCY ────────────────────────────────────────────────
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication token required.")
    token = authorization.split(" ")[1]
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    return user


# ── REQUEST & RESPONSE SCHEMAS ──────────────────────────────────────
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


class RiskFactors(BaseModel):
    temperature: int
    historical_gap: int
    heat_duration: int


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


# ── AUTH ENDPOINTS ──────────────────────────────────────────────────
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


# ── SAVED LOCATIONS ENDPOINTS ───────────────────────────────────────
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


# ── HEAT RISK ENDPOINTS ──────────────────────────────────────────────
@app.get("/api/heat-risk", response_model=HeatRiskResponse)
def get_heat_risk(
    lat: float = Query(..., description="Latitude", examples=[40.7128]),
    lon: float = Query(..., description="Longitude", examples=[-74.0060]),
):
    """
    Given a US coordinate, returns current temperature, 0-100 Heat Risk Score,
    12-hour forecast, and AI safety recommendation.
    """
    # Enforce FortyGuard US coverage requirement
    if not is_in_us(lat, lon):
        raise HTTPException(
            status_code=400,
            detail="This service is currently available only in the United States.",
        )

    try:
        current = get_current_temperature(lat, lon)
        forecast = get_forecast_12h(lat, lon)
        hist_avg = get_historical_average(lat, lon)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FortyGuard API error: {e}")

    scored_forecast = score_forecast_timeline(forecast)
    peak_info = find_peak_risk_window(scored_forecast)
    unusual = is_unusually_hot(current["temp_c"], hist_avg)

    score = compute_risk_score(current["temp_c"], hist_avg, peak_info.get("peak_temp", current["temp_c"]))
    level = score_to_level(score)
    emoji, label = SCORE_LABELS[level]

    temp_factor = round(max(0, min(100, (current["temp_c"] - 20) / (46 - 20) * 100)))
    hist_factor = round(max(0, min(100, max(0, current["temp_c"] - hist_avg) / 8 * 100)))
    duration_factor = round(
        max(0, min(100, (current["temp_c"] / peak_info["peak_temp"]) * 100))
        if peak_info.get("peak_temp") else 0
    )

    ai_recommendation = build_ai_recommendation(
        score, level, peak_info.get("peak_temp"), peak_info.get("window_start"), peak_info.get("window_end")
    )

    return HeatRiskResponse(
        location={"lat": lat, "lon": lon},
        current_temp_c=current["temp_c"],
        current_temp_f=round(current["temp_c"] * 9 / 5 + 32, 1),
        feels_like_c=round(current["temp_c"] + 1.5, 1),
        risk_score=score,
        risk_level=level,
        risk_label=label,
        risk_emoji=emoji,
        risk_factors=RiskFactors(
            temperature=temp_factor,
            historical_gap=hist_factor,
            heat_duration=duration_factor,
        ),
        historical_avg_c=hist_avg,
        vs_historical=unusual,
        peak_next_12h=peak_info,
        forecast_12h=[ForecastHour(**hour) for hour in scored_forecast],
        ai_recommendation=ai_recommendation,
    )


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

    maps_url = f"https://www.google.com/maps/dir/?api=1&destination={result['lat']},{result['lon']}"

    return SaferNearbyResponse(**result, maps_url=maps_url)


@app.get("/")
def root():
    return {
        "status": "HeatShield API is running",
        "version": "2.0.0",
        "docs": "/docs",
        "endpoints": [
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/me",
            "/api/user/saved-locations",
            "/api/heat-risk?lat=40.7128&lon=-74.0060",
            "/api/nearby-safer?lat=40.7128&lon=-74.0060&radius_m=300",
        ],
    }
