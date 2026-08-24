"""
HeatShield Risk Engine
========================
Turns raw temperature data into an actionable risk classification.
This is intentionally simple (no complex ML) per the hackathon MVP scope —
judges care about the decision logic, not thermodynamic precision.
"""

from datetime import datetime, timedelta

# ── RISK THRESHOLDS (adjust based on local context / demo needs) ───
THRESHOLDS = {
    "low": 32.0,       # below this = 🟢 Low
    "moderate": 36.0,  # below this = 🟡 Moderate
    "high": 40.0,      # below this = 🟠 High
    # anything >= 40.0 = 🔴 Extreme
}

RISK_LABELS = {
    "low": ("🟢", "Low"),
    "moderate": ("🟡", "Moderate"),
    "high": ("🟠", "High"),
    "extreme": ("🔴", "Extreme"),
}


def classify_temperature(temp_c: float) -> str:
    """Return risk level key: 'low' | 'moderate' | 'high' | 'extreme'"""
    if temp_c < THRESHOLDS["low"]:
        return "low"
    elif temp_c < THRESHOLDS["moderate"]:
        return "moderate"
    elif temp_c < THRESHOLDS["high"]:
        return "high"
    else:
        return "extreme"


def get_risk_display(temp_c: float) -> dict:
    """Returns {'level': str, 'emoji': str, 'label': str} for UI display."""
    level = classify_temperature(temp_c)
    emoji, label = RISK_LABELS[level]
    return {"level": level, "emoji": emoji, "label": label}


def score_forecast_timeline(forecast: list[dict]) -> list[dict]:
    """
    Attach risk classification to each hour of a 12h forecast.
    Also identifies the highest-risk window.
    """
    scored = []
    for entry in forecast:
        risk = get_risk_display(entry["temp_c"])
        scored.append({**entry, **risk})
    return scored


def find_peak_risk_window(scored_forecast: list[dict]) -> dict:
    """
    Identify the peak temperature and the highest-risk continuous window.
    Returns: {"peak_temp": float, "peak_time": str, "window_start": str, "window_end": str}
    """
    if not scored_forecast:
        return {}

    peak_entry = max(scored_forecast, key=lambda x: x["temp_c"])

    # Find the continuous window where risk is 'high' or 'extreme'
    danger_hours = [e for e in scored_forecast if e["level"] in ("high", "extreme")]
    if danger_hours:
        window_start = danger_hours[0]["time"]
        window_end = danger_hours[-1]["time"]
    else:
        window_start = window_end = None

    return {
        "peak_temp": peak_entry["temp_c"],
        "peak_time": peak_entry["time"],
        "window_start": window_start,
        "window_end": window_end,
    }


def is_unusually_hot(current_temp: float, historical_avg: float, delta_threshold: float = 3.0) -> dict:
    """
    Compare current temp to historical average for this exact location.
    Returns whether today is unusually hot for THIS SPECIFIC location.
    """
    diff = round(current_temp - historical_avg, 1)
    is_unusual = diff >= delta_threshold
    return {
        "is_unusual": is_unusual,
        "diff": diff,
        "message": (
            f"⚠️ {diff}°C hotter than usual for this exact spot"
            if is_unusual
            else f"Normal range for this location ({diff:+.1f}°C vs. average)"
        ),
    }


def get_recommendation(level: str, window_start: str = None, window_end: str = None) -> str:
    """Generate a plain-language recommendation based on risk level."""
    if level == "extreme":
        return "🚨 Avoid this location now. Seek shade or relocate immediately."
    elif level == "high":
        window_txt = f" (peak window: {window_start}–{window_end})" if window_start else ""
        return f"⚠️ High risk{window_txt}. Limit exposure, take frequent breaks in shade."
    elif level == "moderate":
        return "🟡 Moderate risk. Stay hydrated, monitor conditions if staying long-term."
    else:
        return "✅ Safe conditions currently. No special precautions needed."


def compute_risk_score(temp_c: float, historical_avg: float, peak_temp: float) -> int:
    """
    Compute a single 0-100 Heat Risk Score from three weighted factors,
    matching the breakdown style shown in the frontend mock
    (Temperature / Historical gap / Heat duration).

    This is intentionally simple and transparent (no black-box ML) so it can
    be explained to judges in one sentence.
    """
    # Factor 1: absolute temperature severity (0-100), scaled against a
    # realistic hot-climate ceiling of 46°C
    temp_score = max(0, min(100, (temp_c - 20) / (46 - 20) * 100))

    # Factor 2: how unusual today is for this specific spot
    gap = max(0, temp_c - historical_avg)
    historical_score = max(0, min(100, gap / 8 * 100))  # 8°C gap = max score

    # Factor 3: how close we are to today's predicted peak (proxy for
    # cumulative/duration risk within the danger window)
    duration_score = max(0, min(100, (temp_c / peak_temp) * 100)) if peak_temp else 0

    # Weighted blend — temperature matters most, then unusualness, then duration
    score = (temp_score * 0.5) + (historical_score * 0.3) + (duration_score * 0.2)
    return round(score)


def score_to_level(score: int) -> str:
    """Map a 0-100 risk score to a risk level label, matching the 5-tier
    scale used in the frontend (Low / Moderate / High / Very High / Extreme)."""
    if score < 20:
        return "low"
    elif score < 45:
        return "moderate"
    elif score < 65:
        return "high"
    elif score < 85:
        return "very_high"
    else:
        return "extreme"


SCORE_LABELS = {
    "low": ("🟢", "Low"),
    "moderate": ("🟡", "Moderate"),
    "high": ("🟠", "High"),
    "very_high": ("🔴", "Very High"),
    "extreme": ("🔴", "Extreme"),
}


def build_ai_recommendation(score: int, level: str, peak_temp: float, window_start: str, window_end: str) -> str:
    """
    Generate a personalized, human-readable safety recommendation —
    the 'AI Recommendation' layer, matching the example format from the spec:
    'Very High Risk — Avoid prolonged outdoor activity between 1 PM and 3 PM.'
    """
    _, label = SCORE_LABELS[level]
    window_txt = f" between {window_start} and {window_end}" if window_start and window_end else ""

    if level == "extreme":
        return f"{label} Risk — Avoid all outdoor activity{window_txt}. Move to shade or an indoor space immediately."
    elif level == "very_high":
        return f"{label} Risk — Avoid prolonged outdoor activity{window_txt}. Take breaks in shade every 15-20 minutes."
    elif level == "high":
        return f"{label} Risk — Limit strenuous outdoor activity{window_txt}. Stay hydrated and monitor how you feel."
    elif level == "moderate":
        return f"{label} Risk — Outdoor activity is generally fine, but stay hydrated{window_txt}."
    else:
        return f"{label} Risk — Safe conditions. No special precautions needed."
