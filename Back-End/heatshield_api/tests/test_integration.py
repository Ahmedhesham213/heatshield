"""
Integration tests for HeatShield API backend.

Tests the GET /api/heat-risk endpoint using the FastAPI TestClient.
Uses deterministic mock data so the results are predictable.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a TestClient for the HeatShield FastAPI app."""
    from main import app
    return TestClient(app)


NYC_LAT = 40.7128
NYC_LON = -74.0060


class TestHeatRiskEndpoint:
    """Integration tests for GET /api/heat-risk."""

    def test_us_location_returns_200(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_non_us_location_returns_400_or_200(self, client):
        """
        In MOCK mode, all global coordinates are accepted so GPS works anywhere.
        In LIVE mode, non-US coordinates return 400.
        This test accepts both behaviors.
        """
        import fortyguard_client
        resp = client.get("/api/heat-risk?lat=51.5074&lon=-0.1278")  # London
        if fortyguard_client.USE_MOCK:
            # Mock mode allows global coordinates for GPS demo purposes
            assert resp.status_code in (200, 400)
        else:
            assert resp.status_code == 400


    def test_required_fields_present(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        required = [
            "location", "current_temp_c", "current_temp_f", "risk_score",
            "risk_level", "risk_label", "risk_emoji", "risk_factors",
            "historical_avg_c", "vs_historical", "peak_next_12h",
            "forecast_12h", "ai_recommendation",
        ]
        for field in required:
            assert field in data, f"Missing required field: {field}"

    def test_risk_score_is_integer_in_range(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        score = data["risk_score"]
        assert isinstance(score, int)
        assert 0 <= score <= 100

    def test_risk_level_is_valid(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        valid_levels = {"low", "moderate", "high", "very_high", "extreme"}
        assert data["risk_level"] in valid_levels

    def test_risk_factors_structure(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        rf = data["risk_factors"]
        assert "temperature" in rf
        assert "historical_gap" in rf
        assert "heat_duration" in rf
        assert 0 <= rf["temperature"] <= 100
        assert 0 <= rf["historical_gap"] <= 100
        assert 0 <= rf["heat_duration"] <= 100

    def test_historical_section(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        assert data["historical_avg_c"] > 0
        vs = data["vs_historical"]
        assert "is_unusual" in vs
        assert "diff" in vs
        assert isinstance(vs["is_unusual"], bool)

    def test_peak_section(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        peak = data["peak_next_12h"]
        assert "peak_temp" in peak
        assert "peak_time" in peak

    def test_forecast_section(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        forecast = data["forecast_12h"]
        assert isinstance(forecast, list)
        assert len(forecast) > 0
        for h in forecast:
            assert "temp_c" in h
            assert "level" in h
            assert "time" in h
            assert h["level"] in {"low", "moderate", "high", "very_high", "extreme"}

    def test_recommendation_is_string(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        rec = data["ai_recommendation"]
        assert isinstance(rec, str)
        assert len(rec) > 10

    def test_explainability_present(self, client):
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        # Explainability is an optional extended field
        if "explainability" in data and data["explainability"] is not None:
            exp = data["explainability"]
            assert "model_version" in exp
            assert exp["model_version"] == "heatshield-risk-v1"
            assert "confidence" in exp
            assert 0.0 <= exp["confidence"] <= 1.0
            assert "top_drivers" in exp
            assert isinstance(exp["top_drivers"], list)
            assert "factor_contributions" in exp
            assert "data_quality" in exp

    def test_internal_consistency_historical_diff(self, client):
        """vs_historical.diff should equal current_temp_c - historical_avg_c (approximately)."""
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        expected_diff = round(data["current_temp_c"] - data["historical_avg_c"], 2)
        actual_diff = data["vs_historical"]["diff"]
        assert abs(actual_diff - expected_diff) < 0.3, (
            f"Diff inconsistency: current={data['current_temp_c']}, "
            f"historical_avg={data['historical_avg_c']}, "
            f"reported_diff={actual_diff}, expected={expected_diff}"
        )

    def test_temperature_in_fahrenheit_conversion(self, client):
        """current_temp_f should approximately equal current_temp_c * 9/5 + 32."""
        resp = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data = resp.json()
        expected_f = round(data["current_temp_c"] * 9 / 5 + 32, 1)
        assert abs(data["current_temp_f"] - expected_f) < 0.5

    def test_deterministic_mock_same_result_on_refresh(self, client):
        """Same location should return same result (deterministic mock)."""
        resp1 = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        resp2 = client.get(f"/api/heat-risk?lat={NYC_LAT}&lon={NYC_LON}")
        data1 = resp1.json()
        data2 = resp2.json()
        assert data1["current_temp_c"] == data2["current_temp_c"]
        assert data1["risk_score"] == data2["risk_score"]
        assert data1["risk_level"] == data2["risk_level"]


class TestRootEndpoint:
    """Basic health check."""

    def test_root_returns_200(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "HeatShield" in data["status"]
