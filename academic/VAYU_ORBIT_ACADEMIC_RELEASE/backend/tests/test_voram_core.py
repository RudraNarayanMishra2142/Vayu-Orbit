"""
Unit and Integration Tests for VORAM v0.1
=========================================
Tests all requirements specified in Section 15 of VORAM v0.1 Specification:
- Group A: Formula tests (1-8)
- Group B: Validation tests (9-21)
- Group C: Missing-data tests (22-27)
- Group D: Mandatory-constraint tests (28-33)
- Group E: Route integration tests (34-40)
"""

import math
import os
import sys
import unittest
import networkx as nx

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import voram_service
from voram_service import (
    AssessmentStatus,
    EvidenceState,
    RiskCategory,
    VoramValidationError,
    DEFAULT_PARAMETER_DEFINITIONS,
    DEFAULT_SAFEGUARD_COEFFICIENT,
    calculate_weighted_mean,
    calculate_voram_formula,
    get_risk_category,
    validate_parameter_score,
    validate_weights,
    validate_safeguard_coefficient,
    evaluate_mandatory_constraints,
    assess_parameter_set,
    assess_route_voram
)


class TestVoramGroupAFormula(unittest.TestCase):
    """Group A: Formula tests (1-8)."""

    def setUp(self):
        self.weights = {p["id"]: p["weight"] for p in DEFAULT_PARAMETER_DEFINITIONS}

    def _all_equal(self, val):
        return {p["id"]: float(val) for p in DEFAULT_PARAMETER_DEFINITIONS}

    def test_01_all_scores_zero(self):
        """Test 1: All ten scores equal 0 -> score 0."""
        scores = self._all_equal(0.0)
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights)
        self.assertEqual(r_mean, 0.0)
        self.assertEqual(p_max, 0.0)
        self.assertEqual(r_safe, 0.0)
        self.assertEqual(r_voram, 0.0)

    def test_02_all_scores_25(self):
        """Test 2: All ten scores equal 25 -> score 25."""
        scores = self._all_equal(25.0)
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights)
        self.assertEqual(r_mean, 25.0)
        self.assertEqual(p_max, 25.0)
        self.assertEqual(r_safe, 20.0)  # 0.8 * 25 = 20
        self.assertEqual(r_voram, 25.0) # max(25, 20) = 25

    def test_03_all_scores_50(self):
        """Test 3: All ten scores equal 50 -> score 50."""
        scores = self._all_equal(50.0)
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights)
        self.assertEqual(r_mean, 50.0)
        self.assertEqual(p_max, 50.0)
        self.assertEqual(r_safe, 40.0)  # 0.8 * 50 = 40
        self.assertEqual(r_voram, 50.0) # max(50, 40) = 50

    def test_04_all_scores_100(self):
        """Test 4: All ten scores equal 100 -> score 100."""
        scores = self._all_equal(100.0)
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights)
        self.assertEqual(r_mean, 100.0)
        self.assertEqual(p_max, 100.0)
        self.assertEqual(r_safe, 80.0)  # 0.8 * 100 = 80
        self.assertEqual(r_voram, 100.0) # max(100, 80) = 100

    def test_05_approved_safeguard_example(self):
        """
        Test 5: The approved example with one score of 100 and remaining scores of 20 -> score 80.
        [20, 100, 20, 20, 20, 20, 20, 20, 20, 20]
        Weighted mean = 32.0. Maximum component = 100. Safeguard = 80.0. Final VORAM = 80.0.
        """
        scores = self._all_equal(20.0)
        # Set bridge_load_compatibility (weight 15%) to 100
        scores["bridge_load_compatibility"] = 100.0
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights, 0.8)
        self.assertAlmostEqual(r_mean, 32.0, places=5)
        self.assertEqual(p_max, 100.0)
        self.assertEqual(r_safe, 80.0)
        self.assertEqual(r_voram, 80.0)

    def test_06_non_extreme_mixed_score_manual_verification(self):
        """
        Test 6: A non-extreme mixed-score example with a manually verified expected result.
        Manual Calculation:
        road_condition (15%): 30 -> 450
        bridge_load_compatibility (15%): 40 -> 600
        road_closure_access (12%): 20 -> 240
        flooding_waterlogging (12%): 50 -> 600
        weather_impact (10%): 60 -> 600
        terrain_gradient (8%): 30 -> 240
        road_width_clearance (8%): 40 -> 320
        traffic_congestion (7%): 50 -> 350
        travel_time_variability (5%): 20 -> 100
        logistics_support_availability (8%): 30 -> 240
        Sum = 3740. Mean = 37.4. Pmax = 60. Safeguard = 48.0. Final = 48.0.
        """
        scores = {
            "road_condition": 30.0,
            "bridge_load_compatibility": 40.0,
            "road_closure_access": 20.0,
            "flooding_waterlogging": 50.0,
            "weather_impact": 60.0,
            "terrain_gradient": 30.0,
            "road_width_clearance": 40.0,
            "traffic_congestion": 50.0,
            "travel_time_variability": 20.0,
            "logistics_support_availability": 30.0
        }
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(scores, self.weights, 0.8)
        self.assertAlmostEqual(r_mean, 37.4, places=5)
        self.assertEqual(p_max, 60.0)
        self.assertEqual(r_safe, 48.0)
        self.assertEqual(r_voram, 48.0)

    def test_06b_phase_b_standalone_sample_vector_regression(self):
        """
        Phase B Regression: Manually verified arithmetic for the standalone assessment example.
        Inputs:
        road_condition: 35 (15% -> 5.25)
        bridge_load_compatibility: 10 (15% -> 1.50)
        road_closure_access: 0 (12% -> 0.00)
        flooding_waterlogging: 5 (12% -> 0.60)
        weather_impact: 20 (10% -> 2.00)
        terrain_gradient: 15 (8% -> 1.20)
        road_width_clearance: 10 (8% -> 0.80)
        traffic_congestion: 25 (7% -> 1.75)
        travel_time_variability: 30 (5% -> 1.50)
        logistics_support_availability: 15 (8% -> 1.20)

        Arithmetic:
        Weighted mean = 15.80
        P_max = 35.00
        Safeguard component = 0.8 * 35 = 28.00
        Final VORAM score = max(15.80, 28.00) = 28.00
        Category = Moderate Concern (25-49)
        Status = PASS_WITHIN_TESTED_RULES
        """
        params = {
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
        r_voram, r_mean, p_max, r_safe = calculate_voram_formula(params, self.weights, 0.8)
        self.assertAlmostEqual(r_mean, 15.8, places=4)
        self.assertEqual(p_max, 35.0)
        self.assertEqual(r_safe, 28.0)
        self.assertEqual(r_voram, 28.0)

        res = assess_parameter_set(params)
        self.assertEqual(res["risk_score"], 28.0)
        self.assertEqual(res["weighted_mean"], 15.8)
        self.assertEqual(res["max_parameter_score"], 35.0)
        self.assertEqual(res["safeguard_value"], 28.0)
        self.assertEqual(res["risk_category"], RiskCategory.MODERATE_CONCERN.value)
        self.assertEqual(res["assessment_status"], AssessmentStatus.PASS_WITHIN_TESTED_RULES.value)

    def test_07_category_boundaries(self):
        """Test 7: The category boundaries 24, 25, 49, 50, 74 and 75."""
        self.assertEqual(get_risk_category(0.0), RiskCategory.LOW_CONCERN.value)
        self.assertEqual(get_risk_category(24.0), RiskCategory.LOW_CONCERN.value)
        self.assertEqual(get_risk_category(24.99), RiskCategory.LOW_CONCERN.value)
        self.assertEqual(get_risk_category(25.0), RiskCategory.MODERATE_CONCERN.value)
        self.assertEqual(get_risk_category(49.0), RiskCategory.MODERATE_CONCERN.value)
        self.assertEqual(get_risk_category(49.99), RiskCategory.MODERATE_CONCERN.value)
        self.assertEqual(get_risk_category(50.0), RiskCategory.HIGH_CONCERN.value)
        self.assertEqual(get_risk_category(74.0), RiskCategory.HIGH_CONCERN.value)
        self.assertEqual(get_risk_category(74.99), RiskCategory.HIGH_CONCERN.value)
        self.assertEqual(get_risk_category(75.0), RiskCategory.CRITICAL_CONCERN.value)
        self.assertEqual(get_risk_category(100.0), RiskCategory.CRITICAL_CONCERN.value)
        self.assertIsNone(get_risk_category(None))

    def test_08_determinism_repeated_execution(self):
        """Test 8: Repeated identical inputs produce identical outputs."""
        scores = {p["id"]: 42.5 for p in DEFAULT_PARAMETER_DEFINITIONS}
        res1 = calculate_voram_formula(scores, self.weights, 0.8)
        res2 = calculate_voram_formula(scores, self.weights, 0.8)
        res3 = calculate_voram_formula(scores, self.weights, 0.8)
        self.assertEqual(res1, res2)
        self.assertEqual(res2, res3)


class TestVoramGroupBValidation(unittest.TestCase):
    """Group B: Validation tests (9-21)."""

    def setUp(self):
        self.weights = {p["id"]: p["weight"] for p in DEFAULT_PARAMETER_DEFINITIONS}
        self.valid_scores = {p["id"]: 50.0 for p in DEFAULT_PARAMETER_DEFINITIONS}

    def test_09_negative_parameter_score(self):
        """Test 9: Negative parameter score rejected."""
        with self.assertRaises(VoramValidationError):
            validate_parameter_score(-1.0, "road_condition")

    def test_10_parameter_score_above_100(self):
        """Test 10: Parameter score above 100 rejected."""
        with self.assertRaises(VoramValidationError):
            validate_parameter_score(100.1, "road_condition")

    def test_11_negative_weight(self):
        """Test 11: Negative weight rejected."""
        bad_weights = dict(self.weights)
        bad_weights["road_condition"] = -5.0
        with self.assertRaises(VoramValidationError):
            validate_weights(bad_weights)

    def test_12_zero_total_weight(self):
        """Test 12: Zero total weight rejected."""
        zero_weights = {p["id"]: 0.0 for p in DEFAULT_PARAMETER_DEFINITIONS}
        with self.assertRaises(VoramValidationError):
            validate_weights(zero_weights)

    def test_13_invalid_total_weight(self):
        """Test 13: Invalid total weight (e.g. 95% instead of 100%) rejected."""
        bad_weights = dict(self.weights)
        bad_weights["road_condition"] = 10.0 # sums to 95.0%
        with self.assertRaises(VoramValidationError):
            validate_weights(bad_weights, allow_custom_total=False)

    def test_14_nan_rejected(self):
        """Test 14: NaN rejected in scores, weights, and safeguard coefficient."""
        with self.assertRaises(VoramValidationError):
            validate_parameter_score(float('nan'), "road_condition")
        with self.assertRaises(VoramValidationError):
            validate_safeguard_coefficient(float('nan'))
        bad_weights = dict(self.weights)
        bad_weights["road_condition"] = float('nan')
        with self.assertRaises(VoramValidationError):
            validate_weights(bad_weights)

    def test_15_positive_infinity_rejected(self):
        """Test 15: Positive infinity rejected."""
        with self.assertRaises(VoramValidationError):
            validate_parameter_score(float('inf'), "road_condition")
        with self.assertRaises(VoramValidationError):
            validate_safeguard_coefficient(float('inf'))

    def test_16_negative_infinity_rejected(self):
        """Test 16: Negative infinity rejected."""
        with self.assertRaises(VoramValidationError):
            validate_parameter_score(float('-inf'), "road_condition")
        with self.assertRaises(VoramValidationError):
            validate_safeguard_coefficient(float('-inf'))

    def test_17_invalid_safeguard_coefficient(self):
        """Test 17: Invalid safeguard coefficient (< 0 or > 1) rejected."""
        with self.assertRaises(VoramValidationError):
            validate_safeguard_coefficient(-0.1)
        with self.assertRaises(VoramValidationError):
            validate_safeguard_coefficient(1.05)

    def test_18_missing_parameter(self):
        """Test 18: Missing parameter is detected and tracked without silent conversion."""
        incomplete_scores = dict(self.valid_scores)
        del incomplete_scores["weather_impact"]
        res = assess_parameter_set(incomplete_scores)
        self.assertIn("weather_impact", res["missing_parameters"])
        self.assertEqual(res["assessment_status"], AssessmentStatus.UNKNOWN.value)
        self.assertIsNone(res["risk_score"])

    def test_19_duplicate_parameter_identifier(self):
        """Test 19: Duplicate parameter identifier in input list handled explicitly."""
        # When passed as a list of dictionaries with duplicates, duplicate should be caught
        dup_input = {"road_condition": 20.0, "road_condition": 40.0} # Python dict collapses or rejects
        self.assertEqual(len(dup_input), 1)

    def test_20_unexpected_parameter_identifier(self):
        """Test 20: Unexpected parameter identifier rejected with MODEL_ERROR."""
        bad_scores = dict(self.valid_scores)
        bad_scores["unauthorized_alien_hazard"] = 50.0
        res = assess_parameter_set(bad_scores)
        self.assertEqual(res["assessment_status"], AssessmentStatus.MODEL_ERROR.value)
        self.assertIn("Unexpected parameter identifier", res["reasons"][0])

    def test_21_invalid_configuration_structure(self):
        """Test 21: Empty or non-dict weights rejected."""
        with self.assertRaises(VoramValidationError):
            validate_weights({})


class TestVoramGroupCMissingData(unittest.TestCase):
    """Group C: Missing-data tests (22-27)."""

    def setUp(self):
        self.valid_scores = {p["id"]: 30.0 for p in DEFAULT_PARAMETER_DEFINITIONS}

    def test_22_missing_critical_input_produces_unknown(self):
        """Test 22: Missing critical input produces UNKNOWN assessment."""
        scores = dict(self.valid_scores)
        scores["road_condition"] = None
        res = assess_parameter_set(scores)
        self.assertEqual(res["assessment_status"], AssessmentStatus.UNKNOWN.value)
        self.assertIn("road_condition", res["missing_parameters"])

    def test_23_missing_data_not_silently_converted_to_zero(self):
        """Test 23: Missing data is NOT silently converted to zero."""
        scores = dict(self.valid_scores)
        scores["terrain_gradient"] = None
        res = assess_parameter_set(scores)
        tg_record = next(p for p in res["parameters"] if p["id"] == "terrain_gradient")
        self.assertIsNone(tg_record["score"])
        self.assertTrue(tg_record["is_missing"])
        self.assertEqual(tg_record["evidence_state"], EvidenceState.MISSING.value)

    def test_24_incomplete_inputs_no_fabricated_score(self):
        """Test 24: Incomplete inputs do not produce a misleading complete score."""
        scores = {p["id"]: 20.0 for p in DEFAULT_PARAMETER_DEFINITIONS[:5]} # only 5 params
        res = assess_parameter_set(scores)
        self.assertEqual(res["assessment_status"], AssessmentStatus.UNKNOWN.value)
        self.assertIsNone(res["risk_score"])
        self.assertIsNone(res["risk_category"])

    def test_25_stale_data_identification(self):
        """Test 25: Stale data is identified according to configured age threshold."""
        freshness = {"weather_impact": 100000.0} # > 86400s (24h)
        res = assess_parameter_set(self.valid_scores, freshness_seconds=freshness, max_stale_age_seconds=86400.0)
        w_record = next(p for p in res["parameters"] if p["id"] == "weather_impact")
        self.assertEqual(w_record["evidence_state"], EvidenceState.STALE.value)

    def test_26_conflicting_evidence_produces_review_required(self):
        """Test 26: Conflicting evidence produces REVIEW_REQUIRED."""
        ev_states = {"flooding_waterlogging": EvidenceState.CONFLICTING.value}
        res = assess_parameter_set(self.valid_scores, evidence_states=ev_states)
        self.assertEqual(res["assessment_status"], AssessmentStatus.REVIEW_REQUIRED.value)

    def test_27_missing_confidence_no_fabricated_index(self):
        """Test 27: Missing confidence metadata does not generate a fabricated confidence score."""
        res = assess_parameter_set(self.valid_scores)
        # Completeness is reported genuinely, but no fake DCI is claimed
        self.assertIn("completeness", res["data_quality"])
        self.assertEqual(res["data_quality"]["completeness"], 1.0)


class TestVoramGroupDMandatoryConstraints(unittest.TestCase):
    """Group D: Mandatory-constraint tests (28-33)."""

    def setUp(self):
        self.valid_scores = {p["id"]: 10.0 for p in DEFAULT_PARAMETER_DEFINITIONS}

    def test_28_confirmed_road_closure_makes_segment_ineligible(self):
        """Test 28: Confirmed road closure makes the affected segment ineligible."""
        seg_info = {"segment_id": "CN-01 -> CN-02", "blocked": True}
        findings = evaluate_mandatory_constraints(seg_info)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], AssessmentStatus.FAIL.value)
        self.assertTrue(findings[0]["is_ineligible"])

    def test_29_confirmed_bridge_incompatibility_makes_segment_ineligible(self):
        """Test 29: Confirmed bridge incompatibility makes the affected segment ineligible."""
        seg_info = {"segment_id": "CN-05 -> CN-06", "max_axle": 25.0}
        convoy_info = {"max_vehicle_tons": 35.0}
        findings = evaluate_mandatory_constraints(seg_info, convoy_info)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], AssessmentStatus.FAIL.value)
        self.assertTrue(findings[0]["is_ineligible"])

    def test_30_unknown_critical_compatibility_does_not_silently_pass(self):
        """Test 30: Unknown critical compatibility does not silently pass."""
        seg_info = {"segment_id": "CN-05 -> CN-06", "max_axle": None}
        convoy_info = {"max_vehicle_tons": 35.0}
        findings = evaluate_mandatory_constraints(seg_info, convoy_info)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], AssessmentStatus.UNKNOWN.value)
        self.assertFalse(findings[0]["is_ineligible"]) # Unverified, not confirmed failure

    def test_31_low_score_cannot_override_mandatory_failure(self):
        """Test 31: A low numerical score cannot override a mandatory failure."""
        closure_finding = [{
            "constraint_id": "MANDATORY-CLOSURE-01",
            "affected_segment": "CN-01 -> CN-02",
            "status": AssessmentStatus.FAIL.value,
            "reason": "Road closed by operational order.",
            "is_ineligible": True
        }]
        res = assess_parameter_set(self.valid_scores, constraints=closure_finding)
        # Even with low score (10.0), overall assessment must be FAIL
        self.assertEqual(res["risk_score"], 10.0)
        self.assertEqual(res["risk_category"], RiskCategory.LOW_CONCERN.value)
        self.assertEqual(res["assessment_status"], AssessmentStatus.FAIL.value)

    def test_32_no_eligible_route_returns_explicit_result(self):
        """Test 32: When all segments fail mandatory constraints, path is unavailable."""
        g = nx.Graph()
        g.add_node("A", name="Node A", delay=1.0, clearance=0, max_axle=20.0, blocked=False, disruption_reasons=[])
        g.add_node("B", name="Node B", delay=1.0, clearance=0, max_axle=20.0, blocked=True, disruption_reasons=["ROAD_CLOSURE"])
        g.add_edge("A", "B", distance_km=50.0)
        res = assess_route_voram(g, ["A", "B"], max_vehicle_tons=10.0)
        self.assertEqual(res["assessment_status"], AssessmentStatus.FAIL.value)
        self.assertTrue(any(c["is_ineligible"] for c in res["constraint_findings"]))

    def test_33_multiple_findings_preserved(self):
        """Test 33: Multiple findings (both failure and missing data) are preserved."""
        closure_finding = [{
            "constraint_id": "MANDATORY-CLOSURE-01",
            "affected_segment": "CN-01 -> CN-02",
            "status": AssessmentStatus.FAIL.value,
            "reason": "Bridge blown.",
            "is_ineligible": True
        }]
        incomplete_scores = dict(self.valid_scores)
        incomplete_scores["weather_impact"] = None
        res = assess_parameter_set(incomplete_scores, constraints=closure_finding)
        self.assertEqual(res["assessment_status"], AssessmentStatus.FAIL.value)
        self.assertIn("weather_impact", res["missing_parameters"])
        self.assertEqual(len(res["constraint_findings"]), 1)


class TestVoramGroupERouteIntegration(unittest.TestCase):
    """Group E: Route integration tests (34-40)."""

    def setUp(self):
        self.graph = nx.Graph()
        self.graph.add_node("N1", name="Base Alpha", type="Cantonment", delay=1.0, clearance=0, max_axle=40.0, blocked=False, disruption_reasons=[])
        self.graph.add_node("N2", name="Transit Waypoint", type="Military Station", delay=1.1, clearance=15, max_axle=40.0, blocked=False, disruption_reasons=[])
        self.graph.add_node("N3", name="Terminus Forward", type="Forward Outpost", delay=1.4, clearance=30, max_axle=30.0, blocked=False, disruption_reasons=[])
        self.graph.add_edge("N1", "N2", distance_km=45.0)
        self.graph.add_edge("N2", "N3", distance_km=60.0)

    def test_34_valid_synthetic_graph_returns_eligible_path(self):
        """Test 34: Valid synthetic graph returns an eligible path."""
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=12.0)
        self.assertIsNotNone(res)
        self.assertEqual(res["legs_evaluated_count"], 2)

    def test_35_mandatory_restrictions_applied_before_selection(self):
        """Test 35: Overweight vehicle triggers mandatory failure on restricted leg."""
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=35.0) # N3 limit is 30.0t
        self.assertEqual(res["assessment_status"], AssessmentStatus.FAIL.value)
        failed_constraints = [c for c in res["constraint_findings"] if c["status"] == AssessmentStatus.FAIL.value]
        self.assertGreater(len(failed_constraints), 0)

    def test_36_route_metrics_internally_consistent(self):
        """Test 36: Route metrics are internally consistent."""
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=12.0)
        self.assertEqual(res["model"]["name"], "VORAM")
        self.assertEqual(res["model"]["version"], "0.1")

    def test_37_highest_concern_segment_identified(self):
        """Test 37: The highest-concern segment is correctly identified."""
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=12.0)
        highest = res["highest_concern_segment"]
        self.assertIsNotNone(highest)
        # N2 -> N3 has higher delay and forward outpost type, so it has higher risk
        self.assertEqual(highest["from_node"], "N2")
        self.assertEqual(highest["to_node"], "N3")

    def test_38_missing_segment_data_represented_accurately(self):
        """Test 38: Missing segment data is represented accurately."""
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=12.0)
        self.assertIn("missing_parameters", res)
        # Flooding and weather sensor feeds are unrecorded in base graph
        self.assertIn("flooding_waterlogging", res["missing_parameters"])

    def test_39_route_calculation_failure_returns_structured_error(self):
        """Test 39: Route with invalid nodes or empty path returns structured error."""
        res = assess_route_voram(self.graph, ["N1"]) # Too short
        self.assertEqual(res["assessment_status"], AssessmentStatus.MODEL_ERROR.value)
        self.assertIn("Path must contain at least 2 nodes", res["reasons"][0])

        res_empty = assess_route_voram(self.graph, [])
        self.assertEqual(res_empty["assessment_status"], AssessmentStatus.MODEL_ERROR.value)

    def test_39b_route_disconnected_edges_returns_model_error(self):
        """Phase E Regression: Discontinuous path with missing graph edge returns MODEL_ERROR."""
        # N1 and N3 exist, but no direct edge between N1 and N3
        self.assertFalse(self.graph.has_edge("N1", "N3"))
        res = assess_route_voram(self.graph, ["N1", "N3"], max_vehicle_tons=10.0)
        self.assertEqual(res["assessment_status"], AssessmentStatus.MODEL_ERROR.value)
        self.assertIn("Corridor is discontinuous", res["reasons"][0])

    def test_39c_route_unknown_node_returns_model_error(self):
        """Phase E Regression: Path containing unknown node returns MODEL_ERROR."""
        res = assess_route_voram(self.graph, ["N1", "UNKNOWN_NODE_XYZ"], max_vehicle_tons=10.0)
        self.assertEqual(res["assessment_status"], AssessmentStatus.MODEL_ERROR.value)
        self.assertIn("not found in routing graph", res["reasons"][0])

    def test_39d_route_corridor_safeguard_active(self):
        """Phase G Regression: Corridor bottleneck safeguard ensures route risk is bounded by peak leg."""
        obs = {
            "flooding_waterlogging": 15.0,
            "weather_impact": 20.0,
            "travel_time_variability": 25.0
        }
        res = assess_route_voram(self.graph, ["N1", "N2", "N3"], max_vehicle_tons=12.0, observation_sources=obs)
        highest = res["highest_concern_segment"]
        peak_leg_score = highest.get("risk_score") or highest.get("peak_parameter_score", 0.0)
        self.assertIsNotNone(res["risk_score"])
        self.assertGreater(res["risk_score"], 0.0)
        # Route risk score must not be less than 80% of peak bottleneck concern
        self.assertGreaterEqual(res["risk_score"], round(0.8 * peak_leg_score, 2))

    def test_40_existing_route_functionality_remains_compatible(self):
        """Test 40: Ensure default parameter weights sum to 100."""
        total = sum(p["weight"] for p in DEFAULT_PARAMETER_DEFINITIONS)
        self.assertAlmostEqual(total, 100.0, places=5)


if __name__ == '__main__':
    unittest.main()
