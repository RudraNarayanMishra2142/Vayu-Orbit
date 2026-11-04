"""Phase 4: deterministic what-if scenario engine for the academic CMS prototype.

Runs multiple simulated disruption scenarios against the same baseline and returns
comparable route/impact metrics. It does not use live operational or classified data.
"""
import networkx as nx
import tactical_router
import intelligence_engine


def _impact(before, after):
    if after is None:
        return {
            "route_changed": True,
            "distance_delta_km": None,
            "eta_delta_hours": None,
            "risk_delta": None,
        }
    return {
        "route_changed": before["path"] != after["path"],
        "distance_delta_km": round(after["distance_km"] - before["distance_km"], 2),
        "eta_delta_hours": round(after["eta_hours"] - before["eta_hours"], 2),
        "risk_delta": round(after["risk_score"] - before["risk_score"], 2),
    }


def _scenario_score(baseline, result):
    """Lower is better; infeasible scenarios receive a large penalty."""
    if result is None:
        return 10_000.0
    return (
        result["eta_hours"] * 2.0
        + result["distance_km"] * 0.20
        + result["risk_score"] * 5.0
    )


def run_what_if(db_path, nodes, origin_id, dest_id, speed_kmh, max_vehicle_tons, scenarios):
    baseline_graph = tactical_router.build_dynamic_graph(db_path)
    baseline_routes = tactical_router.calculate_route_options(
        baseline_graph, origin_id, dest_id, speed_kmh, max_vehicle_tons
    )
    baseline = baseline_routes[0]

    results = []
    for index, scenario in enumerate(scenarios, start=1):
        parsed = intelligence_engine.parse_sitrep(scenario["sitrep"], nodes)
        disruption = dict(parsed)

        # Bridge restrictions are corridor-specific in Phase 3. For a what-if
        # scenario, use the same simulated origin-to-target corridor rule.
        if disruption.get("hazard_type") == "BRIDGE_RESTRICTION":
            disruption["corridor_from_node"] = origin_id

        graph = tactical_router.build_dynamic_graph(db_path, disruptions=[disruption])
        try:
            routes = tactical_router.calculate_route_options(
                graph, origin_id, dest_id, speed_kmh, max_vehicle_tons
            )
            selected = routes[0]
            status = "FEASIBLE"
            error = None
        except (nx.NetworkXNoPath, ValueError) as exc:
            routes = []
            selected = None
            status = "INFEASIBLE"
            error = str(exc)

        impact = _impact(baseline, selected)
        results.append({
            "scenario_id": f"SC-{index:02d}",
            "name": scenario["name"],
            "status": status,
            "input_sitrep": scenario["sitrep"],
            "intelligence": parsed,
            "selected_route": selected,
            "routes": routes,
            "impact": impact,
            "comparison_score": round(_scenario_score(baseline, selected), 2),
            "error": error,
        })

    feasible = [item for item in results if item["status"] == "FEASIBLE"]
    ranked = sorted(feasible, key=lambda item: item["comparison_score"])

    for rank, item in enumerate(ranked, start=1):
        item["rank"] = rank

    recommendation = None
    if ranked:
        best = ranked[0]
        recommendation = {
            "scenario_id": best["scenario_id"],
            "scenario_name": best["name"],
            "reason": "Lowest composite simulated ETA, distance and risk score among feasible scenarios.",
            "route": best["selected_route"]["path"],
        }

    return {
        "status": "SIMULATION_COMPLETE",
        "phase": 4,
        "model": "deterministic-what-if-simulation",
        "baseline": {
            "selected_route": baseline,
            "routes": baseline_routes,
        },
        "scenario_count": len(results),
        "feasible_count": len(feasible),
        "infeasible_count": len(results) - len(feasible),
        "scenarios": results,
        "recommendation": recommendation,
    }
