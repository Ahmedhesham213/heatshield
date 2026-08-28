# HeatShield Backend API

> **HeatShield Explainable AI Heat Risk Engine** — heatshield-risk-v1  
> Powered by FortyGuard hyper-local temperature intelligence.

---

## Safety Disclaimer

> HeatShield provides heat-risk decision support and does not replace official weather warnings, occupational safety guidance, or medical advice.

---

## Quick Start

```bash
cd Back-End/heatshield_api
pip install -r requirements.txt
py -m uvicorn main:app --reload --port 8000
```

Test with New York City:
```bash
curl "http://localhost:8000/api/heat-risk?lat=40.7128&lon=-74.0060"
```

---

## What the HeatShield AI Engine Does

HeatShield uses **explainable heat-risk intelligence** rather than a black-box classifier.

It combines five signals into a transparent **0–100 Risk Score**, then classifies it into one of five actionable levels:

| Score | Level | Meaning |
|-------|-------|---------|
| 0–19 | 🟢 Low | Safe conditions |
| 20–39 | 🟡 Moderate | Caution for extended outdoor activity |
| 40–59 | 🟠 High | Limit strenuous outdoor work |
| 60–79 | 🔴 Very High | Avoid prolonged outdoor exposure |
| 80–100 | 🆘 Extreme | Avoid outdoor exposure entirely |

---

## Risk Model Formula

### Five Signals

| Signal | Default Weight | Description |
|--------|---------------|-------------|
| Thermal Severity | 40% | Current heat stress from temp/heat-index/apparent-temp |
| Historical Anomaly | 20% | How unusual today is vs local baseline |
| Forecast Persistence | 20% | TRUE temporal exposure analysis (not a temp ratio) |
| Forecast Peak | 10% | How severe is the upcoming peak vs current |
| Solar Load | 10% | Global horizontal irradiance (if available) |

**Dynamic Renormalization**: If any signal is absent (e.g., solar data unavailable), its weight is redistributed proportionally across the remaining signals. Missing data is **never** treated as zero risk.

**Safety Floor**: The final risk level can never fall below the level implied by the primary thermal stress indicator alone. This prevents a high historical baseline from incorrectly downgrading an actually-dangerous location.

```
final_score = weighted_composite(thermal, anomaly, persistence, peak, solar)
final_score = max(final_score, thermal_floor)
```

### Thermal Severity Anchors

The thermal score uses anchor-point interpolation (not a linear formula):

| Temperature (°C) | Score |
|------------------|-------|
| 20 | 0 |
| 27 | 12 |
| 32 | 30 |
| 36 | 48 |
| 39 | 63 |
| 42 | 78 |
| 46 | 92 |
| 50+ | 100 |

**Signal priority**: `heat_index_c > apparent_temp_c > temp_c`

---

## Three Primary UI Factors

| UI Field | Mapped To | Description |
|----------|-----------|-------------|
| `risk_factors.temperature` | Thermal severity score | How hot the air feels right now |
| `risk_factors.historical_gap` | Anomaly score | How unusual today is vs local baseline |
| `risk_factors.heat_duration` | Persistence score | How long high-risk conditions last |

---

## Historical Anomaly Detection

The engine detects whether today is **unusually hot for this specific location**.

**Z-score method** (preferred, when historical std is available):
```
z = (current_temp - historical_mean) / historical_std
anomaly_score = clamp(z / 3.0 * 100, 0, 100)
is_unusual = z >= 1.5
```

**Delta fallback** (when std unavailable):
```
anomaly_score = clamp((current - mean) / 8.0 * 100, 0, 100)
is_unusual = (current - mean) >= 3.0
```

> Negative deviations (cooler than average) **reduce** anomaly risk to zero, never increase it.

---

## Forecast Persistence

The persistence score measures **actual temporal heat exposure**, not a temperature ratio.

```
fraction_score = (high_risk_hours / total_hours) * 100
run_score = (longest_continuous_run / 12) * 100
persistence_score = 0.6 * fraction_score + 0.4 * run_score
```

Returns:
- `high_risk_hours` — count of forecast hours at High/Very High/Extreme
- `longest_continuous_high_risk_hours` — longest unbroken danger run
- `very_high_risk_hours` and `extreme_hours`

---

## Peak Heat Windows

The peak window algorithm uses **contiguous segment detection** — it never merges separated danger windows.

Example:
```
12:00 high
13:00 high  ← primary window (contains peak)
14:00 high
15:00 low   ← break
16:00 high  ← separate window
17:00 high
```
Result: Two separate windows. Primary window = segment containing hottest hour.

---

## Environmental Modifiers

When available from FortyGuard:
- **Heat Index** — primary thermal stress indicator (physiologically preferred)
- **Apparent Temperature** — secondary fallback
- **Relative Humidity** — small modifier when heat index not available
- **Solar GHI** — normalized solar load score (0–100)
- **Wet Bulb Temperature** — available in snapshot but not fabricated

---

## Explainability Output

Every API response includes:

```json
{
  "explainability": {
    "model_version": "heatshield-risk-v1",
    "confidence": 0.87,
    "top_drivers": [
      "Very high thermal stress",
      "4.6C above the local historical baseline",
      "4 consecutive high-risk forecast hours"
    ],
    "factor_contributions": {
      "thermal": 27.2,
      "anomaly": 14.3,
      "persistence": 18.1,
      "peak": 7.8
    },
    "data_quality": {
      "current_temperature": true,
      "forecast": true,
      "historical_baseline": true,
      "environmental_parameters": true,
      "solar_data": false
    }
  }
}
```

---

## Confidence Score

`confidence` reflects **data completeness**, not model accuracy.

| Signal | Weight |
|--------|--------|
| Current temperature | 0.30 |
| Forecast available | 0.25 |
| Historical baseline | 0.15 (+0.05 if std available) |
| Environmental parameters | up to 0.15 |
| Solar data | 0.10 |

We say `"confidence: 0.91"` (completeness of evidence), **not** `"91% accurate"` (no validation dataset exists).

---

## Mock vs Live Data

| Setting | Behavior |
|---------|----------|
| `USE_MOCK = True` | Deterministic mock data seeded from coordinates (default) |
| `USE_MOCK = False` | Real FortyGuard API (requires `FORTYGUARD_API_KEY`) |

Mock data is:
- **Deterministic**: same location always returns same result
- **Labeled**: response includes `"data_source": "MOCK_DETERMINISTIC"`
- **Realistic**: five scenario tiers covering all five risk levels

---

## Coverage

**United States only** (FortyGuard API requirement). Coordinates are validated before any API call. Non-US coordinates return HTTP 400.

---

## Tests

```bash
cd Back-End/heatshield_api
pytest tests/ -v
```

Test coverage:
- 5-level classification boundaries
- Thermal anchor interpolation
- Historical anomaly (z-score + delta fallback)
- Forecast persistence (true temporal analysis)
- Peak window (contiguous segments, separated windows)
- Empty forecast handling
- Missing historical/environmental data
- Solar present/absent
- Safety floor behavior
- Score always 0–100
- Level always one of 5 valid values
- Recommendations match risk context
- API integration (deterministic mock)

---

## Limitations

1. US coverage only (FortyGuard API restriction)
2. Mock mode when API key unavailable
3. Solar GHI not fabricated — only used when real FortyGuard data provides it
4. No spatial hotspot analysis without real FortyGuard heatmap integration
5. Historical percentiles not fabricated — only shown when data provides them

---

## How to Explain This to Judges

> "HeatShield uses explainable heat-risk intelligence rather than a black-box classifier. It combines current thermal severity (using anchor-point interpolation that accounts for heat index and humidity), local historical anomaly (via z-score detection), and forecast heat persistence (true temporal analysis of contiguous high-risk hours) into a transparent 0–100 risk score, then adds environmental and solar context when available.
>
> The scoring is deterministic and fully auditable. Every factor contribution is returned in the API response. Judges can ask 'Why is this location 78/100?' and the system answers: 'Because the heat index is 41°C, it is 4.6°C above its local baseline, and high-risk conditions are expected for 4 consecutive hours.'"

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/heat-risk?lat=&lon=` | Full AI risk analysis |
| `GET /api/nearby-safer?lat=&lon=` | Find cooler nearby location |
| `POST /api/auth/register` | User registration |
| `POST /api/auth/login` | User login |
| `GET /api/auth/me` | Current user |
| `POST /api/auth/logout` | Logout |
| `GET /api/user/saved-locations` | List saved locations |
| `POST /api/user/saved-locations` | Save a location |
| `DELETE /api/user/saved-locations/{id}` | Delete saved location |
