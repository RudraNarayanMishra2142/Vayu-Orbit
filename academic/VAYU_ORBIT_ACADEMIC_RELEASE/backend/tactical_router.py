import math
import sqlite3
import networkx as nx
import voram_service


def haversine_distance(lat1, lon1, lat2, lon2):
    """Straight-line distance used by this academic/simulated corridor graph."""
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_dynamic_graph(db_path="military_logistics.db", max_edge_distance_km=800, disruptions=None):
    """Build the simulated corridor graph and optionally apply Phase 3 disruptions."""
    disruptions = disruptions or []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT m.node_id, m.installation_name, m.node_type, m.lat, m.lon,
                   m.delay_multiplier, m.clearance_time_mins,
                   CASE WHEN p.place_id IS NOT NULL THEN p.max_vehicle_tons ELSE m.max_axle_load_tons END AS max_axle_load_tons,
                   p.status AS place_status
            FROM military_nodes m
            LEFT JOIN places p ON (p.place_id = m.node_id OR p.place_id = 'PLC-' || m.node_id)
        """).fetchall()
    except Exception:
        rows = conn.execute("""
            SELECT node_id, installation_name, node_type, lat, lon,
                   delay_multiplier, clearance_time_mins, max_axle_load_tons,
                   NULL AS place_status
            FROM military_nodes
        """).fetchall()
    conn.close()

    graph = nx.Graph()
    for row in rows:
        if row["lat"] is None or row["lon"] is None:
            continue
        place_status = row["place_status"] if "place_status" in row.keys() else None
        is_closed = (place_status == 'CLOSED')
        graph.add_node(
            row["node_id"], name=row["installation_name"], type=row["node_type"],
            lat=row["lat"], lon=row["lon"], delay=row["delay_multiplier"] or 1.0,
            clearance=row["clearance_time_mins"] or 0, max_axle=row["max_axle_load_tons"],
            blocked=is_closed, disruption_reasons=(["ROAD_CLOSURE"] if is_closed else [])
        )

    ids = list(graph.nodes)
    for i, u in enumerate(ids):
        for v in ids[i + 1:]:
            distance = haversine_distance(
                graph.nodes[u]["lat"], graph.nodes[u]["lon"],
                graph.nodes[v]["lat"], graph.nodes[v]["lon"]
            )
            if distance <= max_edge_distance_km:
                graph.add_edge(u, v, distance_km=distance)

    apply_disruptions(graph, disruptions)
    return graph


def apply_disruptions(graph, disruptions):
    """Apply simulated intelligence constraints to an in-memory graph."""
    for disruption in disruptions or []:
        target = disruption.get("target_node") or {}
        node_id = target.get("node_id") if isinstance(target, dict) else target
        if not node_id or node_id not in graph:
            continue

        node = graph.nodes[node_id]
        hazard = disruption.get("hazard_type", "GENERAL_ALERT")
        node["disruption_reasons"].append(hazard)

        if disruption.get("blocked") or hazard == "ROAD_CLOSURE":
            node["blocked"] = True

        limit = disruption.get("max_safe_tonnage")
        if limit is not None:
            # Bridge/infrastructure restrictions are corridor-specific in this
            # academic graph.  Do not lower the destination node capacity,
            # otherwise every possible final leg into the destination would
            # incorrectly become infeasible.
            corridor_from = disruption.get("corridor_from_node")
            if hazard == "BRIDGE_RESTRICTION" and corridor_from in graph and graph.has_edge(corridor_from, node_id):
                graph[corridor_from][node_id]["max_safe_tonnage"] = float(limit)
                graph[corridor_from][node_id]["disruption_reason"] = hazard
            else:
                current = node.get("max_axle", 0)
                node["max_axle"] = min(current, float(limit)) if current else float(limit)

        delay = disruption.get("delay_multiplier")
        if delay is not None:
            node["delay"] = max(float(node.get("delay", 1.0)), float(delay))
        elif hazard == "WEATHER_DISRUPTION":
            node["delay"] = max(float(node.get("delay", 1.0)), 1.35)
        elif hazard == "TRAFFIC_DISRUPTION":
            pct = disruption.get("traffic_increase_pct") or 25.0
            node["delay"] = float(node.get("delay", 1.0)) * (1.0 + float(pct) / 100.0 * 0.35)


def _edge_metrics(graph, u, v, convoy_speed_kmh, max_vehicle_tons):
    edge = graph[u][v]
    target = graph.nodes[v]
    distance = edge["distance_km"]
    delay = target["delay"]
    clearance = target["clearance"] / 60.0

    if target.get("blocked"):
        return None
    if target["max_axle"] and max_vehicle_tons > target["max_axle"]:
        return None
    edge_limit = edge.get("max_safe_tonnage")
    if edge_limit is not None and max_vehicle_tons > edge_limit:
        return None

    terrain_factor = 1.0 + max(0.0, delay - 1.0) * 0.55
    time_hours = (distance / max(convoy_speed_kmh, 1.0)) * delay + clearance
    risk = min(100.0, (delay - 1.0) * 35.0 + (clearance / 30.0) * 8.0)
    score = distance * terrain_factor + time_hours * 20.0 + risk * 4.0

    return {"distance_km": distance, "time_hours": time_hours, "risk_score": risk, "score": score}


def _route_result(graph, path, convoy_speed_kmh, max_vehicle_tons, mode):
    legs = []
    total_distance = 0.0
    total_hours = 0.0
    risk_values = []

    for u, v in zip(path, path[1:]):
        metrics = _edge_metrics(graph, u, v, convoy_speed_kmh, max_vehicle_tons)
        if metrics is None:
            return None
        legs.append({
            "from": u, "from_name": graph.nodes[u]["name"],
            "to": v, "to_name": graph.nodes[v]["name"],
            **{k: round(val, 2) for k, val in metrics.items()}
        })
        total_distance += metrics["distance_km"]
        total_hours += metrics["time_hours"]
        risk_values.append(metrics["risk_score"])

    # Evaluate VORAM v0.1 assessment for the complete route
    voram_eval = voram_service.assess_route_voram(graph, path, convoy_speed_kmh, max_vehicle_tons)

    return {
        "mode": mode,
        "path": path,
        "legs": legs,
        "distance_km": round(total_distance, 2),
        "eta_hours": round(total_hours, 2),
        "risk_score": round(sum(risk_values) / len(risk_values), 2) if risk_values else 0,
        "vehicle_limit_tons": max_vehicle_tons,
        "explanation": _explain(mode, total_distance, total_hours, risk_values),
        "voram_assessment": voram_eval,
    }


def _explain(mode, distance, hours, risks):
    labels = {
        "balanced": "Balances distance, transit time and simulated corridor risk.",
        "fastest": "Prioritizes lower estimated transit time.",
        "lowest_risk": "Prioritizes lower simulated route-risk factors.",
    }
    return labels.get(mode, "Generated from the configured route scoring model.")


def calculate_route_options(graph, source_id, target_id, convoy_speed_kmh, max_vehicle_tons=0):
    """Return up to three explainable route alternatives using different objectives."""
    if source_id not in graph or target_id not in graph:
        raise ValueError("Origin or destination node is not present in the routing graph.")
    if source_id == target_id:
        raise ValueError("Origin and destination cannot be the same.")
    if graph.nodes[source_id].get("blocked") or graph.nodes[target_id].get("blocked"):
        raise nx.NetworkXNoPath("Origin or destination is blocked by a simulated disruption.")

    def weight_for(mode):
        def weight(u, v, data):
            metrics = _edge_metrics(graph, u, v, convoy_speed_kmh, max_vehicle_tons)
            if metrics is None:
                return float("inf")
            if mode == "fastest":
                return metrics["time_hours"]
            if mode == "lowest_risk":
                return metrics["risk_score"] + metrics["distance_km"] * 0.002
            return metrics["score"]
        return weight

    routes = []
    seen = set()
    for mode in ("balanced", "fastest", "lowest_risk"):
        try:
            path = nx.shortest_path(graph, source_id, target_id, weight=weight_for(mode))
        except nx.NetworkXNoPath:
            continue
        if tuple(path) in seen:
            continue
        seen.add(tuple(path))
        result = _route_result(graph, path, convoy_speed_kmh, max_vehicle_tons, mode)
        if result:
            routes.append(result)

    if not routes:
        raise nx.NetworkXNoPath("No constraint-compatible simulated route exists.")

    return routes


def calculate_convoy_route(graph, source_id, target_id, convoy_speed_kmh, max_vehicle_tons=0):
    """Backward-compatible wrapper: returns the balanced route."""
    return calculate_route_options(graph, source_id, target_id, convoy_speed_kmh, max_vehicle_tons)[0]
