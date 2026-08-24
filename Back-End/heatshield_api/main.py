"""
HeatShield API — FortyGuard Hackathon 2026 | Team Nexio
==========================================================
Single endpoint: give it lat/lon, get back everything the frontend needs —
current temperature, a 0-100 Heat Risk Score, 12h forecast, and an
AI-generated safety recommendation.

Run with:
    uvicorn main:app --reload --port 8000

Then test at:
    http://localhost:8000/docs   (interactive Swagger UI)
    http://localhost:8000/api/heat-risk?lat=40.7829&lon=-73.9654
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from fortyguard_client import get_current_temperature, get_forecast_12h, get_historical_average
from risk_engine import (
    score_forecast_timeline,
    find_peak_risk_window,
    is_unusually_hot,
    compute_risk_score,
    score_to_level,
    build_ai_recommendation,
    SCORE_LABELS,
)

app = FastAPI(
    title="HeatShield API",
    description="AI Heat-Risk Radar for People — powered by FortyGuard hyper-local temperature data",
    version="1.0.0",
)

# Allow the React frontend (any origin during hackathon dev) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── RESPONSE SCHEMA ─────────────────────────────────────────────────
class ForecastHour(BaseModel):
    hour_offset: int
    time: str
    temp_c: float
    level: str
    emoji: str
    label: str


class RiskFactors(BaseModel):
    temperature: int       # 0-100
    historical_gap: int    # 0-100
    heat_duration: int     # 0-100


class HeatRiskResponse(BaseModel):
    location: dict
    current_temp_c: float
    current_temp_f: float
    feels_like_c: Optional[float] = None
    risk_score: int          # 0-100
    risk_level: str          # low | moderate | high | very_high | extreme
    risk_label: str          # "Very High", etc.
    risk_emoji: str
    risk_factors: RiskFactors
    historical_avg_c: float
    vs_historical: dict
    peak_next_12h: dict
    forecast_12h: list[ForecastHour]
    ai_recommendation: str


# ── ENDPOINT ─────────────────────────────────────────────────────────
@app.get("/api/heat-risk", response_model=HeatRiskResponse)
def get_heat_risk(
    lat: float = Query(..., description="Latitude", example=40.7829),
    lon: float = Query(..., description="Longitude", example=-73.9654),
):
    """
    Given a coordinate, returns current temperature, a 0-100 Heat Risk Score,
    the 12-hour forecast timeline, and a personalized AI safety recommendation.
    """
    try:
        current = get_current_temperature(lat, lon)
        forecast = get_forecast_12h(lat, lon)
        hist_avg = get_historical_average(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FortyGuard API error: {e}")

    scored_forecast = score_forecast_timeline(forecast)
    peak_info = find_peak_risk_window(scored_forecast)
    unusual = is_unusually_hot(current["temp_c"], hist_avg)

    # Compute 0-100 risk score + individual factor breakdown (matches frontend UI)
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
        feels_like_c=round(current["temp_c"] + 1.5, 1),  # simple heat-index proxy for MVP
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


@app.get("/")
def root():
    return {"status": "HeatShield API is running", "docs": "/docs", "endpoint": "/api/heat-risk?lat=...&lon=..."}
