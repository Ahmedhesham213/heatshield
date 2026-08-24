# 🛡️ HeatShield API — Backend

Single endpoint: give it `lat` + `lon`, get back everything the frontend needs.

## 🚀 Run it

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open **http://localhost:8000/docs** for the interactive Swagger UI —
you can test the endpoint directly in the browser, no Postman needed.

## 📡 The Endpoint

```
GET /api/heat-risk?lat=40.7829&lon=-73.9654
```

### Example response

```json
{
  "location": {"lat": 40.7829, "lon": -73.9654},
  "current_temp_c": 32.9,
  "current_temp_f": 91.2,
  "feels_like_c": 34.4,
  "risk_score": 42,
  "risk_level": "moderate",
  "risk_label": "Moderate",
  "risk_emoji": "🟡",
  "risk_factors": {
    "temperature": 50,
    "historical_gap": 0,
    "heat_duration": 87
  },
  "historical_avg_c": 33.9,
  "vs_historical": {
    "is_unusual": false,
    "diff": -1.0,
    "message": "Normal range for this location (-1.0°C vs. average)"
  },
  "peak_next_12h": {
    "peak_temp": 38.0,
    "peak_time": "01:27",
    "window_start": "23:27",
    "window_end": "03:27"
  },
  "forecast_12h": [ {"hour_offset": 0, "time": "20:27", "temp_c": 34.0, "level": "moderate", "emoji": "🟡", "label": "Moderate"}, ... ],
  "ai_recommendation": "Moderate Risk — Outdoor activity is generally fine, but stay hydrated between 23:27 and 03:27."
}
```

This matches the frontend mock directly: `risk_factors` maps to the "Why is
risk high?" breakdown cards, `forecast_12h` feeds the chart, and
`ai_recommendation` is the personalized safety line.

## 🔌 Connecting Real FortyGuard Data

Right now `fortyguard_client.py` runs on **mock data** so the whole pipeline
works immediately without waiting on API access.

To switch to real FortyGuard data:

1. Open `fortyguard_client.py`
2. Set `USE_MOCK = False`
3. Fill in `FORTYGUARD_API_KEY` and `FORTYGUARD_BASE_URL`
4. Adjust the request params / response parsing in each function to match
   FortyGuard's actual field names (check the dashboard's API docs / Settings page)

**Nothing else needs to change** — `risk_engine.py` and `main.py` don't care
where the numbers come from.

## 🧠 How the Risk Score (0-100) Works

Three weighted factors, matching the frontend's factor-breakdown UI:

| Factor | Weight | What it measures |
|---|---|---|
| Temperature | 50% | Absolute severity, scaled 20°C→46°C = 0→100 |
| Historical gap | 30% | How much hotter than usual for *this exact spot* |
| Heat duration | 20% | Proximity to today's predicted peak |

Deliberately simple and explainable in one sentence to judges — no black-box
ML, which keeps it technically defensible.

## 📁 Files

```
heatshield_api/
├── main.py                # FastAPI app + the /api/heat-risk endpoint
├── risk_engine.py          # Scoring logic + AI recommendation text
├── fortyguard_client.py    # API client (mock + real FortyGuard calls)
├── requirements.txt
└── README.md
```

## ✅ Tested

Endpoint verified working end-to-end with mock data — returns valid JSON,
`/docs` Swagger UI loads correctly, CORS is open for frontend dev.
