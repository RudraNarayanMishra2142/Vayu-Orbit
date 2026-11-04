"""
VAYU ORBIT — Optional Pre-Staged Demonstration Data Seed Script
Creates pre-staged journeys in the isolated demonstration database only:
- Journey 1 (CMS-DEMO-ACTIVE-01): ACTIVE convoy with low departure fuel and spacing alert (for Scenarios 3 & 4)
- Journey 2 (CMS-DEMO-COMPLETED-02): COMPLETED mission with checkpoint events and debrief (for Scenario 5)

Safety Rules:
- Enforces strict SHA-256 check on production database.
- Never modifies or connects to backend/military_logistics.db.
- Uses deterministic IDs to allow clean re-execution without duplicate accumulation.
"""

import os
import sys
import sqlite3
import hashlib
import json
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
PROD_DB = os.path.join(BACKEND_DIR, 'military_logistics.db')
DEMO_DB = os.path.join(BACKEND_DIR, 'military_logistics_demo.db')

PROD_HASH_BASELINE = "F1932F759E0785DB0967B3EBD68CEB188206B0126C9100EA54599B61C3227D6C"

def verify_prod_hash():
    with open(PROD_DB, 'rb') as f:
        actual = hashlib.sha256(f.read()).hexdigest().upper()
    if actual != PROD_HASH_BASELINE:
        raise RuntimeError(f"FATAL: Production DB hash altered! Expected {PROD_HASH_BASELINE}, got {actual}")

def seed_demo_data():
    verify_prod_hash()
    print("=" * 70)
    print(" VAYU ORBIT — SEEDING PRE-STAGED DEMONSTRATION JOURNEYS")
    print("=" * 70)
    print(f" Target Database: {DEMO_DB}")

    if not os.path.exists(DEMO_DB):
        print(" Demo database not found. Run 'prepare_demo_db.py' first.")
        sys.exit(1)

    conn = sqlite3.connect(DEMO_DB)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    t_now = datetime.now(timezone.utc).isoformat()

    # Pre-staged Journey 1: ACTIVE journey for Fuel (Scenario 3) & Spacing (Scenario 4)
    j1_id = "CMS-DEMO-ACTIVE-01"
    c.execute("DELETE FROM journeys WHERE journey_id=?", [j1_id])
    c.execute("DELETE FROM journey_events WHERE journey_id=?", [j1_id])
    c.execute("DELETE FROM incidents WHERE journey_id=?", [j1_id])
    c.execute("DELETE FROM journey_spacing_config WHERE journey_id=?", [j1_id])
    c.execute("DELETE FROM journey_fuel_config WHERE journey_id=?", [j1_id])

    j1_convoy = [
        {
            "vehicle_id": "V-MSV-02",
            "model_name": "Tata LPTA 713 TC 4x4",
            "unit_id": "UNIT-001",
            "callsign": "ALPHA-LEAD",
            "gvw_tons": 7.75,
            "operational_range_km": 550,
            "fuel_type": "DIESEL",
            "passengers": 2,
            "cargo_tons": 2.5
        },
        {
            "vehicle_id": "V-MSV-01",
            "model_name": "Ashok Leyland Stallion 4x4",
            "unit_id": "UNIT-002",
            "callsign": "BRAVO-CARGO",
            "gvw_tons": 12.0,
            "operational_range_km": 500,
            "fuel_type": "DIESEL",
            "passengers": 2,
            "cargo_tons": 4.0
        }
    ]

    j1_route = {
        "mode": "balanced",
        "path": ["CN-55", "CN-45"],
        "distance_km": 202.5,
        "eta_hours": 3.4,
        "risk_score": 12.5,
        "explanation": "Balanced strategic highway corridor along NH-44."
    }

    c.execute("""
        INSERT INTO journeys (
            journey_id, origin_id, dest_id, origin_name, dest_name,
            departure_date, departure_time, status, convoy_json,
            route_json, baseline_route_json, risk, distance_km, eta_hours,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        j1_id, "CN-55", "CN-45", "Delhi Cantt", "Ambala Cantt",
        "2026-10-30", "06:00", "ACTIVE", json.dumps(j1_convoy),
        json.dumps(j1_route), json.dumps(j1_route), 12.5, 202.5, 3.4,
        t_now, t_now
    ])

    # Fuel configuration: 25% starting dip level
    c.execute("""
        INSERT INTO journey_fuel_config (
            journey_id, reserve_percent, departure_fuel_mode, vehicle_fuel_levels_json, updated_at, updated_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, [
        j1_id, 15.0, "MANUAL_DIP",
        json.dumps({"V-MSV-02": 25.0, "V-MSV-01": 30.0}),
        t_now, "coordinator@vayu.local",
        "DEMONSTRATION SIMULATION: Pre-departure dip logged at 25% capacity."
    ])

    # Spacing configuration: 50m - 120m
    c.execute("""
        INSERT INTO journey_spacing_config (
            journey_id, min_spacing_m, max_spacing_m, updated_at, updated_by, reason
        ) VALUES (?, ?, ?, ?, ?, ?)
    """, [
        j1_id, 50.0, 120.0, t_now, "coordinator@vayu.local",
        "DEMONSTRATION SIMULATION: Tactical highway convoy security protocol."
    ])

    # Journey 1 Events
    c.execute("""
        INSERT INTO journey_events (journey_id, event_type, message, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, [
        j1_id, "STATUS_CHANGE",
        "Mission created and dispatched under operational readiness order.",
        json.dumps({"status": "ACTIVE"}), t_now
    ])

    # Journey 1 Incident: Spacing violation
    inc1_id = "INC-DEMO-SPACING-01"
    c.execute("DELETE FROM incidents WHERE id=?", [inc1_id])
    c.execute("""
        INSERT INTO incidents (
            id, journey_id, vehicle_id, unit_id, rule_type, violation_type,
            message, evidence_source, observation_time, last_known_pos,
            verification_state, handling_state, occurrence_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        inc1_id, j1_id, "V-MSV-02", "UNIT-001", "SPACING_VIOLATION", "CONVOY_COMPRESSION",
        "DEMONSTRATION SIMULATION: Convoy compression observed at Checkpoint 1. Vehicle spacing reduced to 22m (min: 50m).",
        "CHECKPOINT_RADAR_OBSERVATION", t_now, "NH-44 KM 45",
        "UNVERIFIED", "OPEN", 1, t_now, t_now
    ])

    # Pre-staged Journey 2: COMPLETED mission for Checkpoint Coordination & PDF Debrief (Scenario 5)
    j2_id = "CMS-DEMO-COMPLETED-02"
    c.execute("DELETE FROM journeys WHERE journey_id=?", [j2_id])
    c.execute("DELETE FROM journey_events WHERE journey_id=?", [j2_id])
    c.execute("DELETE FROM incidents WHERE journey_id=?", [j2_id])
    c.execute("DELETE FROM journey_spacing_config WHERE journey_id=?", [j2_id])
    c.execute("DELETE FROM journey_fuel_config WHERE journey_id=?", [j2_id])

    j2_convoy = [
        {
            "vehicle_id": "V-MSV-02",
            "model_name": "Tata LPTA 713 TC 4x4",
            "unit_id": "UNIT-001",
            "callsign": "CONVOY-LEAD",
            "gvw_tons": 7.75,
            "operational_range_km": 550,
            "fuel_type": "DIESEL",
            "passengers": 2,
            "cargo_tons": 3.0
        }
    ]

    j2_route = {
        "mode": "balanced",
        "path": ["CN-01", "CN-21"],
        "distance_km": 486.6,
        "eta_hours": 13.5,
        "risk_score": 21.1,
        "explanation": "Tactical arterial bypass route avoiding Gwalior AFS closure."
    }

    c.execute("""
        INSERT INTO journeys (
            journey_id, origin_id, dest_id, origin_name, dest_name,
            departure_date, departure_time, status, convoy_json,
            route_json, baseline_route_json, risk, distance_km, eta_hours,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        j2_id, "CN-01", "CN-21", "Agra Cantt", "Jabalpur Cantt",
        "2026-10-26", "05:30", "COMPLETED", json.dumps(j2_convoy),
        json.dumps(j2_route), json.dumps(j2_route), 21.1, 486.6, 13.5,
        t_now, t_now
    ])

    # Journey 2 Full Event Timeline
    j2_events = [
        ("STATUS_CHANGE", "Mission scheduled and authorized by Logistics Command.", {"status": "SCHEDULED"}),
        ("STATUS_CHANGE", "Convoy dispatched from Agra Cantt on schedule.", {"status": "ACTIVE"}),
        ("CHECKPOINT_TRANSIT", "DEMONSTRATION SIMULATION: Convoy arrived at Checkpoint Dholpur. Security manifest verified.", {"checkpoint": "CP-DHOLPUR"}),
        ("ROUTE_MODIFICATION", "DEMONSTRATION SIMULATION: Refuelling stop completed at Jhansi Military Depot.", {"station_id": "PLC-CN-37"}),
        ("DELAY_RECORDED", "DEMONSTRATION SIMULATION: 30-minute delay incurred due to bridge civil inspection at Lalitpur.", {"delay_mins": 30}),
        ("CHECKPOINT_TRANSIT", "DEMONSTRATION SIMULATION: Checkpoint Sagar crossed. Transit telemetry verified.", {"checkpoint": "CP-SAGAR"}),
        ("STATUS_CHANGE", "Mission completed. All vehicles safely arrived at Jabalpur Cantt.", {"status": "COMPLETED"})
    ]

    for ev_type, ev_msg, ev_pay in j2_events:
        c.execute("""
            INSERT INTO journey_events (journey_id, event_type, message, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, [j2_id, ev_type, ev_msg, json.dumps(ev_pay), t_now])

    conn.commit()
    conn.close()

    verify_prod_hash()
    print("\n [OK] Pre-staged demonstration journeys created successfully:")
    print(f"      1. {j1_id} [ACTIVE]     - For Scenarios 3 & 4 (Fuel & Spacing Alerts)")
    print(f"      2. {j2_id} [COMPLETED]  - For Scenario 5 (Debrief & PDF Generation)")
    print(" [OK] Production database hash 100% UNCHANGED.")
    print("=" * 70)

if __name__ == '__main__':
    seed_demo_data()
