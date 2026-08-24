"""
FortyGuard API Client
======================
Handles pulling hyper-local temperature data from FortyGuard.

IMPORTANT: Replace FORTYGUARD_API_KEY and BASE_URL with your real
hackathon credentials/endpoint once you have them. Until then, this
module falls back to realistic MOCK DATA so the rest of the app
(risk engine + dashboard) can be built and demoed immediately.

To switch from mock to real data: set USE_MOCK = False below.
"""

import random
import requests
from datetime import datetime, timedelta

# ── CONFIG ────────────────────────────────────────────────────────
USE_MOCK = True  # flip to False once you have real FortyGuard API access
FORTYGUARD_API_KEY = "YOUR_API_KEY_HERE"
FORTYGUARD_BASE_URL = "https://api.fortyguard.example/v1"  # placeholder — replace with real endpoint


def get_current_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature for a specific coordinate.
    Returns: {"lat": float, "lon": float, "temp_c": float, "timestamp": str}
    """
    if USE_MOCK:
        return _mock_current(lat, lon)

    # --- REAL API CALL (adjust endpoint/params to match FortyGuard docs) ---
    url = f"{FORTYGUARD_BASE_URL}/current"
    params = {"lat": lat, "lon": lon, "key": FORTYGUARD_API_KEY}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return {
        "lat": lat,
        "lon": lon,
        "temp_c": data["temperature"],
        "timestamp": data.get("timestamp", datetime.now().isoformat()),
    }


def get_forecast_12h(lat: float, lon: float) -> list[dict]:
    """
    Fetch 12-hour hourly forecast for a specific coordinate.
    Returns: list of {"hour_offset": int, "temp_c": float, "time": str}
    """
    if USE_MOCK:
        return _mock_forecast(lat, lon)

    # --- REAL API CALL ---
    url = f"{FORTYGUARD_BASE_URL}/forecast"
    params = {"lat": lat, "lon": lon, "hours": 12, "key": FORTYGUARD_API_KEY}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data["hourly"]


def get_historical_average(lat: float, lon: float, days_back: int = 7) -> float:
    """
    Fetch historical average temperature for this location, to detect
    'is today unusually hot for this specific spot?'
    """
    if USE_MOCK:
        return round(random.uniform(30, 34), 1)

    url = f"{FORTYGUARD_BASE_URL}/historical"
    params = {"lat": lat, "lon": lon, "days": days_back, "key": FORTYGUARD_API_KEY}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()["average_temp_c"]


# ── MOCK DATA GENERATORS (for demo/dev before real API access) ─────
def _mock_current(lat: float, lon: float) -> dict:
    # Use lat/lon to seed a pseudo-consistent "microclimate" per point
    seed = int((abs(lat) + abs(lon)) * 1000) % 100
    base = 33 + (seed % 12)  # varies 33–44°C depending on location
    return {
        "lat": lat,
        "lon": lon,
        "temp_c": round(base + random.uniform(-0.5, 0.5), 1),
        "timestamp": datetime.now().isoformat(),
    }


def _mock_forecast(lat: float, lon: float) -> list[dict]:
    seed = int((abs(lat) + abs(lon)) * 1000) % 100
    base = 33 + (seed % 12)
    now = datetime.now()
    forecast = []
    for h in range(12):
        # simple bell-curve-ish peak around hour 5-6 (early afternoon)
        peak_boost = max(0, 6 - abs(h - 5)) * 0.8
        temp = round(base + peak_boost + random.uniform(-0.4, 0.4), 1)
        forecast.append({
            "hour_offset": h,
            "temp_c": temp,
            "time": (now + timedelta(hours=h)).strftime("%H:%M"),
        })
    return forecast
