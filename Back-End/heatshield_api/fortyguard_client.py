"""
FortyGuard API Client
======================
Handles pulling hyper-local temperature data from FortyGuard API.
Enforces United States regional coverage check as required by FortyGuard docs.
Supports FortyGuard asynchronous request (activity_id) status workflow.
"""

import time
import random
import requests
from datetime import datetime, timedelta

# ── CONFIG ────────────────────────────────────────────────────────
USE_MOCK = True  # flip to False when real FortyGuard API key is available
FORTYGUARD_API_KEY = "YOUR_API_KEY_HERE"
FORTYGUARD_BASE_URL = "https://api.fortyguard.example/v1"


def is_in_us(lat: float, lon: float) -> bool:
    """
    Validates whether given coordinates fall within the United States
    (Contiguous US, Alaska, Hawaii, Puerto Rico).
    FortyGuard API is restricted to US coverage.
    """
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


def get_current_temperature(lat: float, lon: float) -> dict:
    """
    Fetch current temperature for a US coordinate.
    Raises ValueError if coordinates are outside the US.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_current(lat, lon)

    # --- REAL FortyGuard API CALL with Async Activity ID Handling ---
    headers = {"api-key": FORTYGUARD_API_KEY, "Accept": "application/json"}
    
    # 1. Post request for temperature calculation
    url_req = f"{FORTYGUARD_BASE_URL}/temperature/request"
    payload = {"latitude": lat, "longitude": lon}
    resp = requests.post(url_req, json=payload, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    # Async workflow: if response returns activity_id, poll status
    if "activity_id" in data:
        activity_id = data["activity_id"]
        url_status = f"{FORTYGUARD_BASE_URL}/status/{activity_id}"
        
        # Poll up to 5 times (1 second interval)
        for _ in range(5):
            time.sleep(1)
            s_resp = requests.get(url_status, headers=headers, timeout=5)
            s_resp.raise_for_status()
            s_data = s_resp.json()
            
            if s_data.get("status") == "completed":
                temp = s_data.get("result", {}).get("temperature")
                return {
                    "lat": lat,
                    "lon": lon,
                    "temp_c": round(temp, 1),
                    "timestamp": datetime.now().isoformat(),
                }
            elif s_data.get("status") == "failed":
                raise RuntimeError(f"FortyGuard activity {activity_id} failed.")

    # Synchronous response fallback
    temp = data.get("temperature", 30.0)
    return {
        "lat": lat,
        "lon": lon,
        "temp_c": round(temp, 1),
        "timestamp": data.get("timestamp", datetime.now().isoformat()),
    }


def get_forecast_12h(lat: float, lon: float) -> list[dict]:
    """
    Fetch 12-hour forecast for a US coordinate.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return _mock_forecast(lat, lon)

    headers = {"api-key": FORTYGUARD_API_KEY}
    url = f"{FORTYGUARD_BASE_URL}/forecast"
    params = {"lat": lat, "lon": lon, "hours": 12}
    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()["hourly"]


def get_historical_average(lat: float, lon: float, days_back: int = 7) -> float:
    """
    Fetch historical average temperature for a US location.
    """
    if not is_in_us(lat, lon):
        raise ValueError("This service is currently available only in the United States.")

    if USE_MOCK:
        return round(random.uniform(28, 34), 1)

    headers = {"api-key": FORTYGUARD_API_KEY}
    url = f"{FORTYGUARD_BASE_URL}/historical"
    params = {"lat": lat, "lon": lon, "days": days_back}
    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()["average_temp_c"]


# ── MOCK GENERATORS (US Locations Only) ───────────────────────────
def _mock_current(lat: float, lon: float) -> dict:
    seed = int((abs(lat) + abs(lon)) * 1000) % 100
    base = 31 + (seed % 14)  # varies 31–45°C
    return {
        "lat": lat,
        "lon": lon,
        "temp_c": round(base + random.uniform(-0.3, 0.3), 1),
        "timestamp": datetime.now().isoformat(),
    }


def _mock_forecast(lat: float, lon: float) -> list[dict]:
    seed = int((abs(lat) + abs(lon)) * 1000) % 100
    base = 31 + (seed % 14)
    now = datetime.now()
    forecast = []
    for h in range(12):
        peak_boost = max(0, 6 - abs(h - 5)) * 0.85
        temp = round(base + peak_boost + random.uniform(-0.3, 0.3), 1)
        forecast.append({
            "hour_offset": h,
            "temp_c": temp,
            "time": (now + timedelta(hours=h)).strftime("%H:%M"),
        })
    return forecast
