# HeatShield AI — Frontend (Next.js + TypeScript)

Welcome! This README documents the HeatShield frontend project in clear, practical detail to help you run, understand, and develop the application.

---

## Overview

HeatShield is a user-facing dashboard that shows heat risk for a geographic location: current temperature, heat risk score and level, a 12-hour forecast, peak heat window, and an AI-powered recommendation. The frontend is a Next.js + TypeScript application that consumes a separate FastAPI backend running locally.

Important constraints:
- Do NOT rebuild the project from scratch.
- Keep the existing design and components; improve them where needed.
- Do NOT duplicate or replace the backend — always call the real backend API.

Frontend: Next.js + TypeScript
Backend (separate): FastAPI serving at http://localhost:8000

---

## Backend API

Primary endpoint used by the frontend:

GET ${NEXT_PUBLIC_API_URL:-http://localhost:8000}/api/heat-risk?lat={LAT}&lon={LON}

Example:

```
GET http://localhost:8000/api/heat-risk?lat=30.0444&lon=31.2357
```

Example response (the frontend must use these fields as-is):

```json
{
  "location": { "lat": 30.0444, "lon": 31.2357 },
  "current_temp_c": 32.9,
  "current_temp_f": 91.2,
  "feels_like_c": 34.4,
  "risk_score": 42,
  "risk_level": "moderate",
  "risk_label": "Moderate",
  "risk_emoji": "🟡",
  "risk_factors": { "temperature": 50, "historical_gap": 0, "heat_duration": 87 },
  "historical_avg_c": 33.9,
  "vs_historical": { "is_unusual": false, "diff": -1.0, "message": "Normal range for this location" },
  "peak_next_12h": { "peak_temp": 38.0, "peak_time": "01:27", "window_start": "23:27", "window_end": "03:27" },
  "forecast_12h": [ { "hour_offset": 0, "time": "20:27", "temp_c": 34.0, "level": "moderate", "emoji": "🟡", "label": "Moderate" } ],
  "ai_recommendation": "Moderate Risk — Outdoor activity is generally fine, but stay hydrated."
}
```

Do not fabricate or alter recommendation text or numeric fields on the frontend — display what the backend returns.

---

## Environment

Create a `.env` file in the frontend project root (Front-End/heat-shield-ai1) containing:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Never place backend secrets (e.g. FORTYGUARD_API_KEY) inside the frontend.

---

## Key Implementation Points

- services/api.ts: implement `getHeatRisk(lat, lon)` which calls `${process.env.NEXT_PUBLIC_API_URL}/api/heat-risk` and returns a typed response.
- hooks/use-geolocation.ts: handle browser geolocation. The existing "Use my location" button must work.
- Map: reuse the existing React-Leaflet map. Add a clear "Use my location" control. Allow users to click the map to select locations.
- Heat visualization: implement a heat/thermal visualization around the selected point. If only a single-point response is available, generate a clearly labeled representative gradient centered on the selected point and structure the code so a future spatial-grid API can replace it easily.
- Dashboard: replace hard-coded values with real backend fields (current_temp_c, feels_like_c, risk_score, risk_label, risk_emoji, risk_factors.*, historical_avg_c, vs_historical.*, peak_next_12h.*, forecast_12h, ai_recommendation).

---

## Geolocation & Map Behavior

- Default fallback location: Cairo (lat: 30.0444, lon: 31.2357).
- "Use my location" flow:
  1. Request browser location permission.
  2. On success: obtain user lat/lon, move the map to the location, update the user marker, call the heat-risk API, and update the dashboard without page refresh.
  3. On denial: keep the dashboard functional using the default location and show a friendly message: "Location permission was denied. Showing the default location."
- Clicking the map selects a location and triggers the same API call & dashboard update.

---

## Heat Visualization Guidelines

- Use Leaflet layers (Circle, Canvas, or a custom layer) for performance; avoid creating many React components.
- Show a smooth gradient legend (Cool → Moderate → Hot → Extreme) and include labels/icons — do not rely on color alone.
- If the backend only provides a single point, visually indicate that surrounding values are estimates, not measured data.

---

## TypeScript Interfaces (suggested)

Place these in `services/api.ts` or a `types/heat.ts` file and keep them strict:

```ts
interface Location { lat: number; lon: number }
interface RiskFactors { temperature: number; historical_gap: number; heat_duration: number }
interface VsHistorical { is_unusual: boolean; diff: number; message: string }
interface PeakNext12h { peak_temp: number; peak_time: string; window_start: string; window_end: string }
interface ForecastHour { hour_offset: number; time: string; temp_c: number; level: string; emoji: string; label: string }
interface HeatRiskResponse { location: Location; current_temp_c: number; current_temp_f?: number; feels_like_c: number; risk_score: number; risk_level: string; risk_label: string; risk_emoji?: string; risk_factors: RiskFactors; historical_avg_c?: number; vs_historical?: VsHistorical; peak_next_12h?: PeakNext12h; forecast_12h?: ForecastHour[]; ai_recommendation?: string }
```

---

## Loading & Error Handling

- Use loading skeletons or subtle loading indicators for each dashboard section while waiting for API responses.
- If the backend is unreachable, show a clear message: "HeatShield backend is unavailable. Please start the backend server." Keep the map interactive.
- Use AbortController to cancel stale requests when the location changes rapidly.
- Only request heat data when the user selects a new location (use, click, or explicit selection) — do not request on every minor map movement.

---

## Performance & UX

- Keep the map smooth by using Leaflet canvas layers and minimizing React re-renders.
- Ensure the UI is responsive: cards stack on mobile, forecast scrolls horizontally if needed, no horizontal overflow.
- Provide clear, non-technical text and icons so a first-time user can quickly understand:
  - 📍 My Location
  - 🌡 Current Temperature
  - 🔥 Heat Risk
  - 📊 Next 12 Hours
  - ⚠️ Peak Heat
  - 🤖 Recommendation

---

## Recommended Developer Commands

From the frontend project folder (`Front-End/heat-shield-ai1`):

```bash
npm install
npx tsc --noEmit
npm run build
npm run dev
```

Backend (separate project):

```bash
python -m venv .venv
.\\.venv\\Scripts\\Activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## Final test scenario (to validate behavior)

1. Open the frontend at http://localhost:3000
2. Dashboard loads showing the default Cairo location
3. Frontend requests real backend data and displays:
   - current_temp_c
   - risk_score
   - risk_label and risk_emoji
   - risk_factors
   - historical comparison
   - peak_next_12h
   - forecast_12h
   - ai_recommendation
4. Click "Use my location": allow permission and verify the map moves to your location, marker updates, and dashboard refreshes with new data.
5. Click another point on the map and verify the dashboard updates again.

---

## Notes & Limitations

- If the backend only provides a single point, heat visualization is representational — mark it clearly.
- Do not add external geocoding services unless necessary; isolate any geocoding calls into a dedicated service if used.

---

## Next steps I can take for you

- Implement `services/api.ts` and strong TypeScript interfaces.
- Wire up the existing `use-geolocation` hook to the map and "Use my location" button.
- Create `components/heatmap-layer.tsx` for the thermal visualization.

Tell me which step to start with.

---

*Generated by an AI assistant using Copilot CLI runtime in VS Code.*
