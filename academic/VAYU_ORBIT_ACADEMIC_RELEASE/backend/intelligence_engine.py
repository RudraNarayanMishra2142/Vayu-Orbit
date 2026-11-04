"""Phase 3 simulated intelligence extraction engine.

This module turns a human-readable SITREP into a small, auditable constraint
object. It deliberately uses deterministic rules so the academic prototype
works offline and remains reproducible.
"""
import re
from typing import Dict, List, Optional


BLOCKED_TERMS = (
    "blocked", "closed", "closure", "impassable", "unavailable", "cut off",
    "washed out", "washout", "not usable"
)
BRIDGE_TERMS = ("bridge", "culvert", "overpass")
WEATHER_TERMS = ("rain", "heavy rain", "flood", "flooding", "storm", "snow", "fog")
TRAFFIC_TERMS = ("traffic", "congestion", "congested", "slow moving")


def _normalise(text: str) -> str:
    return " ".join(text.lower().strip().split())


def _find_number(text: str, patterns: List[str]) -> Optional[float]:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except (TypeError, ValueError):
                pass
    return None


def _find_target_node(text: str, nodes: Dict[str, dict]) -> Optional[dict]:
    lowered = text.lower()

    # Prefer explicit node IDs such as CN-01 / MS-02.
    for node_id, node in nodes.items():
        if node_id.lower() in lowered:
            return {"node_id": node_id, "installation_name": node["installation_name"]}

    # Fall back to an installation-name match.
    matches = []
    for node_id, node in nodes.items():
        name = str(node.get("installation_name", ""))
        if name and name.lower() in lowered:
            matches.append((len(name), node_id, name))
    if matches:
        _, node_id, name = max(matches)
        return {"node_id": node_id, "installation_name": name}
    return None


def parse_sitrep(text: str, nodes: Dict[str, dict]) -> dict:
    """Extract a structured simulated disruption from free-text SITREP."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("SITREP text is required.")

    raw = text.strip()
    normalized = _normalise(raw)
    target = _find_target_node(raw, nodes)

    bridge = any(term in normalized for term in BRIDGE_TERMS)
    restricted_closure = bool(re.search(r"closed\s+to|restricted\s+to|limit(?:ed)?\s+to", normalized))
    blocked = any(term in normalized for term in BLOCKED_TERMS) and not restricted_closure
    weather = any(term in normalized for term in WEATHER_TERMS)
    traffic = any(term in normalized for term in TRAFFIC_TERMS)

    max_safe_tonnage = _find_number(
        normalized,
        [
            r"(?:max(?:imum)?|safe|limit|restricted to|up to)\s*(?:vehicle|load|gross|weight)?\s*(\d+(?:\.\d+)?)\s*(?:t|ton|tons|tonnes)",
            r"(\d+(?:\.\d+)?)\s*(?:t|ton|tons|tonnes)\s*(?:limit|maximum|max|restriction)",
            r"(?:above|over|exceeding)\s*(\d+(?:\.\d+)?)\s*(?:t|ton|tons|tonnes)",
        ],
    )

    delay_multiplier = _find_number(
        normalized,
        [
            r"(?:delay|delay multiplier)\s*(?:of|to|=)?\s*(\d+(?:\.\d+)?)\s*x",
            r"(\d+(?:\.\d+)?)\s*x\s*(?:delay|slower)",
        ],
    )

    traffic_increase_pct = _find_number(
        normalized,
        [r"(\d+(?:\.\d+)?)\s*%\s*(?:traffic|congestion)", r"traffic\s*(?:up|increase|increased)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s*%"],
    )

    if blocked:
        hazard_type = "ROAD_CLOSURE"
    elif max_safe_tonnage is not None and bridge:
        hazard_type = "BRIDGE_RESTRICTION"
    elif weather:
        hazard_type = "WEATHER_DISRUPTION"
    elif traffic or traffic_increase_pct is not None:
        hazard_type = "TRAFFIC_DISRUPTION"
    elif delay_multiplier is not None:
        hazard_type = "DELAY_UPDATE"
    else:
        hazard_type = "GENERAL_ALERT"

    severity = "HIGH" if blocked else "MEDIUM" if (max_safe_tonnage is not None or weather) else "LOW"

    return {
        "status": "PARSED",
        "hazard_type": hazard_type,
        "target_node": target,
        "blocked": blocked,
        "max_safe_tonnage": max_safe_tonnage,
        "delay_multiplier": delay_multiplier,
        "traffic_increase_pct": traffic_increase_pct,
        "severity": severity,
        "confidence": 0.96 if target else 0.72,
        "source_text": raw,
        "interpretation": _build_interpretation(hazard_type, target, max_safe_tonnage, blocked),
    }


def _build_interpretation(hazard_type, target, max_safe_tonnage, blocked):
    target_name = target["installation_name"] if target else "the referenced corridor"
    if hazard_type == "ROAD_CLOSURE":
        return f"Simulated closure applied to {target_name}."
    if hazard_type == "BRIDGE_RESTRICTION":
        return f"Simulated infrastructure limit of {max_safe_tonnage:g} tons applied near {target_name}."
    if hazard_type == "WEATHER_DISRUPTION":
        return f"Simulated weather-related delay/risk increase applied near {target_name}."
    if hazard_type == "TRAFFIC_DISRUPTION":
        return f"Simulated congestion impact applied near {target_name}."
    return f"Simulated intelligence alert associated with {target_name}."
