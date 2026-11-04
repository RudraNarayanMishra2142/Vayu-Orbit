import datetime
from typing import Dict, Any, List, Optional
import json

# Fixed provenance vocabulary per specification
PROV_PLANNED = "PLANNED"
PROV_RECORDED = "RECORDED"
PROV_DERIVED = "DERIVED"
PROV_ESTIMATE = "ESTIMATE"
PROV_THEORETICAL = "THEORETICAL"
PROV_UNVERIFIED = "UNVERIFIED"
PROV_NOT_RECORDED = "NOT RECORDED"
PROV_UNAVAILABLE = "UNAVAILABLE"

IST_OFFSET = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def parse_iso_utc(iso_str: Optional[str]) -> Optional[datetime.datetime]:
    """Safely parses an ISO-8601 timestamp string into a timezone-aware datetime."""
    if not iso_str or not isinstance(iso_str, str):
        return None
    try:
        # Standard fromisoformat
        dt = datetime.datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        # Handle trailing Z or format variations
        clean = iso_str.replace("Z", "+00:00")
        try:
            return datetime.datetime.fromisoformat(clean)
        except Exception:
            return None

def format_timestamp_ist(iso_str: Optional[str]) -> str:
    """Converts a verified ISO UTC timestamp into standard Indian Standard Time (IST)."""
    dt = parse_iso_utc(iso_str)
    if not dt:
        return PROV_NOT_RECORDED if iso_str is None else str(iso_str)
    dt_ist = dt.astimezone(IST_OFFSET)
    return dt_ist.strftime("%d %b %Y, %H:%M:%S IST")

def format_date_ist(iso_str: Optional[str]) -> str:
    """Formats just date in IST."""
    dt = parse_iso_utc(iso_str)
    if not dt:
        return PROV_NOT_RECORDED if iso_str is None else str(iso_str)
    dt_ist = dt.astimezone(IST_OFFSET)
    return dt_ist.strftime("%d %b %Y")

def build_raw_journey_report(
    journey_row: Dict[str, Any],
    fuel_eval: Dict[str, Any],
    query_fn,
    node_map_fn,
    now_iso: str
) -> Dict[str, Any]:
    """
    Builds the exact JSON report structure required by GET /api/journeys/{id}/report.
    Guarantees 100% backwards compatibility with the existing JSON report contract.
    """
    j = journey_row
    route = j.get('route') or {}
    raw_path = route.get('path', [])
    
    # Resolve waypoint names
    nmap = node_map_fn() if callable(node_map_fn) else {}
    waypoints = []
    for nid in raw_path:
        w_name = nmap.get(nid, {}).get('installation_name')
        if not w_name and query_fn:
            p = query_fn("SELECT place_name FROM places WHERE place_id=? OR place_id=?", [nid, 'PLC-' + nid], True)
            w_name = p['place_name'] if p else nid
        waypoints.append({'node_id': nid, 'name': w_name or nid})

    route_summary = {
        'path': raw_path,
        'waypoints': waypoints,
        'distance_km': route.get('distance_km', j.get('distance_km')),
        'eta_hours': route.get('eta_hours') or j.get('eta_hours') or j.get('eta'),
        'risk_score': route.get('risk_score') if route.get('risk_score') is not None else (j.get('risk') if j.get('risk') is not None else j.get('risk_score')),
        'route_type': route.get('route_type', 'PRIMARY_PLANNED'),
        'corridor_name': route.get('corridor_name') or 'Primary Tactical Corridor',
        'explanation': route.get('explanation'),
        'vehicle_limit_tons': route.get('vehicle_limit_tons'),
        'waypoints_count': len(raw_path),
        'disclaimer': 'Represents planned mission corridor. Does not represent actual travelled GPS trajectory.'
    }

    # Historical committed convoy manifest
    convoy_manifest = []
    for idx, item in enumerate(j.get('convoy') or []):
        convoy_manifest.append({
            'position': item.get('position', idx + 1),
            'vehicle_id': item.get('vehicle_id'),
            'unit_id': item.get('unit_id'),
            'callsign': item.get('callsign'),
            'model_name': item.get('model_name') or item.get('name') or item.get('model') or 'Unspecified Model',
            'maker': item.get('maker'),
            'class_type': item.get('class_type'),
            'vehicle_role': item.get('vehicle_role') or item.get('role') or 'Troop / General Transport',
            'fuel_type': item.get('fuel_type') or 'DIESEL',
            'tank_capacity_liters': item.get('tank_capacity_liters'),
            'fuel_consumption_kmpl': item.get('fuel_consumption_kmpl'),
            'operational_range_km': item.get('operational_range_km'),
            'occupants': item.get('occupants', item.get('passengers', None)),
            'cargo_description': item.get('cargo_description') or item.get('cargo', None),
            'cargo_weight_kg': item.get('cargo_weight_kg', item.get('cargo_weight', None)),
            'evidence_status': 'Committed at plan creation; individual vehicle CAN bus telemetry unverified'
        })

    # Timeline with event classification & derived timestamps
    events = j.get('events') or []
    start_event = next((e for e in events if e.get('event_type') in ('ACTIVE', 'DEPARTED', 'STARTED')), None)
    comp_event = next((e for e in events if e.get('event_type') in ('COMPLETED', 'ARRIVED')), None)

    derived_timestamps = {
        'actual_departure': {
            'timestamp': start_event['created_at'] if start_event else None,
            'source': 'Derived from recorded events' if start_event else 'Unavailable (no departure event recorded)',
            'event_type': start_event['event_type'] if start_event else None,
            'is_gps_verified': False
        },
        'actual_completion': {
            'timestamp': comp_event['created_at'] if comp_event else None,
            'source': 'Derived from recorded events' if comp_event else 'Unavailable (no completion event recorded)',
            'event_type': comp_event['event_type'] if comp_event else None,
            'is_gps_verified': False
        },
        'checkpoint_passage': {
            'status': PROV_UNAVAILABLE,
            'source': 'No automated checkpoint sensor records found in database',
            'message': 'Recorded waypoint progress is limited to operator-reported events and incidents. Automated RFID/transponder passage sweeps are unrecorded.'
        }
    }

    # Format incidents with resolution details
    incidents = []
    for inc in (j.get('incidents') or []):
        incidents.append({
            'id': inc.get('id'),
            'rule_type': inc.get('rule_type'),
            'violation_type': inc.get('violation_type'),
            'severity': inc.get('severity') or 'MEDIUM',
            'message': inc.get('message'),
            'evidence_source': inc.get('evidence_source'),
            'observation_time': inc.get('observation_time'),
            'last_known_pos': inc.get('last_known_pos'),
            'verification_state': inc.get('verification_state'),
            'handling_state': inc.get('handling_state'),
            'operator_ack': inc.get('operator_ack'),
            'checkpoint_ack': inc.get('checkpoint_ack'),
            'occurrence_count': inc.get('occurrence_count', 1),
            'resolution_details': inc.get('resolution_details'),
            'created_at': inc.get('created_at'),
            'updated_at': inc.get('updated_at')
        })

    # Fuel evaluation synthesis
    fuel_intelligence = {
        'evaluation_mode': 'SIMULATED / THEORETICAL',
        'convoy_status': fuel_eval.get('convoy_status'),
        'convoy_message': fuel_eval.get('convoy_message'),
        'limiting_vehicle': fuel_eval.get('limiting_vehicle'),
        'limiting_usable_range_km': fuel_eval.get('limiting_usable_range_km'),
        'average_convoy_range_km': fuel_eval.get('average_convoy_range_km'),
        'reserve_percent': fuel_eval.get('reserve_percent'),
        'departure_fuel_mode': fuel_eval.get('departure_fuel_mode'),
        'total_distance_km': fuel_eval.get('total_distance_km'),
        'vehicles': fuel_eval.get('vehicles', []),
        'fuel_override': fuel_eval.get('fuel_override') or j.get('fuel_override'),
        'measured_fuel_burn_status': PROV_UNAVAILABLE,
        'disclaimer': 'Values are theoretical simulations derived from vehicle defense catalog specs and operator dip inputs. In-transit fuel telemetry was not recorded.'
    }

    # Data limitations (6-point disclosure)
    data_limitations = {
        'gps_telemetry': 'No GPS telemetry recorded. Real-time satellite coordinates and dynamic breadcrumb tracks were not captured.',
        'actual_route': 'Not verified without recorded GPS tracking coordinates or waypoint transponder sweeps.',
        'fuel_consumption': 'Actual measured in-transit fuel burn is unavailable. Reported values are deterministic simulations.',
        'checkpoint_history': 'Based solely on manual operator-logged incidents and status events; missing checkpoint timestamps remain unverified.',
        'timing': 'Planned departure and ETA are pre-mission estimates; actual departure and completion timestamps are derived from server-side event creation times.',
        'report_integrity': 'This debrief synthesizes persisted database records for logistics decision-support. It is not a cryptographically verified operational mission record.'
    }

    return {
        'journey_id': j.get('journey_id'),
        'name': j.get('name'),
        'status': j.get('status'),
        'origin_id': j.get('origin_id'),
        'origin_name': j.get('origin_name') or j.get('origin_id'),
        'dest_id': j.get('dest_id'),
        'dest_name': j.get('dest_name') or j.get('dest_id'),
        'departure_time': j.get('departure_time'),
        'departure_date': j.get('departure_date'),
        'eta': j.get('eta_hours') or j.get('eta'),
        'distance_km': j.get('distance_km'),
        'risk_score': j.get('risk') if j.get('risk') is not None else j.get('risk_score'),
        'created_at': j.get('created_at'),
        'updated_at': j.get('updated_at'),
        'generated_at': now_iso,
        'route_summary': route_summary,
        'convoy_manifest': convoy_manifest,
        'derived_timestamps': derived_timestamps,
        'events': events,
        'incidents': incidents,
        'fuel_intelligence': fuel_intelligence,
        'spacing_config': j.get('spacing_config'),
        'data_limitations': data_limitations
    }

def normalize_report_display_model(raw_report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms the raw report dictionary into a normalized display model
    annotating every value with its verified provenance tag.
    """
    model = {}

    # Root Metadata
    model["journey_id"] = str(raw_report.get("journey_id") or PROV_NOT_RECORDED)
    model["status"] = str(raw_report.get("status") or PROV_NOT_RECORDED)
    model["origin_name"] = str(raw_report.get("origin_name") or raw_report.get("origin_id") or PROV_NOT_RECORDED)
    model["dest_name"] = str(raw_report.get("dest_name") or raw_report.get("dest_id") or PROV_NOT_RECORDED)
    model["origin_id"] = str(raw_report.get("origin_id") or "")
    model["dest_id"] = str(raw_report.get("dest_id") or "")

    # Generation timestamp
    gen_at_raw = raw_report.get("generated_at")
    model["generated_at_ist"] = format_timestamp_ist(gen_at_raw)
    model["generated_at_utc"] = gen_at_raw or PROV_NOT_RECORDED

    # Planned Schedule & Geometry
    model["planned_date"] = str(raw_report.get("departure_date") or "").strip() or PROV_NOT_RECORDED
    model["planned_time"] = str(raw_report.get("departure_time") or "").strip() or PROV_NOT_RECORDED
    
    dist_val = raw_report.get("distance_km")
    model["raw_distance_km"] = float(dist_val) if dist_val is not None else 0.0
    model["distance_km"] = f"{float(dist_val):.1f} km" if dist_val is not None else PROV_NOT_RECORDED
    
    eta_val = raw_report.get("eta")
    model["raw_eta_hours"] = float(eta_val) if eta_val is not None else 0.0
    model["eta_hours"] = f"{float(eta_val):.1f} hrs" if eta_val is not None else PROV_NOT_RECORDED
    
    risk_val = raw_report.get("risk_score")
    model["raw_risk_score"] = float(risk_val) if risk_val is not None else None
    model["risk_score"] = f"{float(risk_val):.2f}" if risk_val is not None else PROV_NOT_RECORDED

    # Derived Timestamps
    derived = raw_report.get("derived_timestamps") or {}
    act_dep = derived.get("actual_departure") or {}
    act_comp = derived.get("actual_completion") or {}

    dep_ts = act_dep.get("timestamp")
    model["actual_departure_ist"] = format_timestamp_ist(dep_ts) if dep_ts else PROV_NOT_RECORDED
    model["departure_provenance"] = PROV_DERIVED if dep_ts else PROV_NOT_RECORDED
    model["departure_source_event"] = act_dep.get("event_type") or PROV_NOT_RECORDED

    comp_ts = act_comp.get("timestamp")
    model["actual_completion_ist"] = format_timestamp_ist(comp_ts) if comp_ts else PROV_NOT_RECORDED
    model["completion_provenance"] = PROV_DERIVED if comp_ts else PROV_NOT_RECORDED
    model["completion_source_event"] = act_comp.get("event_type") or PROV_NOT_RECORDED

    # Route Waypoints
    route_sum = raw_report.get("route_summary") or {}
    waypoints = route_sum.get("waypoints") or []
    norm_waypoints = []
    for idx, wp in enumerate(waypoints):
        norm_waypoints.append({
            "seq": idx + 1,
            "node_id": str(wp.get("node_id") or PROV_NOT_RECORDED),
            "name": str(wp.get("name") or wp.get("node_id") or PROV_NOT_RECORDED),
            "provenance": PROV_PLANNED
        })
    model["waypoints"] = norm_waypoints
    model["waypoints_count"] = len(norm_waypoints)
    model["corridor_name"] = str(route_sum.get("corridor_name") or "Primary Tactical Corridor")
    model["route_type"] = str(route_sum.get("route_type") or "PRIMARY_PLANNED")
    model["vehicle_limit_tons"] = route_sum.get("vehicle_limit_tons")

    # Convoy Manifest
    raw_convoy = raw_report.get("convoy_manifest") or []
    norm_convoy = []
    comp_counts = {}
    for idx, v in enumerate(raw_convoy):
        m_name = str(v.get("model_name") or PROV_NOT_RECORDED)
        comp_counts[m_name] = comp_counts.get(m_name, 0) + 1
        norm_convoy.append({
            "position": v.get("position", idx + 1),
            "vehicle_id": str(v.get("vehicle_id") or PROV_NOT_RECORDED),
            "unit_id": str(v.get("unit_id") or PROV_NOT_RECORDED),
            "callsign": str(v.get("callsign") or PROV_NOT_RECORDED),
            "model_name": m_name,
            "class_type": str(v.get("class_type") or PROV_NOT_RECORDED),
            "vehicle_role": str(v.get("vehicle_role") or "Troop / General Transport"),
            "fuel_type": str(v.get("fuel_type") or PROV_NOT_RECORDED),
            "rated_range": f"{v.get('operational_range_km')} km" if v.get("operational_range_km") is not None else PROV_NOT_RECORDED,
            "occupants": str(v.get("occupants")) if v.get("occupants") is not None else PROV_NOT_RECORDED,
            "cargo_weight": f"{v.get('cargo_weight_kg')} kg" if v.get("cargo_weight_kg") is not None else (f"{v.get('cargo_weight')} t" if v.get("cargo_weight") else PROV_NOT_RECORDED),
            "provenance": PROV_PLANNED
        })
    model["convoy"] = norm_convoy
    model["convoy_size"] = len(norm_convoy)
    model["vehicle_composition"] = [{"model": k, "count": v} for k, v in comp_counts.items()]

    # Fuel Intelligence
    fuel = raw_report.get("fuel_intelligence") or {}
    model["fuel_status"] = str(fuel.get("convoy_status") or PROV_THEORETICAL)
    model["fuel_message"] = str(fuel.get("convoy_message") or "")
    model["reserve_percent"] = f"{fuel.get('reserve_percent', 20.0):.1f}%"
    model["departure_fuel_mode"] = str(fuel.get("departure_fuel_mode") or "UNKNOWN")
    
    lim_v = fuel.get("limiting_vehicle") or {}
    model["limiting_vehicle_name"] = str(lim_v.get("model_name") or lim_v.get("vehicle_id") or PROV_UNAVAILABLE)
    lim_range = fuel.get("limiting_usable_range_km")
    model["limiting_usable_range"] = f"{float(lim_range):.1f} km" if lim_range is not None else PROV_UNAVAILABLE
    avg_range = fuel.get("average_convoy_range_km")
    model["average_convoy_range"] = f"{float(avg_range):.1f} km" if avg_range is not None else PROV_UNAVAILABLE

    # Per-vehicle fuel calculations
    fuel_vehs = fuel.get("vehicles") or []
    norm_fuel_vehs = []
    for fv in fuel_vehs:
        u_range = fv.get("usable_range_km")
        r_range = fv.get("rated_range_km") or fv.get("operational_range_km")
        norm_fuel_vehs.append({
            "vehicle_id": str(fv.get("vehicle_id") or PROV_NOT_RECORDED),
            "model_name": str(fv.get("model_name") or PROV_NOT_RECORDED),
            "departure_pct": f"{float(fv.get('departure_fuel_pct', 0)):.0f}%" if fv.get("departure_fuel_pct") is not None else PROV_UNVERIFIED,
            "usable_range": f"{float(u_range):.1f} km" if u_range is not None else PROV_UNAVAILABLE,
            "raw_usable_range_km": float(u_range) if u_range is not None else 0.0,
            "raw_rated_range_km": float(r_range) if r_range is not None else 0.0,
            "feasibility": str(fv.get("feasibility_status") or fv.get("feasibility") or PROV_THEORETICAL),
            "provenance": PROV_THEORETICAL
        })
    model["fuel_vehicles"] = norm_fuel_vehs
    model["fuel_override"] = fuel.get("fuel_override")

    # Timeline Events
    raw_events = raw_report.get("events") or []
    norm_events = []
    for ev in raw_events:
        norm_events.append({
            "id": ev.get("id"),
            "event_type": str(ev.get("event_type") or PROV_RECORDED),
            "message": str(ev.get("message") or ""),
            "timestamp_ist": format_timestamp_ist(ev.get("created_at")),
            "provenance": PROV_RECORDED
        })
    model["events"] = norm_events
    model["events_count"] = len(norm_events)

    # Incidents & Observations
    raw_incidents = raw_report.get("incidents") or []
    norm_incidents = []
    for inc in raw_incidents:
        res_det = inc.get("resolution_details")
        res_str = ""
        if isinstance(res_det, dict):
            res_str = res_det.get("details") or res_det.get("resolution") or json.dumps(res_det)
        elif res_det:
            res_str = str(res_det)

        norm_incidents.append({
            "id": str(inc.get("id") or PROV_RECORDED),
            "rule_type": str(inc.get("rule_type") or PROV_RECORDED),
            "violation_type": str(inc.get("violation_type") or PROV_RECORDED),
            "severity": str(inc.get("severity") or "MEDIUM"),
            "message": str(inc.get("message") or ""),
            "verification_state": str(inc.get("verification_state") or PROV_UNVERIFIED),
            "handling_state": str(inc.get("handling_state") or "OPEN"),
            "observation_time_ist": format_timestamp_ist(inc.get("observation_time")),
            "resolution_summary": res_str or (PROV_NOT_RECORDED if inc.get("handling_state") == "RESOLVED" else "Unresolved"),
            "provenance": PROV_RECORDED
        })
    model["incidents"] = norm_incidents
    model["incidents_count"] = len(norm_incidents)

    return model
