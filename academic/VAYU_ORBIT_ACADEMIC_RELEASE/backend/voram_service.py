"""
VORAM v0.1 — VAYU ORBIT Risk Assessment Model
==================================================

Authoritative implementation of the VAYU ORBIT Risk Assessment Model (v0.1).
Calculates multimodal risk scores across 10 weighted operational parameters,
enforces the maximum-component safeguard rule, evaluates mandatory physical
constraints (bridge load, road closures), tracks data provenance and freshness,
and integrates with tactical graph routing.

DISCLAIMER:
This model is experimental. Its weights, thresholds, and safeguard coefficient
have not been empirically validated or calibrated on live military operational
theatre telemetry. A passing score does NOT constitute a certificate of safety.
"""

from __future__ import annotations

import copy
import datetime
import math
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


# ─────────────────────────────────────────────────────────────────
# 1. MODEL METADATA & VERSIONING
# ─────────────────────────────────────────────────────────────────
MODEL_NAME = "VORAM"
MODEL_VERSION = "0.1"
CONFIG_VERSION = "0.1.0"
DEFAULT_SAFEGUARD_COEFFICIENT = 0.8
SAFEGUARD_COEF_MIN = 0.0
SAFEGUARD_COEF_MAX = 1.0


# ─────────────────────────────────────────────────────────────────
# 2. ENUMS & VOCABULARY
# ─────────────────────────────────────────────────────────────────
class AssessmentStatus(str, Enum):
    """Authoritative assessment outcome states."""
    PASS_WITHIN_TESTED_RULES = "PASS_WITHIN_TESTED_RULES"
    FAIL = "FAIL"
    UNKNOWN = "UNKNOWN"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    MODEL_ERROR = "MODEL_ERROR"


class EvidenceState(str, Enum):
    """Data provenance and evidence verification states."""
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"
    STALE = "STALE"
    MISSING = "MISSING"
    CONFLICTING = "CONFLICTING"
    DERIVED = "DERIVED"


class RiskCategory(str, Enum):
    """Provisional qualitative risk categories (Never label 'SAFE')."""
    LOW_CONCERN = "Low Concern"
    MODERATE_CONCERN = "Moderate Concern"
    HIGH_CONCERN = "High Concern"
    CRITICAL_CONCERN = "Critical Concern"


# ─────────────────────────────────────────────────────────────────
# 3. AUTHORITATIVE 10-PARAMETER CONFIGURATION (Total: 100%)
# ─────────────────────────────────────────────────────────────────
DEFAULT_PARAMETER_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "id": "road_condition",
        "name": "Road Condition",
        "weight": 15.0,
        "description": "Surface degradation, pavement distress, unpaved sectors, and carriageway defects.",
    },
    {
        "id": "bridge_load_compatibility",
        "name": "Bridge & Load Compatibility",
        "weight": 15.0,
        "description": "Bridge classification, culvert load ceilings, and gross vehicle weight safety margins.",
    },
    {
        "id": "road_closure_access",
        "name": "Road Closure & Access Restrictions",
        "weight": 12.0,
        "description": "Confirmed physical closures, military access checkpoints, curfew orders, and route blockades.",
    },
    {
        "id": "flooding_waterlogging",
        "name": "Flooding & Waterlogging",
        "weight": 12.0,
        "description": "Monsoon inundation, riverine spillage, low-lying water accumulation, and ford impassability.",
    },
    {
        "id": "weather_impact",
        "name": "Weather Impact",
        "weight": 10.0,
        "description": "Precipitation intensity, visibility reduction (dense fog/dust), high crosswinds, and thermal strain.",
    },
    {
        "id": "terrain_gradient",
        "name": "Terrain & Gradient",
        "weight": 8.0,
        "description": "Incline steepness, switchback hairpin frequency, narrow mountain pass friction, and soil stability.",
    },
    {
        "id": "road_width_clearance",
        "name": "Road Width & Clearance",
        "weight": 8.0,
        "description": "Carriageway width, vertical overhead clearance (underpasses/cables), and tight corner radius.",
    },
    {
        "id": "traffic_congestion",
        "name": "Traffic Congestion",
        "weight": 7.0,
        "description": "Civilian traffic density, urban transit friction, commercial choke points, and bottleneck delays.",
    },
    {
        "id": "travel_time_variability",
        "name": "Travel-Time Variability",
        "weight": 5.0,
        "description": "Transit time predictability, unpredictable checkpoint hold times, and corridor delay dispersion.",
    },
    {
        "id": "logistics_support_availability",
        "name": "Logistics Support Availability",
        "weight": 8.0,
        "description": "Proximity to military supply depots, recovery workshops, refuelling stations, and medical outposts.",
    },
]

# Quick parameter dictionary mapping
PARAMETER_DEF_MAP: Dict[str, Dict[str, Any]] = {
    p["id"]: p for p in DEFAULT_PARAMETER_DEFINITIONS
}

EXPECTED_PARAMETER_IDS: List[str] = [p["id"] for p in DEFAULT_PARAMETER_DEFINITIONS]


# ─────────────────────────────────────────────────────────────────
# 4. CUSTOM EXCEPTIONS
# ─────────────────────────────────────────────────────────────────
class VoramValidationError(ValueError):
    """Raised when VORAM inputs or configurations fail validation."""
    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.message = message
        self.field = field
        self.details = details


# ─────────────────────────────────────────────────────────────────
# 5. INPUT VALIDATION FUNCTIONS
# ─────────────────────────────────────────────────────────────────
def is_finite_number(val: Any) -> bool:
    """Check if value is a real finite int or float (excluding bools)."""
    if isinstance(val, bool) or val is None:
        return False
    if not isinstance(val, (int, float)):
        return False
    return not (math.isnan(val) or math.isinf(val))


def validate_parameter_score(score: Any, param_id: str) -> float:
    """
    Validates a parameter score:
    - Must be a finite number
    - Must be in range [0, 100]
    """
    if not is_finite_number(score):
        raise VoramValidationError(
            f"Parameter '{param_id}' score must be a finite real number between 0 and 100. Received: {score}",
            field=param_id
        )
    num = float(score)
    if num < 0.0 or num > 100.0:
        raise VoramValidationError(
            f"Parameter '{param_id}' score ({num}) is outside allowed bounds [0, 100].",
            field=param_id
        )
    return num


def validate_safeguard_coefficient(coef: Any) -> float:
    """Validates the safeguard coefficient (must be finite, between 0.0 and 1.0)."""
    if not is_finite_number(coef):
        raise VoramValidationError(
            f"Safeguard coefficient must be a finite number. Received: {coef}",
            field="safeguard_coefficient"
        )
    c = float(coef)
    if c < SAFEGUARD_COEF_MIN or c > SAFEGUARD_COEF_MAX:
        raise VoramValidationError(
            f"Safeguard coefficient ({c}) must be in range [{SAFEGUARD_COEF_MIN}, {SAFEGUARD_COEF_MAX}].",
            field="safeguard_coefficient"
        )
    return c


def validate_weights(weights: Dict[str, float], allow_custom_total: bool = False) -> float:
    """
    Validates weight configuration:
    - Non-negative finite numbers
    - Sum must equal 100% (or custom positive total if explicitly permitted)
    """
    if not isinstance(weights, dict) or not weights:
        raise VoramValidationError("Weights dictionary must not be empty.", field="weights")

    total = 0.0
    for pid, w in weights.items():
        if not is_finite_number(w):
            raise VoramValidationError(f"Weight for '{pid}' must be a finite number. Received: {w}", field=f"weights.{pid}")
        fw = float(w)
        if fw < 0.0:
            raise VoramValidationError(f"Weight for '{pid}' must be non-negative. Received: {fw}", field=f"weights.{pid}")
        total += fw

    if total <= 0.0:
        raise VoramValidationError(f"Total weights must be greater than zero. Sum: {total}", field="weights")

    if not allow_custom_total and abs(total - 100.0) > 1e-4:
        raise VoramValidationError(
            f"Configured weights must sum exactly to 100%. Current sum: {round(total, 4)}%",
            field="weights"
        )
    return total


def get_risk_category(score: Optional[float]) -> Optional[str]:
    """
    Maps numerical score to provisional risk category:
    - 0–24: Low Concern
    - 25–49: Moderate Concern
    - 50–74: High Concern
    - 75–100: Critical Concern
    Returns None if score is None.
    """
    if score is None:
        return None
    if score < 25.0:
        return RiskCategory.LOW_CONCERN.value
    elif score < 50.0:
        return RiskCategory.MODERATE_CONCERN.value
    elif score < 75.0:
        return RiskCategory.HIGH_CONCERN.value
    else:
        return RiskCategory.CRITICAL_CONCERN.value


# ─────────────────────────────────────────────────────────────────
# 6. CORE FORMULA IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────
def calculate_weighted_mean(scores: Dict[str, float], weights: Dict[str, float]) -> float:
    """
    Calculates weighted mean:
    R_mean = (sum_i W_i * P_i) / (sum_i W_i)
    """
    total_weight = sum(weights[k] for k in scores)
    if total_weight <= 0:
        raise VoramValidationError("Total weight for scoring calculation must be positive.")
    weighted_sum = sum(weights[k] * scores[k] for k in scores)
    return weighted_sum / total_weight


def calculate_voram_formula(
    scores: Dict[str, float],
    weights: Dict[str, float],
    safeguard_coefficient: float = DEFAULT_SAFEGUARD_COEFFICIENT
) -> Tuple[float, float, float, float]:
    """
    Computes the approved VORAM v0.1 composite risk formula:
    1. R_mean = sum(W_i * P_i) / 100
    2. P_max = max(P_1, ..., P_10)
    3. R_safeguard = safeguard_coefficient * P_max
    4. R_VORAM = max(R_mean, R_safeguard)

    Note: The default safeguard coefficient c=0.8 is provisional and has not been
    empirically calibrated against live operational military convoy telemetry.
    The approved model preserves the maximum-safeguard formulation, not a weighted blend.

    Returns:
    (r_voram, r_mean, p_max, r_safeguard) in full precision.
    """
    r_mean = calculate_weighted_mean(scores, weights)
    p_max = max(scores.values()) if scores else 0.0
    r_safeguard = safeguard_coefficient * p_max
    r_voram = max(r_mean, r_safeguard)
    return r_voram, r_mean, p_max, r_safeguard


# ─────────────────────────────────────────────────────────────────
# 7. MANDATORY CONSTRAINT ENGINE
# ─────────────────────────────────────────────────────────────────
def evaluate_mandatory_constraints(
    segment_info: Dict[str, Any],
    convoy_info: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Evaluates mandatory physical constraints:
    A. Confirmed road closure (makes segment ineligible)
    B. Confirmed bridge / load incompatibility (makes segment ineligible)
    C. Unknown critical compatibility (returns UNKNOWN status, does NOT silently pass)

    Returns list of structured findings.
    """
    findings: List[Dict[str, Any]] = []
    seg_id = str(segment_info.get("segment_id") or segment_info.get("name") or "SEGMENT-UNKNOWN")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 1. Road Closure / Blockage Check
    is_blocked = bool(segment_info.get("blocked"))
    disruptions = segment_info.get("disruption_reasons") or []
    if is_blocked or "ROAD_CLOSURE" in disruptions or segment_info.get("hazard_type") == "ROAD_CLOSURE":
        findings.append({
            "constraint_id": "MANDATORY-CLOSURE-01",
            "constraint_type": "ROAD_CLOSURE",
            "affected_segment": seg_id,
            "status": AssessmentStatus.FAIL.value,
            "reason": f"Confirmed road closure: Segment '{seg_id}' is physically impassable or blocked by operational command.",
            "evidence_reference": segment_info.get("evidence_ref") or "SITREP_CLOSURE_RECORD",
            "timestamp": segment_info.get("observation_time") or now_iso,
            "is_ineligible": True
        })

    # 2. Bridge & Load Compatibility Check
    max_vehicle_tons = 0.0
    if convoy_info:
        max_vehicle_tons = float(
            convoy_info.get("max_vehicle_tons")
            or convoy_info.get("max_axle_load_tons")
            or convoy_info.get("gross_convoy_weight_tons")
            or convoy_info.get("max_weight_tons")
            or 0.0
        )

    # Road / Bridge limit
    edge_limit = segment_info.get("max_safe_tonnage")
    node_limit = segment_info.get("max_axle") or segment_info.get("max_axle_load_tons") or segment_info.get("max_vehicle_tons")
    effective_limit = None

    if edge_limit is not None and is_finite_number(edge_limit):
        effective_limit = float(edge_limit)
    elif node_limit is not None and is_finite_number(node_limit) and float(node_limit) > 0:
        effective_limit = float(node_limit)

    if max_vehicle_tons > 0:
        if effective_limit is None:
            # Compatibility is critical to the assessment, but limit is unrecorded!
            findings.append({
                "constraint_id": "MANDATORY-LOAD-UNVERIFIED",
                "constraint_type": "BRIDGE_LOAD_COMPATIBILITY",
                "affected_segment": seg_id,
                "status": AssessmentStatus.UNKNOWN.value,
                "reason": f"Infrastructure load limit is unrecorded for segment '{seg_id}'. Vehicle weight {max_vehicle_tons} t cannot be verified against bridge ceiling.",
                "evidence_reference": "MIL_INFRASTRUCTURE_REGISTER_MISSING",
                "timestamp": now_iso,
                "is_ineligible": False  # Not confirmed failure, but critical incomplete
            })
        elif max_vehicle_tons > effective_limit:
            findings.append({
                "constraint_id": "MANDATORY-LOAD-EXCEEDED",
                "constraint_type": "BRIDGE_LOAD_COMPATIBILITY",
                "affected_segment": seg_id,
                "status": AssessmentStatus.FAIL.value,
                "reason": f"Confirmed load incompatibility: Convoy maximum vehicle weight ({max_vehicle_tons} t) exceeds infrastructure ceiling ({effective_limit} t) on segment '{seg_id}'.",
                "evidence_reference": segment_info.get("evidence_ref") or "MIL_NODE_MAX_AXLE",
                "timestamp": segment_info.get("observation_time") or now_iso,
                "is_ineligible": True
            })

    return findings


# ─────────────────────────────────────────────────────────────────
# 8. STANDALONE & COMPONENT ASSESSMENT SERVICE
# ─────────────────────────────────────────────────────────────────
def assess_parameter_set(
    parameter_scores: Dict[str, Any],
    weights: Optional[Dict[str, float]] = None,
    safeguard_coefficient: float = DEFAULT_SAFEGUARD_COEFFICIENT,
    evidence_states: Optional[Dict[str, str]] = None,
    constraints: Optional[List[Dict[str, Any]]] = None,
    freshness_seconds: Optional[Dict[str, float]] = None,
    max_stale_age_seconds: float = 86400.0,
    allow_custom_weights: bool = False
) -> Dict[str, Any]:
    """
    Performs a complete, auditable VORAM v0.1 assessment on an input parameter set.

    Parameters:
    - parameter_scores: Dict mapping parameter_id -> score (or None/missing).
    - weights: Optional custom weights mapping (defaults to DEFAULT_PARAMETER_DEFINITIONS).
    - safeguard_coefficient: Max-component safeguard factor (default 0.8).
    - evidence_states: Optional mapping parameter_id -> EvidenceState string.
    - constraints: Optional pre-evaluated or additional constraint findings.
    - freshness_seconds: Optional mapping parameter_id -> age of observation in seconds.
    - max_stale_age_seconds: Threshold beyond which observations become STALE (default 24h).
    - allow_custom_weights: Whether custom non-100% total weight is permitted.

    Returns:
    Standardized VORAM response dictionary.
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    warnings: List[str] = []
    reasons: List[str] = []

    # 1. Resolve and Validate Safeguard Coefficient
    try:
        coef = validate_safeguard_coefficient(safeguard_coefficient)
    except VoramValidationError as e:
        return {
            "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
            "assessment_status": AssessmentStatus.MODEL_ERROR.value,
            "risk_score": None,
            "risk_category": None,
            "safeguard_coefficient": safeguard_coefficient,
            "parameters": [],
            "missing_parameters": [],
            "constraint_findings": constraints or [],
            "data_quality": {"completeness": 0.0, "evidence_states": {}},
            "reasons": [str(e)],
            "warnings": ["Safeguard coefficient configuration error."],
            "assessed_at": now_iso
        }

    # 2. Resolve and Validate Weights
    active_weights: Dict[str, float] = {}
    if weights is not None:
        try:
            validate_weights(weights, allow_custom_total=allow_custom_weights)
            active_weights = {k: float(v) for k, v in weights.items()}
        except VoramValidationError as e:
            return {
                "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
                "assessment_status": AssessmentStatus.MODEL_ERROR.value,
                "risk_score": None,
                "risk_category": None,
                "safeguard_coefficient": coef,
                "parameters": [],
                "missing_parameters": [],
                "constraint_findings": constraints or [],
                "data_quality": {"completeness": 0.0, "evidence_states": {}},
                "reasons": [str(e)],
                "warnings": ["Model weight configuration error."],
                "assessed_at": now_iso
            }
    else:
        active_weights = {p["id"]: p["weight"] for p in DEFAULT_PARAMETER_DEFINITIONS}

    # 3. Parameter Validation & Completeness Check
    validated_scores: Dict[str, float] = {}
    missing_parameters: List[str] = []
    param_records: List[Dict[str, Any]] = []
    evidence_counts: Dict[str, int] = {}
    has_conflicting_evidence = False

    evidence_states = evidence_states or {}
    freshness_seconds = freshness_seconds or {}

    # Check for unexpected parameters
    for k in parameter_scores.keys():
        if k not in active_weights:
            return {
                "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
                "assessment_status": AssessmentStatus.MODEL_ERROR.value,
                "risk_score": None,
                "risk_category": None,
                "safeguard_coefficient": coef,
                "parameters": [],
                "missing_parameters": [],
                "constraint_findings": constraints or [],
                "data_quality": {"completeness": 0.0, "evidence_states": {}},
                "reasons": [f"Unexpected parameter identifier '{k}' not in configured VORAM parameters."],
                "warnings": [f"Unrecognized parameter key: {k}"],
                "assessed_at": now_iso
            }

    for p_def in DEFAULT_PARAMETER_DEFINITIONS:
        pid = p_def["id"]
        pname = p_def["name"]
        w = active_weights.get(pid, p_def["weight"])

        if pid not in parameter_scores or parameter_scores[pid] is None:
            missing_parameters.append(pid)
            ev_state = EvidenceState.MISSING.value
            param_records.append({
                "id": pid,
                "name": pname,
                "weight": w,
                "score": None,
                "evidence_state": ev_state,
                "is_missing": True,
                "status_note": f"Required input for '{pname}' is unavailable."
            })
            evidence_counts[ev_state] = evidence_counts.get(ev_state, 0) + 1
        else:
            raw_score = parameter_scores[pid]
            try:
                val = validate_parameter_score(raw_score, pid)
                validated_scores[pid] = val

                # Determine evidence state
                ev_state = evidence_states.get(pid, EvidenceState.VERIFIED.value)
                if ev_state not in [e.value for e in EvidenceState]:
                    ev_state = EvidenceState.UNVERIFIED.value

                # Freshness check
                age_sec = freshness_seconds.get(pid)
                if age_sec is not None and age_sec > max_stale_age_seconds:
                    ev_state = EvidenceState.STALE.value

                if ev_state == EvidenceState.CONFLICTING.value:
                    has_conflicting_evidence = True

                evidence_counts[ev_state] = evidence_counts.get(ev_state, 0) + 1

                param_records.append({
                    "id": pid,
                    "name": pname,
                    "weight": w,
                    "score": round(val, 2),
                    "evidence_state": ev_state,
                    "is_missing": False,
                    "status_note": None
                })
            except VoramValidationError as e:
                return {
                    "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
                    "assessment_status": AssessmentStatus.MODEL_ERROR.value,
                    "risk_score": None,
                    "risk_category": None,
                    "safeguard_coefficient": coef,
                    "parameters": [],
                    "missing_parameters": [],
                    "constraint_findings": constraints or [],
                    "data_quality": {"completeness": 0.0, "evidence_states": {}},
                    "reasons": [str(e)],
                    "warnings": [f"Validation failed for parameter '{pid}'"],
                    "assessed_at": now_iso
                }

    completeness = round(len(validated_scores) / len(DEFAULT_PARAMETER_DEFINITIONS), 2)

    # 4. Mandatory Constraints Evaluation
    constraint_findings = copy.deepcopy(constraints or [])
    has_mandatory_fail = any(
        c.get("status") == AssessmentStatus.FAIL.value or c.get("is_ineligible")
        for c in constraint_findings
    )
    has_unknown_constraint = any(
        c.get("status") == AssessmentStatus.UNKNOWN.value for c in constraint_findings
    )

    # 5. Score Calculation
    final_score: Optional[float] = None
    r_mean: Optional[float] = None
    p_max: Optional[float] = None
    r_safeguard: Optional[float] = None
    category: Optional[str] = None

    if validated_scores:
        p_max = round(max(validated_scores.values()), 2)

    if len(missing_parameters) == 0:
        # Full parameter set available: calculate formula
        r_voram, r_mean_val, p_max_val, r_safeguard_val = calculate_voram_formula(
            validated_scores, active_weights, coef
        )
        final_score = round(r_voram, 2)
        r_mean = round(r_mean_val, 2)
        p_max = round(p_max_val, 2)
        r_safeguard = round(r_safeguard_val, 2)
        category = get_risk_category(final_score)
    else:
        # Missing values must remain explicitly unknown. Do NOT silently convert to 0 or renormalize!
        warnings.append(
            f"Missing {len(missing_parameters)} critical parameter(s): {', '.join(missing_parameters)}. Complete numerical VORAM score cannot be calculated."
        )

    # 6. Overall Assessment Status Determination
    # Rule precedence:
    # 1) Mandatory failure -> FAIL (never overridden by low numerical score)
    # 2) Material conflicting evidence -> REVIEW_REQUIRED
    # 3) Missing critical parameter or unverified critical constraint -> UNKNOWN
    # 4) All checks pass with sufficient information -> PASS_WITHIN_TESTED_RULES
    if has_mandatory_fail:
        overall_status = AssessmentStatus.FAIL.value
        reasons.append("Mandatory physical constraint failure: Segment or route is ineligible under active movement criteria.")
    elif has_conflicting_evidence:
        overall_status = AssessmentStatus.REVIEW_REQUIRED.value
        reasons.append("Conflicting observations reported across parameter evidence sources. Tactical human review required.")
    elif len(missing_parameters) > 0 or has_unknown_constraint:
        overall_status = AssessmentStatus.UNKNOWN.value
        reasons.append("Assessment incomplete: Critical infrastructure or environmental parameters are missing or unrecorded.")
    else:
        overall_status = AssessmentStatus.PASS_WITHIN_TESTED_RULES.value
        reasons.append("All configured parameters evaluated and mandatory constraints passed within tested rules.")

    return {
        "model": {
            "name": MODEL_NAME,
            "version": MODEL_VERSION,
            "config_version": CONFIG_VERSION
        },
        "assessment_status": overall_status,
        "risk_score": final_score,
        "risk_category": category,
        "safeguard_coefficient": coef,
        "weighted_mean": r_mean,
        "max_parameter_score": p_max,
        "safeguard_value": r_safeguard,
        "parameters": param_records,
        "missing_parameters": missing_parameters,
        "constraint_findings": constraint_findings,
        "data_quality": {
            "completeness": completeness,
            "available_parameters_count": len(validated_scores),
            "total_parameters_count": len(DEFAULT_PARAMETER_DEFINITIONS),
            "evidence_states": evidence_counts
        },
        "reasons": reasons,
        "warnings": warnings,
        "assessed_at": now_iso
    }


# ─────────────────────────────────────────────────────────────────
# 9. GRAPH / CORRIDOR ROUTE INTEGRATION ENGINE
# ─────────────────────────────────────────────────────────────────
def evaluate_graph_leg_voram(
    graph,
    u: str,
    v: str,
    convoy_speed_kmh: float = 40.0,
    max_vehicle_tons: float = 0.0,
    observation_sources: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates VORAM parameters and constraints for a single leg between u and v in the routing graph.
    Extracts real infrastructure properties from graph nodes and edges.
    """
    if u not in graph.nodes:
        raise VoramValidationError(f"Waypoint '{u}' not found in routing graph.", field="u")
    if v not in graph.nodes:
        raise VoramValidationError(f"Waypoint '{v}' not found in routing graph.", field="v")
    if not graph.has_edge(u, v):
        raise VoramValidationError(f"No direct edge exists between '{u}' and '{v}'.", field="edge")

    edge = graph[u][v]
    target_node = graph.nodes[v]
    source_node = graph.nodes[u]

    distance_km = float(edge.get("distance_km") or 0.0)
    delay = float(target_node.get("delay") or 1.0)
    clearance_mins = float(target_node.get("clearance") or 0.0)

    # 1. Build Segment Info for Constraints
    seg_info = {
        "segment_id": f"{u} -> {v}",
        "name": f"{source_node.get('name', u)} to {target_node.get('name', v)}",
        "blocked": target_node.get("blocked", False),
        "disruption_reasons": target_node.get("disruption_reasons", []),
        "max_safe_tonnage": edge.get("max_safe_tonnage"),
        "max_axle": target_node.get("max_axle"),
        "evidence_ref": "GRAPH_TOPOLOGY_EDGE"
    }
    convoy_info = {"max_vehicle_tons": max_vehicle_tons, "speed_kmh": convoy_speed_kmh}
    constraints = evaluate_mandatory_constraints(seg_info, convoy_info)

    # 2. Derive Parameters from Verified Graph & Place Attributes
    # Note: Only genuinely available attributes are mapped; unavailable sources are explicitly marked MISSING!
    param_scores: Dict[str, Any] = {}
    evidence_states: Dict[str, str] = {}
    obs = observation_sources or {}

    # Road Condition (15%): derived from base delay multiplier and node highway type, or verified ROP observation
    if "road_condition" in obs and obs["road_condition"] is not None:
        param_scores["road_condition"] = float(obs["road_condition"])
        evidence_states["road_condition"] = EvidenceState.VERIFIED.value
    elif delay >= 1.0:
        rc_score = min(100.0, max(0.0, (delay - 1.0) * 35.0))
        param_scores["road_condition"] = round(rc_score, 1)
        evidence_states["road_condition"] = EvidenceState.DERIVED.value
    else:
        param_scores["road_condition"] = None
        evidence_states["road_condition"] = EvidenceState.MISSING.value

    # Bridge & Load Compatibility (15%):
    target_max_axle = target_node.get("max_axle")
    edge_tonnage = edge.get("max_safe_tonnage")
    lim = edge_tonnage if edge_tonnage is not None else target_max_axle

    if "bridge_load_compatibility" in obs and obs["bridge_load_compatibility"] is not None:
        param_scores["bridge_load_compatibility"] = float(obs["bridge_load_compatibility"])
        evidence_states["bridge_load_compatibility"] = EvidenceState.VERIFIED.value
    elif lim is not None and lim > 0 and max_vehicle_tons > 0:
        if max_vehicle_tons > lim:
            b_score = 100.0
        else:
            utilization = max_vehicle_tons / lim
            # 0% to 70% utilization -> 0 to 15 concern
            # 70% to 100% utilization -> 15 to 60 concern
            if utilization <= 0.7:
                b_score = utilization * 20.0
            else:
                b_score = 15.0 + (utilization - 0.7) / 0.3 * 45.0
        param_scores["bridge_load_compatibility"] = round(b_score, 1)
        evidence_states["bridge_load_compatibility"] = EvidenceState.VERIFIED.value
    elif max_vehicle_tons > 0 and lim is None:
        # Bridge limit is unrecorded
        param_scores["bridge_load_compatibility"] = None
        evidence_states["bridge_load_compatibility"] = EvidenceState.MISSING.value
    else:
        param_scores["bridge_load_compatibility"] = 0.0
        evidence_states["bridge_load_compatibility"] = EvidenceState.VERIFIED.value

    # Road Closure & Access Restrictions (12%):
    if "road_closure_access" in obs and obs["road_closure_access"] is not None:
        param_scores["road_closure_access"] = float(obs["road_closure_access"])
        evidence_states["road_closure_access"] = EvidenceState.VERIFIED.value
    elif target_node.get("blocked") or "ROAD_CLOSURE" in target_node.get("disruption_reasons", []):
        param_scores["road_closure_access"] = 100.0
        evidence_states["road_closure_access"] = EvidenceState.VERIFIED.value
    else:
        # Check clearance time: normal security checkpoint delay
        access_score = min(50.0, (clearance_mins / 60.0) * 15.0)
        param_scores["road_closure_access"] = round(access_score, 1)
        evidence_states["road_closure_access"] = EvidenceState.VERIFIED.value

    # Flooding & Waterlogging (12%):
    disruptions = target_node.get("disruption_reasons", [])
    if "flooding_waterlogging" in obs and obs["flooding_waterlogging"] is not None:
        param_scores["flooding_waterlogging"] = float(obs["flooding_waterlogging"])
        evidence_states["flooding_waterlogging"] = EvidenceState.VERIFIED.value
    elif any("FLOOD" in str(d).upper() or "WASHOUT" in str(d).upper() for d in disruptions):
        param_scores["flooding_waterlogging"] = 85.0
        evidence_states["flooding_waterlogging"] = EvidenceState.VERIFIED.value
    else:
        # No real-time hydrologic sensor feed in current database
        # Genuine reporting: hydrological telemetry unrecorded for this node
        param_scores["flooding_waterlogging"] = None
        evidence_states["flooding_waterlogging"] = EvidenceState.MISSING.value

    # Weather Impact (10%):
    if "weather_impact" in obs and obs["weather_impact"] is not None:
        param_scores["weather_impact"] = float(obs["weather_impact"])
        evidence_states["weather_impact"] = EvidenceState.VERIFIED.value
    elif "WEATHER_DISRUPTION" in disruptions:
        param_scores["weather_impact"] = 75.0
        evidence_states["weather_impact"] = EvidenceState.VERIFIED.value
    else:
        # Weather satellite / MET feed unrecorded
        param_scores["weather_impact"] = None
        evidence_states["weather_impact"] = EvidenceState.MISSING.value

    # Terrain & Gradient (8%):
    if "terrain_gradient" in obs and obs["terrain_gradient"] is not None:
        param_scores["terrain_gradient"] = float(obs["terrain_gradient"])
        evidence_states["terrain_gradient"] = EvidenceState.VERIFIED.value
    elif delay > 1.2:
        tg_score = min(80.0, (delay - 1.2) * 50.0 + 20.0)
        param_scores["terrain_gradient"] = round(tg_score, 1)
        evidence_states["terrain_gradient"] = EvidenceState.DERIVED.value
    else:
        param_scores["terrain_gradient"] = 10.0
        evidence_states["terrain_gradient"] = EvidenceState.DERIVED.value

    # Road Width & Clearance (8%):
    if "road_width_clearance" in obs and obs["road_width_clearance"] is not None:
        param_scores["road_width_clearance"] = float(obs["road_width_clearance"])
        evidence_states["road_width_clearance"] = EvidenceState.VERIFIED.value
    else:
        param_scores["road_width_clearance"] = round(min(60.0, clearance_mins * 0.5), 1)
        evidence_states["road_width_clearance"] = EvidenceState.DERIVED.value

    # Traffic Congestion (7%):
    if "traffic_congestion" in obs and obs["traffic_congestion"] is not None:
        param_scores["traffic_congestion"] = float(obs["traffic_congestion"])
        evidence_states["traffic_congestion"] = EvidenceState.VERIFIED.value
    elif "TRAFFIC_DISRUPTION" in disruptions:
        param_scores["traffic_congestion"] = 80.0
        evidence_states["traffic_congestion"] = EvidenceState.VERIFIED.value
    elif delay > 1.4:
        param_scores["traffic_congestion"] = round(min(70.0, (delay - 1.0) * 30.0), 1)
        evidence_states["traffic_congestion"] = EvidenceState.DERIVED.value
    else:
        param_scores["traffic_congestion"] = 15.0
        evidence_states["traffic_congestion"] = EvidenceState.DERIVED.value

    # Travel Time Variability (5%):
    if "travel_time_variability" in obs and obs["travel_time_variability"] is not None:
        param_scores["travel_time_variability"] = float(obs["travel_time_variability"])
        evidence_states["travel_time_variability"] = EvidenceState.VERIFIED.value
    else:
        # Live GPS transponder sweeps unrecorded
        param_scores["travel_time_variability"] = None
        evidence_states["travel_time_variability"] = EvidenceState.MISSING.value

    # Logistics Support Availability (8%):
    # Honors verified field reconnaissance observation if available, otherwise falls back to node type inference (DATA-01)
    logistics_obs = obs.get("logistics_support_availability") if obs else None
    if logistics_obs is not None:
        if isinstance(logistics_obs, dict):
            status = logistics_obs.get("status", "OBSERVED")
            rating = logistics_obs.get("rating")
            is_verified = bool(logistics_obs.get("verified"))
            if status == "CONFLICTING":
                param_scores["logistics_support_availability"] = float(rating) if (rating is not None and is_finite_number(rating) and 0.0 <= float(rating) <= 100.0) else 50.0
                evidence_states["logistics_support_availability"] = EvidenceState.CONFLICTING.value
            elif status in ("UNKNOWN", "NOT_ASSESSED", "NOT_OBSERVED"):
                param_scores["logistics_support_availability"] = None
                evidence_states["logistics_support_availability"] = EvidenceState.MISSING.value
            elif rating is not None and is_finite_number(rating) and 0.0 <= float(rating) <= 100.0:
                param_scores["logistics_support_availability"] = round(float(rating), 1)
                evidence_states["logistics_support_availability"] = EvidenceState.VERIFIED.value if is_verified else EvidenceState.DERIVED.value
            else:
                logistics_obs = None
        elif is_finite_number(logistics_obs):
            val = float(logistics_obs)
            if 0.0 <= val <= 100.0:
                param_scores["logistics_support_availability"] = round(val, 1)
                evidence_states["logistics_support_availability"] = EvidenceState.VERIFIED.value
            else:
                logistics_obs = None
        else:
            logistics_obs = None

    if logistics_obs is None:
        # Fallback to static node type inference (marked DERIVED)
        ntype = target_node.get("type", "")
        if ntype in ("Cantonment", "Military Station", "Air Force Station", "Naval Base"):
            param_scores["logistics_support_availability"] = 10.0 # Excellent support
            evidence_states["logistics_support_availability"] = EvidenceState.DERIVED.value
        elif ntype == "Forward Outpost":
            param_scores["logistics_support_availability"] = 65.0 # Limited forward support
            evidence_states["logistics_support_availability"] = EvidenceState.DERIVED.value
        else:
            param_scores["logistics_support_availability"] = 40.0
            evidence_states["logistics_support_availability"] = EvidenceState.DERIVED.value

    # Run parameter set assessment for this leg
    leg_assessment = assess_parameter_set(
        parameter_scores=param_scores,
        safeguard_coefficient=DEFAULT_SAFEGUARD_COEFFICIENT,
        evidence_states=evidence_states,
        constraints=constraints
    )

    leg_assessment["segment_id"] = f"{u} -> {v}"
    leg_assessment["distance_km"] = distance_km
    return leg_assessment


def assess_route_voram(
    graph,
    path: List[str],
    convoy_speed_kmh: float = 40.0,
    max_vehicle_tons: float = 0.0,
    observation_sources: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates an entire candidate route path under VORAM v0.1:
    1. Evaluates all legs individually
    2. Identifies highest-concern segment
    3. Aggregates mandatory constraints
    4. Applies conservative route-level synthesis (preserving max local concern safeguard)
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if not path or len(path) < 2:
        return {
            "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
            "assessment_status": AssessmentStatus.MODEL_ERROR.value,
            "risk_score": None,
            "risk_category": None,
            "reasons": ["Path must contain at least 2 nodes."],
            "warnings": [],
            "assessed_at": now_iso
        }

    # Verify all nodes exist in graph
    missing_nodes = [n for n in path if n not in graph.nodes]
    if missing_nodes:
        return {
            "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
            "assessment_status": AssessmentStatus.MODEL_ERROR.value,
            "risk_score": None,
            "risk_category": None,
            "reasons": [f"Waypoint '{n}' not found in routing graph." for n in missing_nodes],
            "warnings": [],
            "assessed_at": now_iso
        }

    # Verify corridor continuity (all edges exist)
    missing_edges = [(u, v) for u, v in zip(path, path[1:]) if not graph.has_edge(u, v)]
    if missing_edges:
        missing_str = ", ".join(f"{u} -> {v}" for u, v in missing_edges)
        return {
            "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "config_version": CONFIG_VERSION},
            "assessment_status": AssessmentStatus.MODEL_ERROR.value,
            "risk_score": None,
            "risk_category": None,
            "reasons": [f"Corridor is discontinuous: No navigable edge exists between {missing_str}."],
            "warnings": [],
            "assessed_at": now_iso
        }

    legs_assessments: List[Dict[str, Any]] = []
    all_constraints: List[Dict[str, Any]] = []
    all_missing_parameters: Set[str] = set()
    highest_concern_leg: Optional[Dict[str, Any]] = None
    max_leg_score = 0.0
    total_distance_km = 0.0

    # Track highest-concern segment using multidimensional concern rank:
    # 1) Mandatory failure
    # 2) Highest calculated risk score
    # 3) Highest evaluated peak parameter score (p_max)
    # 4) Highest weighted mean
    highest_concern_leg = None
    highest_concern_rank = (-1, -1.0, -1.0)

    for u, v in zip(path, path[1:]):
        leg_eval = evaluate_graph_leg_voram(
            graph, u, v, convoy_speed_kmh=convoy_speed_kmh, max_vehicle_tons=max_vehicle_tons,
            observation_sources=observation_sources
        )
        legs_assessments.append(leg_eval)
        total_distance_km += leg_eval.get("distance_km", 0.0)

        # Collect constraints
        for c in leg_eval.get("constraint_findings", []):
            all_constraints.append(c)

        # Collect missing parameters
        for mp in leg_eval.get("missing_parameters", []):
            all_missing_parameters.add(mp)

        # Rank leg concern
        leg_has_fail = 1 if (leg_eval.get("assessment_status") == AssessmentStatus.FAIL.value or any(c.get("is_ineligible") for c in leg_eval.get("constraint_findings", []))) else 0
        leg_score = leg_eval.get("risk_score") if leg_eval.get("risk_score") is not None else 0.0
        leg_pmax = leg_eval.get("max_parameter_score") if leg_eval.get("max_parameter_score") is not None else 0.0
        leg_mean = leg_eval.get("weighted_mean") if leg_eval.get("weighted_mean") is not None else 0.0
        leg_rank = (leg_has_fail, max(leg_score, leg_pmax), leg_mean)
        max_leg_score = max(max_leg_score, leg_score, leg_pmax)

        if highest_concern_leg is None or leg_rank > highest_concern_rank:
            highest_concern_rank = leg_rank
            highest_concern_leg = {
                "segment_id": leg_eval.get("segment_id"),
                "from_node": u,
                "to_node": v,
                "risk_score": leg_eval.get("risk_score"),
                "peak_parameter_score": leg_eval.get("max_parameter_score"),
                "risk_category": leg_eval.get("risk_category") or get_risk_category(leg_pmax),
                "assessment_status": leg_eval.get("assessment_status"),
                "reasons": leg_eval.get("reasons", [])
            }

    # Any mandatory failures along the route?
    has_mandatory_fail = any(
        c.get("status") == AssessmentStatus.FAIL.value or c.get("is_ineligible")
        for c in all_constraints
    )
    has_unknown_constraint = any(
        c.get("status") == AssessmentStatus.UNKNOWN.value for c in all_constraints
    )

    # Route-level score calculation:
    # Use distance-weighted segment scores with maximum-segment safeguard
    # to guarantee that a severe local bottleneck is never concealed by a low route average!
    valid_leg_scores = [
        (l.get("risk_score"), l.get("distance_km", 1.0))
        for l in legs_assessments
        if l.get("risk_score") is not None
    ]

    route_score: Optional[float] = None
    route_category: Optional[str] = None
    reasons: List[str] = []
    warnings: List[str] = []

    if len(valid_leg_scores) == len(legs_assessments) and len(all_missing_parameters) == 0:
        total_d = sum(d for _, d in valid_leg_scores) or 1.0
        weighted_avg = sum(s * d for s, d in valid_leg_scores) / total_d
        # Apply corridor safeguard: route score cannot be less than 80% of the peak bottleneck risk!
        safeguarded_route_score = max(weighted_avg, DEFAULT_SAFEGUARD_COEFFICIENT * max_leg_score)
        route_score = round(safeguarded_route_score, 2)
        route_category = get_risk_category(route_score)
    else:
        warnings.append(
            f"Route includes unmeasured segments or parameters ({', '.join(sorted(all_missing_parameters))}). Route-level numerical score reflects evaluated segments."
        )
        if valid_leg_scores:
            total_d = sum(d for _, d in valid_leg_scores) or 1.0
            weighted_avg = sum(s * d for s, d in valid_leg_scores) / total_d
            safeguarded_route_score = max(weighted_avg, DEFAULT_SAFEGUARD_COEFFICIENT * max_leg_score)
            route_score = round(safeguarded_route_score, 2)
            route_category = get_risk_category(route_score)

    if has_mandatory_fail:
        overall_status = AssessmentStatus.FAIL.value
        reasons.append("Mandatory physical constraint failure: Corridor contains impassable or load-incompatible segments.")
    elif len(all_missing_parameters) > 0 or has_unknown_constraint:
        overall_status = AssessmentStatus.UNKNOWN.value
        reasons.append("Route assessment has unverified data: Critical telemetry is unrecorded for one or more segments.")
    else:
        overall_status = AssessmentStatus.PASS_WITHIN_TESTED_RULES.value
        reasons.append("All corridor segments cleared within tested parameters.")

    return {
        "model": {
            "name": MODEL_NAME,
            "version": MODEL_VERSION,
            "config_version": CONFIG_VERSION
        },
        "assessment_status": overall_status,
        "risk_score": route_score,
        "risk_category": route_category,
        "safeguard_coefficient": DEFAULT_SAFEGUARD_COEFFICIENT,
        "highest_concern_segment": highest_concern_leg,
        "legs_evaluated_count": len(legs_assessments),
        "constraint_findings": all_constraints,
        "missing_parameters": sorted(list(all_missing_parameters)),
        "reasons": reasons,
        "warnings": warnings,
        "assessed_at": now_iso
    }
