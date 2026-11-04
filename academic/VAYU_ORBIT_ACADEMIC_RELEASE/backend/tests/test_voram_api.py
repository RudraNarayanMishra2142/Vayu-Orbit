"""
API Tests for VORAM v0.1 Endpoints
====================================
Tests Group F requirements (41-49):
41. Valid assessment request
42. Invalid request
43. Missing required input
44. Invalid parameter configuration
45. No eligible path
46. Correct response schema
47. Clear error responses
48. No accidental exposure of internal stack traces
49. Existing route endpoints retain expected behaviour
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from api import app
import auth
import voram_service


class TestVoramGroupFApi(unittest.TestCase):
    """Group F: API tests (41-49)."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Generate valid tokens for testing
        cls.coord_token = auth.create_access_token(
            user_id="user-test-coord",
            email="coordinator@vayu.local",
            role="COORDINATOR"
        )
        cls.headers = {"Authorization": f"Bearer {cls.coord_token}"}
        cls.valid_params = {p["id"]: 40.0 for p in voram_service.DEFAULT_PARAMETER_DEFINITIONS}

    def test_41_valid_assessment_request(self):
        """Test 41: Valid assessment request to /api/voram/assess."""
        payload = {
            "parameters": self.valid_params,
            "safeguard_coefficient": 0.8
        }
        res = self.client.post("/api/voram/assess", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["model"]["name"], "VORAM")
        self.assertEqual(data["model"]["version"], "0.1")
        self.assertEqual(data["assessment_status"], "PASS_WITHIN_TESTED_RULES")
        self.assertEqual(data["risk_score"], 40.0)
        self.assertEqual(data["risk_category"], "Moderate Concern")

    def test_42_invalid_request_score_out_of_bounds(self):
        """Test 42: Invalid request with score > 100 returns 400 Bad Request."""
        bad_params = dict(self.valid_params)
        bad_params["road_condition"] = 150.0 # Invalid
        res = self.client.post("/api/voram/assess", json={"parameters": bad_params}, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        data = res.json()
        self.assertIn("detail", data)

    def test_43_missing_required_input(self):
        """Test 43: Missing required input produces UNKNOWN status."""
        incomplete_params = dict(self.valid_params)
        incomplete_params["flooding_waterlogging"] = None
        res = self.client.post("/api/voram/assess", json={"parameters": incomplete_params}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["assessment_status"], "UNKNOWN")
        self.assertIsNone(data["risk_score"])
        self.assertIn("flooding_waterlogging", data["missing_parameters"])

    def test_44_invalid_parameter_configuration(self):
        """Test 44: Invalid parameter weights return 400."""
        bad_weights = {p["id"]: p["weight"] for p in voram_service.DEFAULT_PARAMETER_DEFINITIONS}
        bad_weights["road_condition"] = 5.0 # Total 90% != 100%
        res = self.client.post(
            "/api/voram/assess",
            json={"parameters": self.valid_params, "weights": bad_weights},
            headers=self.headers
        )
        self.assertEqual(res.status_code, 400)

    def test_45_no_eligible_path_or_invalid_waypoints(self):
        """Test 45: Non-existent waypoint in assess-route returns 400."""
        payload = {
            "path": ["NON_EXISTENT_WAYPOINT_XYZ", "PLC-CN-08"],
            "convoy_speed_kmh": 40.0,
            "max_vehicle_tons": 10.0
        }
        res = self.client.post("/api/voram/assess-route", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("not present in the routing graph", res.json()["detail"])

    def test_46_correct_response_schema(self):
        """Test 46: Correct response schema matching Section 13."""
        payload = {"parameters": self.valid_params}
        res = self.client.post("/api/voram/assess", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Verify required keys from Section 13 conceptual response shape
        expected_keys = [
            "model", "assessment_status", "risk_score", "risk_category",
            "parameters", "missing_parameters", "constraint_findings",
            "data_quality", "reasons", "warnings", "assessed_at"
        ]
        for k in expected_keys:
            self.assertIn(k, data)

    def test_47_clear_error_responses(self):
        """Test 47: Clear, informative error responses."""
        res = self.client.post(
            "/api/voram/assess",
            json={"parameters": {"road_condition": -10}},
            headers=self.headers
        )
        self.assertEqual(res.status_code, 400)
        detail = res.json().get("detail")
        self.assertTrue(isinstance(detail, (str, dict)))
        msg = detail if isinstance(detail, str) else detail.get("message", "")
        self.assertTrue(len(msg) > 0)

    def test_48_no_accidental_exposure_of_internal_stack_traces(self):
        """Test 48: No accidental exposure of internal stack traces, DB paths, or python files."""
        res = self.client.post(
            "/api/voram/assess",
            json={"parameters": {"unexpected_key_12345": 50}},
            headers=self.headers
        )
        self.assertEqual(res.status_code, 400)
        body = res.text
        self.assertNotIn("Traceback", body)
        self.assertNotIn(".py", body)
        self.assertNotIn("military_logistics", body)

    def test_49_existing_route_endpoints_retain_expected_behaviour(self):
        """Test 49: Existing route endpoints retain expected behavior and include VORAM."""
        payload = {
            "origin_id": "PLC-CN-55",
            "dest_id": "PLC-CN-08",
            "convoy_speed_kmh": 40.0,
            "max_vehicle_tons": 12.0
        }
        res = self.client.post("/api/route", json=payload, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "OK")
        self.assertIn("routes", data)
        self.assertIn("selected_route", data)
        # Check each route alternative has voram_assessment
        for r in data["routes"]:
            self.assertIn("voram_assessment", r)
            self.assertEqual(r["voram_assessment"]["model"]["name"], "VORAM")
            self.assertEqual(r["voram_assessment"]["model"]["version"], "0.1")

    def test_50_voram_config_endpoint(self):
        """Test 50: GET /api/voram/config returns complete model specification."""
        res = self.client.get("/api/voram/config", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["model"]["name"], "VORAM")
        self.assertEqual(data["model"]["version"], "0.1")
        self.assertEqual(len(data["parameters"]), 10)
        self.assertEqual(data["default_safeguard_coefficient"], 0.8)

    def test_51_unauthenticated_requests_rejected(self):
        """Phase F: Unauthenticated requests to VORAM endpoints must receive HTTP 401."""
        res_cfg = self.client.get("/api/voram/config")
        self.assertEqual(res_cfg.status_code, 401)

        res_assess = self.client.post("/api/voram/assess", json={"parameters": self.valid_params})
        self.assertEqual(res_assess.status_code, 401)

        res_route = self.client.post("/api/voram/assess-route", json={"path": ["PLC-CN-55", "PLC-CN-08"]})
        self.assertEqual(res_route.status_code, 401)

    def test_52_phase_b_sample_vector_api_regression(self):
        """Phase B API Regression: Standalone sample payload produces 28.0 and Moderate Concern."""
        sample_params = {
            "road_condition": 35.0,
            "bridge_load_compatibility": 10.0,
            "road_closure_access": 0.0,
            "flooding_waterlogging": 5.0,
            "weather_impact": 20.0,
            "terrain_gradient": 15.0,
            "road_width_clearance": 10.0,
            "traffic_congestion": 25.0,
            "travel_time_variability": 30.0,
            "logistics_support_availability": 15.0
        }
        res = self.client.post("/api/voram/assess", json={"parameters": sample_params}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["risk_score"], 28.0)
        self.assertEqual(data["weighted_mean"], 15.8)
        self.assertEqual(data["max_parameter_score"], 35.0)
        self.assertEqual(data["safeguard_value"], 28.0)
        self.assertEqual(data["risk_category"], "Moderate Concern")
        self.assertEqual(data["assessment_status"], "PASS_WITHIN_TESTED_RULES")

    def test_53_assess_route_discontinuous_path_returns_400(self):
        """Phase E API Regression: Discontinuous path with missing graph edge returns HTTP 400."""
        # CN-01 and CN-25 are distant nodes in the real graph with no direct edge
        payload = {
            "path": ["CN-01", "CN-25"],
            "convoy_speed_kmh": 40.0,
            "max_vehicle_tons": 10.0
        }
        res = self.client.post("/api/voram/assess-route", json=payload, headers=self.headers)
        # Should return 400 Bad Request
        self.assertEqual(res.status_code, 400)
        detail = res.json().get("detail", {})
        msg = detail.get("message", "") if isinstance(detail, dict) else str(detail)
        self.assertTrue("discontinuous" in msg.lower() or "no navigable edge" in msg.lower())


if __name__ == '__main__':
    unittest.main()
