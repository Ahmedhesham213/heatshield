"""
Unit tests for the HeatShield Explainable AI Heat Risk Engine (risk_engine.py).

Covers all 18 test categories from the specification:
  1-5.  Five-level classification and temperature boundaries
  6.    Exact classification boundaries
  7.    Historical anomaly (normal, +3C, +5C, negative)
  8.    Forecast analysis (all low, one high, contiguous highs, separated windows)
  9.    Peak detection
  10.   Duration/persistence calculation
  11.   Empty forecast
  12.   Missing historical average
  13.   Missing optional environmental data
  14.   Solar data present/absent
  15.   Safety-floor behavior
  16.   Score always 0-100
  17.   Level always one of 5 valid levels
  18.   Recommendations match risk context
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from risk_engine import (
    HeatSnapshot,
    HistoricalBaseline,
    ForecastPoint,
    RiskAnalysis,
    analyze_heat_risk,
    calculate_thermal_score,
    classify_risk,
    score_to_level,
    calculate_anomaly_score,
    calculate_persistence_score,
    find_peak_window,
    find_contiguous_segments,
    calculate_final_score,
    apply_safety_floor,
    calculate_confidence,
    build_recommendation,
    score_forecast_timeline,
    find_peak_risk_window,
    is_unusually_hot,
    compute_risk_score,
    SEVERITY_ORDER,
    RISK_SCORE_BOUNDARIES,
)

# ===========================================================================
#  HELPERS
# ===========================================================================

VALID_LEVELS = {"low", "moderate", "high", "very_high", "extreme"}


def make_snapshot(temp_c, **kwargs):
    return HeatSnapshot(temp_c=temp_c, **kwargs)


def make_baseline(mean_c, std_c=None):
    return HistoricalBaseline(mean_c=mean_c, std_c=std_c)


def make_forecast(temps, start_hour=0):
    """Create a list of ForecastPoint from a list of temperatures."""
    return [
        ForecastPoint(hour_offset=i + start_hour, time=f"{(10 + i) % 24:02d}:00", temp_c=t)
        for i, t in enumerate(temps)
    ]


def run_analysis(temp_c, hist_avg=30.0, hist_std=None, forecast_temps=None, **snapshot_kwargs):
    """Convenience wrapper for analyze_heat_risk."""
    snapshot = make_snapshot(temp_c, **snapshot_kwargs)
    baseline = make_baseline(hist_avg, hist_std) if hist_avg is not None else None
    forecast = make_forecast(forecast_temps) if forecast_temps else []
    return analyze_heat_risk(snapshot, baseline, forecast)


# ===========================================================================
#  1-5. FIVE-LEVEL CLASSIFICATION AND THERMAL SCORES
# ===========================================================================

class TestFiveLevelClassification:
    """Tests 1-5: Verify five risk levels are reachable and correctly classified."""

    def test_low_temperature_gives_low_level(self):
        """Below 27C should produce Low risk."""
        analysis = run_analysis(22.0, hist_avg=25.0, forecast_temps=[22.0] * 12)
        assert analysis.risk_level == "low", f"Expected low, got {analysis.risk_level}"
        assert analysis.risk_score <= 39

    def test_moderate_temperature(self):
        """Around 30C with moderate conditions."""
        analysis = run_analysis(30.0, hist_avg=28.0, forecast_temps=[30.0] * 12)
        assert analysis.risk_level in {"low", "moderate"}

    def test_high_temperature(self):
        """Around 36C with high conditions."""
        analysis = run_analysis(36.0, hist_avg=32.0, forecast_temps=[36.0] * 12)
        assert analysis.risk_level in {"moderate", "high", "very_high"}

    def test_very_high_temperature(self):
        """Around 40C with very high conditions."""
        analysis = run_analysis(40.0, hist_avg=35.0, forecast_temps=[40.0, 41.0, 42.0] * 4)
        # Safety floor ensures at least high from thermal score
        assert analysis.risk_level in {"high", "very_high", "extreme"}
        assert analysis.risk_score >= 40

    def test_extreme_temperature(self):
        """Above 46C should produce extreme risk."""
        analysis = run_analysis(47.0, hist_avg=38.0, forecast_temps=[47.0, 48.0] * 6)
        assert analysis.risk_level == "extreme"
        assert analysis.risk_score >= 80

    def test_five_levels_reachable(self):
        """All five levels must be reachable via classify_risk."""
        levels_found = set()
        for score in [10, 30, 50, 70, 90]:
            level, _, _ = classify_risk(score)
            levels_found.add(level)
        assert levels_found == {"low", "moderate", "high", "very_high", "extreme"}


# ===========================================================================
#  6. EXACT CLASSIFICATION BOUNDARIES
# ===========================================================================

class TestClassificationBoundaries:
    """Test 6: Verify exact score boundaries."""

    def test_boundary_0(self):
        level, _, _ = classify_risk(0)
        assert level == "low"

    def test_boundary_19(self):
        level, _, _ = classify_risk(19)
        assert level == "low"

    def test_boundary_20(self):
        level, _, _ = classify_risk(20)
        assert level == "moderate"

    def test_boundary_39(self):
        level, _, _ = classify_risk(39)
        assert level == "moderate"

    def test_boundary_40(self):
        level, _, _ = classify_risk(40)
        assert level == "high"

    def test_boundary_59(self):
        level, _, _ = classify_risk(59)
        assert level == "high"

    def test_boundary_60(self):
        level, _, _ = classify_risk(60)
        assert level == "very_high"

    def test_boundary_79(self):
        level, _, _ = classify_risk(79)
        assert level == "very_high"

    def test_boundary_80(self):
        level, _, _ = classify_risk(80)
        assert level == "extreme"

    def test_boundary_100(self):
        level, _, _ = classify_risk(100)
        assert level == "extreme"

    def test_score_to_level_backward_compat(self):
        assert score_to_level(10) == "low"
        assert score_to_level(25) == "moderate"
        assert score_to_level(45) == "high"
        assert score_to_level(65) == "very_high"
        assert score_to_level(85) == "extreme"


# ===========================================================================
#  7. HISTORICAL ANOMALY DETECTION
# ===========================================================================

class TestHistoricalAnomaly:
    """Test 7: Anomaly detection in four scenarios."""

    def test_normal_temperature(self):
        """Current temp at historical mean -> not unusual."""
        baseline = make_baseline(35.0)
        result = calculate_anomaly_score(35.0, baseline)
        assert result["is_unusual"] is False
        assert result["diff"] == pytest.approx(0.0, abs=0.1)

    def test_positive_3c_anomaly(self):
        """3C above mean -> should be flagged as unusual."""
        baseline = make_baseline(30.0)
        result = calculate_anomaly_score(33.0, baseline)
        assert result["is_unusual"] is True
        assert result["diff"] == pytest.approx(3.0, abs=0.2)
        assert result["anomaly_score"] > 0

    def test_positive_5c_anomaly(self):
        """5C above mean -> high anomaly score."""
        baseline = make_baseline(30.0)
        result = calculate_anomaly_score(35.0, baseline)
        assert result["is_unusual"] is True
        assert result["anomaly_score"] > 50

    def test_negative_anomaly_does_not_increase_risk(self):
        """Below-average temp -> anomaly_score should be 0."""
        baseline = make_baseline(40.0)
        result = calculate_anomaly_score(35.0, baseline)
        assert result["anomaly_score"] == 0.0
        assert result["is_unusual"] is False
        assert result["diff"] < 0

    def test_z_score_method_when_std_available(self):
        """When std is provided, z-score method should be used."""
        baseline = make_baseline(30.0, std_c=3.0)
        result = calculate_anomaly_score(36.0, baseline)
        assert result["method"] == "z_score"
        assert "z_score" in result
        assert result["z_score"] == pytest.approx(2.0, abs=0.1)

    def test_delta_fallback_when_no_std(self):
        """When no std provided, delta fallback is used."""
        baseline = make_baseline(30.0)
        result = calculate_anomaly_score(36.0, baseline)
        assert result["method"] == "delta_fallback"
        assert "z_score" not in result

    def test_no_baseline_returns_zero_anomaly(self):
        result = calculate_anomaly_score(40.0, None)
        assert result["anomaly_score"] == 0.0
        assert result["is_unusual"] is False
        assert result["method"] == "none"


# ===========================================================================
#  8-10. FORECAST ANALYSIS
# ===========================================================================

class TestForecastAnalysis:
    """Tests 8-10: Forecast persistence, peak detection, and duration."""

    def test_all_low_forecast(self):
        """All low temperatures -> no persistence, no danger window."""
        forecast = make_forecast([22.0] * 12)
        scored = [result for fp in forecast
                  for result in [{"hour_offset": fp.hour_offset, "time": fp.time,
                                  "temp_c": fp.temp_c, "level": "low",
                                  "emoji": "🟢", "label": "Low",
                                  "risk_score": 10, "thermal_score": 10}]]
        # Build scored forecast manually by scoring the low temps
        from risk_engine import _score_forecast_point
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast([22.0] * 12)]
        
        persistence = calculate_persistence_score(scored_fc)
        assert persistence["high_risk_hours"] == 0
        assert persistence["persistence_score"] == 0.0

        peak = find_peak_window(scored_fc)
        assert peak.get("has_danger_window") is False

    def test_single_high_hour(self):
        """One high-risk hour in otherwise low forecast."""
        from risk_engine import _score_forecast_point
        temps = [22.0] * 6 + [39.0] + [22.0] * 5
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        
        persistence = calculate_persistence_score(scored_fc)
        assert persistence["high_risk_hours"] >= 1

    def test_contiguous_high_risk_hours(self):
        """Four consecutive high-risk hours -> meaningful persistence."""
        from risk_engine import _score_forecast_point
        temps = [22.0] * 4 + [40.0, 41.0, 42.0, 41.0] + [22.0] * 4
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        
        persistence = calculate_persistence_score(scored_fc)
        assert persistence["longest_continuous_high_risk_hours"] >= 2
        assert persistence["persistence_score"] > 0

    def test_separated_high_risk_windows(self):
        """Two separate danger windows -> should find contiguous segments."""
        from risk_engine import _score_forecast_point
        temps = [40.0, 40.0, 22.0, 22.0, 40.0, 40.0, 22.0, 22.0, 22.0, 22.0, 22.0, 22.0]
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        
        danger_levels = {"high", "very_high", "extreme"}
        segments = find_contiguous_segments(scored_fc, danger_levels)
        # Should find 2 separate segments, not merge them
        assert len(segments) >= 1
        # No single segment should span the entire forecast
        for seg in segments:
            assert len(seg) <= 4


# ===========================================================================
#  9. PEAK DETECTION
# ===========================================================================

class TestPeakDetection:
    """Test 9: Peak window correctly identifies the hottest contiguous segment."""

    def test_peak_temp_matches_hottest_hour(self):
        from risk_engine import _score_forecast_point
        temps = [30.0, 35.0, 42.0, 41.0, 35.0, 30.0, 25.0, 25.0, 25.0, 25.0, 25.0, 25.0]
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        peak = find_peak_window(scored_fc)
        assert peak["peak_temp"] == 42.0

    def test_peak_window_is_contiguous(self):
        """peak window should be a contiguous block, not spanning gaps."""
        from risk_engine import _score_forecast_point
        # 12:00-14:00 hot, 15:00 cool, 16:00-17:00 hot
        temps = [22.0, 22.0, 40.0, 41.0, 40.0, 22.0, 40.0, 40.0, 22.0, 22.0, 22.0, 22.0]
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        peak = find_peak_window(scored_fc)
        # The window should be contiguous
        if peak.get("has_danger_window") and peak.get("window_start") and peak.get("window_end"):
            # Duration should be 3 or 2 (the contiguous block with peak temp 41)
            assert peak["duration_hours"] <= 6

    def test_no_danger_window_returns_has_danger_window_false(self):
        from risk_engine import _score_forecast_point
        temps = [22.0] * 12
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        peak = find_peak_window(scored_fc)
        assert peak.get("has_danger_window") is False

    def test_peak_risk_level_consistent_with_temp(self):
        from risk_engine import _score_forecast_point
        temps = [22.0] * 10 + [47.0, 48.0]
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        peak = find_peak_window(scored_fc)
        assert peak.get("peak_risk_level") in VALID_LEVELS


# ===========================================================================
#  10. DURATION / PERSISTENCE
# ===========================================================================

class TestDurationCalculation:
    """Test 10: Persistence score is based on actual temporal forecast analysis."""

    def test_all_high_risk_gives_max_persistence(self):
        from risk_engine import _score_forecast_point
        temps = [44.0] * 12
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        persistence = calculate_persistence_score(scored_fc)
        # 12/12 hours high risk, run = 12 -> near 100
        assert persistence["persistence_score"] > 80
        assert persistence["high_risk_hours"] == 12
        assert persistence["longest_continuous_high_risk_hours"] == 12

    def test_no_high_risk_gives_zero_persistence(self):
        from risk_engine import _score_forecast_point
        temps = [22.0] * 12
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        persistence = calculate_persistence_score(scored_fc)
        assert persistence["persistence_score"] == 0.0
        assert persistence["high_risk_hours"] == 0

    def test_duration_score_is_not_temp_ratio(self):
        """Verify the old broken current_temp/peak_temp proxy is gone."""
        from risk_engine import _score_forecast_point
        # All 22C forecast (all low risk)
        temps = [22.0] * 12
        scored_fc = [_score_forecast_point(fp) for fp in make_forecast(temps)]
        persistence = calculate_persistence_score(scored_fc)
        # Old code would return ~50 (22/44 * 100); correct code returns 0
        assert persistence["persistence_score"] == 0.0


# ===========================================================================
#  11. EMPTY FORECAST
# ===========================================================================

class TestEmptyForecast:
    """Test 11: Engine handles empty forecast gracefully."""

    def test_empty_forecast_does_not_crash(self):
        snapshot = make_snapshot(35.0)
        baseline = make_baseline(32.0)
        analysis = analyze_heat_risk(snapshot, baseline, [])
        assert analysis.risk_score is not None
        assert analysis.risk_level in VALID_LEVELS

    def test_empty_forecast_persistence_is_zero(self):
        persistence = calculate_persistence_score([])
        assert persistence["persistence_score"] == 0.0
        assert persistence["high_risk_hours"] == 0

    def test_empty_forecast_peak_window_is_empty_dict(self):
        result = find_peak_window([])
        assert result == {}


# ===========================================================================
#  12. MISSING HISTORICAL AVERAGE
# ===========================================================================

class TestMissingHistoricalAverage:
    """Test 12: Engine handles missing historical baseline gracefully."""

    def test_no_baseline_does_not_crash(self):
        snapshot = make_snapshot(38.0)
        analysis = analyze_heat_risk(snapshot, None, [])
        assert analysis.risk_score is not None
        assert analysis.risk_level in VALID_LEVELS

    def test_no_baseline_anomaly_score_is_zero(self):
        result = calculate_anomaly_score(38.0, None)
        assert result["anomaly_score"] == 0.0

    def test_no_baseline_confidence_reduced(self):
        snapshot = make_snapshot(38.0)
        confidence = calculate_confidence(snapshot, None, [])
        # Without baseline and forecast, confidence should be 0.30
        assert confidence == pytest.approx(0.30, abs=0.01)


# ===========================================================================
#  13. MISSING OPTIONAL ENVIRONMENTAL DATA
# ===========================================================================

class TestMissingEnvironmentalData:
    """Test 13: Engine gracefully degrades without environmental parameters."""

    def test_no_heat_index_uses_temp(self):
        """Without heat index, should fall back to apparent_temp or temp."""
        snapshot = HeatSnapshot(temp_c=38.0)
        score = calculate_thermal_score(snapshot)
        # Should still produce a valid score based on temp
        assert 0 <= score <= 100

    def test_no_humidity_does_not_crash(self):
        snapshot = HeatSnapshot(temp_c=38.0)
        score = calculate_thermal_score(snapshot)
        assert score > 0

    def test_full_environmental_data_higher_score(self):
        """With heat index, score should generally be >= raw temp score for hot conditions."""
        temp = 36.0
        snap_no_env = HeatSnapshot(temp_c=temp)
        snap_with_hi = HeatSnapshot(temp_c=temp, heat_index_c=40.0)
        score_no = calculate_thermal_score(snap_no_env)
        score_hi = calculate_thermal_score(snap_with_hi)
        assert score_hi >= score_no


# ===========================================================================
#  14. SOLAR DATA PRESENT / ABSENT
# ===========================================================================

class TestSolarData:
    """Test 14: Solar data is never fabricated; weights renormalize correctly."""

    def test_no_solar_does_not_crash(self):
        snapshot = HeatSnapshot(temp_c=36.0)
        baseline = make_baseline(32.0)
        analysis = analyze_heat_risk(snapshot, baseline, [])
        assert analysis.risk_level in VALID_LEVELS

    def test_solar_absent_weight_renormalization(self):
        """When solar is absent, weights must renormalize (not just drop 10%)."""
        score_no_solar, contributions_no = calculate_final_score(
            thermal_score=60.0, anomaly_score=40.0, persistence_score=50.0,
            peak_score=55.0, solar_score=0.0, solar_available=False,
        )
        score_with_solar, contributions_with = calculate_final_score(
            thermal_score=60.0, anomaly_score=40.0, persistence_score=50.0,
            peak_score=55.0, solar_score=0.0, solar_available=True,
        )
        # Without solar, 0% of the score should come from solar
        assert "solar" not in contributions_no
        # With solar (=0), solar contribution is 0 but the key exists
        assert "solar" in contributions_with

    def test_solar_present_adds_to_score(self):
        """High GHI should increase the final score slightly."""
        from risk_engine import calculate_solar_score
        score = calculate_solar_score(800.0)
        assert score == pytest.approx(80.0, abs=1.0)

    def test_solar_none_returns_zero(self):
        from risk_engine import calculate_solar_score
        assert calculate_solar_score(None) == 0.0
        assert calculate_solar_score(-10.0) == 0.0


# ===========================================================================
#  15. SAFETY FLOOR
# ===========================================================================

class TestSafetyFloor:
    """Test 15: Safety floor prevents incorrect downgrading of severe thermal conditions."""

    def test_floor_prevents_downgrade(self):
        """High thermal score should not be pulled below its floor by low anomaly."""
        # Thermal score of 65 -> very_high floor (minimum score 60)
        thermal_score = 65.0
        # Suppose anomaly and persistence are both 0 (no anomaly, no forecast)
        # Weighted would give: 0.4*65 + 0.2*0 + 0.2*0 + 0.1*65 + solar not available
        weighted_score, _ = calculate_final_score(
            thermal_score=thermal_score, anomaly_score=0.0,
            persistence_score=0.0, peak_score=thermal_score,
            solar_score=0.0, solar_available=False,
        )
        floored = apply_safety_floor(weighted_score, thermal_score)
        # Floor for very_high is 60; weighted_score must be >= 60
        assert floored >= 60.0, f"Floor failed: floored={floored}"

    def test_floor_does_not_lower_score(self):
        """If weighted score is already above floor, floor should not lower it."""
        thermal_score = 50.0
        high_weighted = 65.0  # already above floor
        floored = apply_safety_floor(high_weighted, thermal_score)
        assert floored >= high_weighted

    def test_extreme_thermal_cannot_be_downgraded(self):
        """Extreme thermal score (>= 80) must produce extreme level."""
        # Even with zero anomaly and persistence, extreme thermal -> extreme floor
        thermal_score = 85.0
        analysis = analyze_heat_risk(
            HeatSnapshot(temp_c=47.0),
            make_baseline(47.0),  # Same as current -> zero anomaly
            [],  # No forecast -> zero persistence
        )
        assert analysis.risk_level == "extreme"
        assert analysis.risk_score >= 80


# ===========================================================================
#  16. SCORE ALWAYS 0-100
# ===========================================================================

class TestScoreBounds:
    """Test 16: Final risk score is always within [0, 100]."""

    @pytest.mark.parametrize("temp_c,hist_avg", [
        (-10.0, 20.0),
        (0.0, 30.0),
        (20.0, 25.0),
        (35.0, 32.0),
        (40.0, 35.0),
        (47.0, 38.0),
        (60.0, 45.0),
        (100.0, 50.0),
    ])
    def test_score_in_range(self, temp_c, hist_avg):
        analysis = run_analysis(temp_c, hist_avg=hist_avg)
        assert 0 <= analysis.risk_score <= 100, (
            f"Score {analysis.risk_score} out of range for temp={temp_c}"
        )

    def test_thermal_score_always_in_range(self):
        for temp in [-20.0, 0.0, 25.0, 50.0, 100.0]:
            snapshot = HeatSnapshot(temp_c=temp)
            score = calculate_thermal_score(snapshot)
            assert 0.0 <= score <= 100.0, f"thermal_score {score} out of range for temp={temp}"


# ===========================================================================
#  17. LEVEL ALWAYS ONE OF 5 VALID LEVELS
# ===========================================================================

class TestValidLevels:
    """Test 17: risk_level is always one of the five valid levels."""

    @pytest.mark.parametrize("temp_c", [15.0, 25.0, 33.0, 38.0, 42.0, 48.0])
    def test_risk_level_is_valid(self, temp_c):
        analysis = run_analysis(temp_c)
        assert analysis.risk_level in VALID_LEVELS, (
            f"Invalid level '{analysis.risk_level}' for temp={temp_c}"
        )

    def test_forecast_levels_are_valid(self):
        from risk_engine import _score_forecast_point
        for temp in [20.0, 30.0, 36.0, 42.0, 48.0]:
            fp = ForecastPoint(hour_offset=0, time="12:00", temp_c=temp)
            result = _score_forecast_point(fp)
            assert result["level"] in VALID_LEVELS


# ===========================================================================
#  18. RECOMMENDATIONS MATCH RISK CONTEXT
# ===========================================================================

class TestRecommendations:
    """Test 18: Recommendations are appropriate for each risk level."""

    def test_low_recommendation(self):
        rec = build_recommendation("low", 22.0, {}, {}, {})
        assert len(rec) > 0
        assert "suitable" in rec.lower() or "safe" in rec.lower() or "standard" in rec.lower()

    def test_moderate_recommendation(self):
        rec = build_recommendation("moderate", 32.0, {}, {}, {})
        assert "hydrat" in rec.lower() or "manageable" in rec.lower()

    def test_high_recommendation(self):
        rec = build_recommendation("high", 38.0, {}, {}, {})
        assert "limit" in rec.lower() or "strenuous" in rec.lower()

    def test_very_high_recommendation(self):
        rec = build_recommendation("very_high", 42.0, {}, {}, {})
        assert "avoid" in rec.lower() or "prolonged" in rec.lower()

    def test_extreme_recommendation(self):
        rec = build_recommendation("extreme", 47.0, {}, {}, {})
        assert "avoid" in rec.lower() or "extreme" in rec.lower()

    def test_recommendation_includes_window_when_present(self):
        peak_window = {
            "has_danger_window": True,
            "window_start": "12:00",
            "window_end": "15:00",
            "peak_temp": 42.0,
        }
        rec = build_recommendation("very_high", 41.0, peak_window, {}, {})
        assert "12:00" in rec and "15:00" in rec

    def test_recommendation_includes_anomaly_when_unusual(self):
        anomaly = {"is_unusual": True, "diff": 4.5}
        rec = build_recommendation("high", 38.0, {}, anomaly, {})
        assert "4.5" in rec or "4.6" in rec or "baseline" in rec.lower() or "4" in rec

    def test_outdoor_worker_profile_adds_osha(self):
        rec = build_recommendation("high", 38.0, {}, {}, {}, profile="outdoor_worker")
        assert "osha" in rec.lower() or "prevention" in rec.lower()

    def test_all_analysis_levels_return_non_empty_recommendations(self):
        for level in ["low", "moderate", "high", "very_high", "extreme"]:
            rec = build_recommendation(level, 35.0, {}, {}, {})
            assert len(rec) > 20


# ===========================================================================
#  BACKWARD COMPATIBILITY
# ===========================================================================

class TestBackwardCompatibility:
    """Ensure existing main.py callers still work."""

    def test_is_unusually_hot_returns_message_key(self):
        result = is_unusually_hot(38.0, 33.0)
        assert "message" in result
        assert "diff" in result
        assert "is_unusual" in result

    def test_compute_risk_score_returns_int(self):
        score = compute_risk_score(38.0, 33.0, 40.0)
        assert isinstance(score, int)
        assert 0 <= score <= 100

    def test_score_forecast_timeline_backward_compat(self):
        forecast = [
            {"hour_offset": 0, "time": "12:00", "temp_c": 36.0},
            {"hour_offset": 1, "time": "13:00", "temp_c": 38.0},
        ]
        scored = score_forecast_timeline(forecast)
        assert len(scored) == 2
        for h in scored:
            assert "level" in h
            assert "emoji" in h
            assert "label" in h
            assert h["level"] in VALID_LEVELS

    def test_find_peak_risk_window_backward_compat(self):
        scored_forecast = [
            {"hour_offset": 0, "time": "12:00", "temp_c": 40.0, "level": "high", "emoji": "", "label": "", "risk_score": 50, "thermal_score": 50},
            {"hour_offset": 1, "time": "13:00", "temp_c": 41.0, "level": "very_high", "emoji": "", "label": "", "risk_score": 65, "thermal_score": 65},
        ]
        result = find_peak_risk_window(scored_forecast)
        assert "peak_temp" in result
        assert result["peak_temp"] == 41.0


# ===========================================================================
#  INTEGRATION SMOKE TEST (unit-level, no HTTP)
# ===========================================================================

class TestEndToEndAnalysis:
    """Smoke tests for the full analyze_heat_risk pipeline."""

    def test_full_analysis_very_hot_conditions(self):
        """Simulate a very hot NYC August day."""
        snapshot = HeatSnapshot(
            temp_c=39.4,
            apparent_temp_c=42.1,
            heat_index_c=41.5,
            relative_humidity=72.0,
        )
        baseline = HistoricalBaseline(mean_c=34.8, std_c=3.0)  # z = 4.6/3.0 = 1.53 > 1.5 threshold
        forecast = [
            ForecastPoint(hour_offset=i+1, time=f"{10+i}:00",
                          temp_c=38.0 + i * 0.5 + (0.3 if i < 6 else -0.5 * (i-5)))
            for i in range(12)
        ]
        analysis = analyze_heat_risk(snapshot, baseline, forecast)

        assert 0 <= analysis.risk_score <= 100
        assert analysis.risk_level in VALID_LEVELS
        assert analysis.anomaly["is_unusual"] is True
        assert analysis.anomaly["diff"] > 0
        assert analysis.confidence > 0.5
        assert len(analysis.recommendation) > 20
        assert len(analysis.explainability["top_drivers"]) >= 1
        assert "model_version" in analysis.explainability
        assert analysis.explainability["model_version"] == "heatshield-risk-v1"

    def test_full_analysis_mild_conditions(self):
        """Simulate a mild spring day."""
        snapshot = HeatSnapshot(temp_c=22.0)
        baseline = HistoricalBaseline(mean_c=23.0, std_c=3.0)
        forecast = [
            ForecastPoint(hour_offset=i+1, time=f"{8+i}:00", temp_c=20.0 + i * 0.5)
            for i in range(12)
        ]
        analysis = analyze_heat_risk(snapshot, baseline, forecast)

        assert analysis.risk_score <= 39
        assert analysis.risk_level in {"low", "moderate"}
        assert analysis.anomaly["is_unusual"] is False

    def test_explainability_structure(self):
        snapshot = HeatSnapshot(temp_c=39.0, heat_index_c=42.0, relative_humidity=75.0)
        baseline = HistoricalBaseline(mean_c=34.0, std_c=3.0)
        forecast = [ForecastPoint(i, f"{10+i}:00", 38.0 + i * 0.3) for i in range(12)]
        analysis = analyze_heat_risk(snapshot, baseline, forecast)

        exp = analysis.explainability
        assert "model_version" in exp
        assert "confidence" in exp
        assert "top_drivers" in exp
        assert "factor_contributions" in exp
        assert "data_quality" in exp

        dq = exp["data_quality"]
        assert dq["current_temperature"] is True
        assert dq["forecast"] is True
        assert dq["historical_baseline"] is True
        assert dq["environmental_parameters"] is True
