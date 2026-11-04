import os
import sys
import json
import sqlite3
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple, List

CANONICAL_SPEC_FIELDS = [
    "axle_config",
    "class_type",
    "fuel_consumption_kmpl",
    "fuel_spec_verified",
    "fuel_type",
    "gvw_tons",
    "is_vip",
    "maker",
    "max_speed_kmh",
    "model_name",
    "operational_range_km",
    "passenger_capacity_verified",
    "payload_capacity_verified",
    "rated_passenger_capacity",
    "rated_payload_tons",
    "role_category",
    "routing_footprint",
    "tank_capacity_liters",
    "vehicle_id"
]

REVISION_TRIGGER_FIELDS = [
    # 5 Identity fields
    "model_name",
    "maker",
    "axle_config",
    "role_category",
    "is_vip",
    # 13 Technical / verification fields
    "gvw_tons",
    "operational_range_km",
    "max_speed_kmh",
    "fuel_type",
    "tank_capacity_liters",
    "fuel_consumption_kmpl",
    "class_type",
    "routing_footprint",
    "rated_passenger_capacity",
    "rated_payload_tons",
    "passenger_capacity_verified",
    "payload_capacity_verified",
    "fuel_spec_verified"
]

DISPLAY_METADATA_FIELDS = {"image_url", "capacity_source_note"}

PROVENANCE_CATEGORIES = {
    "CLAIMED_VERIFIED_NO_EVIDENCE",
    "ESTIMATED",
    "UNVERIFIED",
    "UNKNOWN"
}

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def compute_canonical_spec_dict(row_or_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Produces a normalized, deterministic dictionary of the 19 canonical contract fields.
    """
    d = dict(row_or_dict)
    
    def _round_float(val: Any) -> Optional[float]:
        if val is None or val == "":
            return None
        try:
            return round(float(val), 4)
        except (ValueError, TypeError):
            return None

    def _int_or_none(val: Any) -> Optional[int]:
        if val is None or val == "":
            return None
        try:
            return int(val)
        except (ValueError, TypeError):
            return None

    return {
        "axle_config": str(d.get("axle_config") or ""),
        "class_type": str(d.get("class_type") or ""),
        "fuel_consumption_kmpl": _round_float(d.get("fuel_consumption_kmpl")),
        "fuel_spec_verified": int(d.get("fuel_spec_verified") or 0),
        "fuel_type": str(d.get("fuel_type") or "DIESEL"),
        "gvw_tons": _round_float(d.get("gvw_tons")) or 0.0,
        "is_vip": int(d.get("is_vip") or 0),
        "maker": str(d.get("maker") or ""),
        "max_speed_kmh": _int_or_none(d.get("max_speed_kmh")) or 0,
        "model_name": str(d.get("model_name") or ""),
        "operational_range_km": _int_or_none(d.get("operational_range_km")) or 0,
        "passenger_capacity_verified": int(d.get("passenger_capacity_verified") or 0),
        "payload_capacity_verified": int(d.get("payload_capacity_verified") or 0),
        "rated_passenger_capacity": _int_or_none(d.get("rated_passenger_capacity")),
        "rated_payload_tons": _round_float(d.get("rated_payload_tons")),
        "role_category": str(d.get("role_category") or "DUAL"),
        "routing_footprint": str(d.get("routing_footprint") or ""),
        "tank_capacity_liters": _round_float(d.get("tank_capacity_liters")),
        "vehicle_id": str(d.get("vehicle_id") or "")
    }

def compute_spec_hash(spec_dict: Dict[str, Any]) -> str:
    """
    Computes a cryptographic SHA-256 hash over the canonical JSON representation
    with sorted keys and compact separators.
    """
    canon = compute_canonical_spec_dict(spec_dict)
    json_bytes = json.dumps(canon, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(json_bytes).hexdigest()

def classify_spec_changes(before_dict: Dict[str, Any], after_dict: Dict[str, Any]) -> Tuple[bool, bool, bool, List[str]]:
    """
    Classifies modifications between before and after model states.
    Returns: (is_noop, technical_changed, display_only, changed_fields)
    """
    all_keys = set(before_dict.keys()) | set(after_dict.keys())
    changed_fields = []
    
    for k in sorted(all_keys):
        v_before = before_dict.get(k)
        v_after = after_dict.get(k)
        # Normalize numeric comparisons
        if isinstance(v_before, float) or isinstance(v_after, float):
            try:
                if (v_before is None) != (v_after is None):
                    changed_fields.append(k)
                elif v_before is not None and v_after is not None and round(float(v_before), 4) != round(float(v_after), 4):
                    changed_fields.append(k)
                continue
            except (ValueError, TypeError):
                pass
        if str(v_before or "") != str(v_after or ""):
            changed_fields.append(k)

    if not changed_fields:
        return True, False, False, []

    triggering = [f for f in changed_fields if f in REVISION_TRIGGER_FIELDS]
    display_fields = [f for f in changed_fields if f in DISPLAY_METADATA_FIELDS]
    
    if triggering:
        return False, True, False, changed_fields
    elif display_fields and not triggering:
        return False, False, True, changed_fields
    else:
        # Non-triggering status or other change
        return False, False, False, changed_fields

def classify_baseline_provenance(row: Dict[str, Any]) -> Tuple[str, str]:
    """
    Applies the four-tier precedence hierarchy to establish truthful baseline provenance.
    Returns: (provenance_status, evidence_reference)
    """
    vid = row.get("vehicle_id", "")
    note = str(row.get("capacity_source_note") or "")
    f_ver = int(row.get("fuel_spec_verified") or 0)
    p_ver = int(row.get("payload_capacity_verified") or 0)
    pass_ver = int(row.get("passenger_capacity_verified") or 0)

    # 1. Models with explicit estimation citations in database
    if vid == "V-MSV-05":
        return "ESTIMATED", "SML Isuzu Special Vehicles Spec (Payload estimated)"
    if vid in ("V-HSV-09", "V-ACV-06"):
        return "ESTIMATED", note

    # 2. Models with unverified fuel specifications lacking test protocol
    if vid in ("V-ACV-04", "V-ACV-05"):
        return "UNVERIFIED", note

    # 3. Models where all 3 capabilities are claimed verified in catalog
    if f_ver == 1 and p_ver == 1 and pass_ver == 1 and "estimated" not in note.lower():
        return "CLAIMED_VERIFIED_NO_EVIDENCE", note

    # 4. Fallback for unverified or unknown records
    if f_ver == 0 or p_ver == 0 or pass_ver == 0:
        return "UNVERIFIED", note
    return "UNKNOWN", note

def init_revision_schema(c: sqlite3.Cursor) -> None:
    """
    Idempotently ensures vehicle_spec_revisions table, indexes, and immutability triggers exist.
    Does NOT seed data.
    """
    c.execute("""
    CREATE TABLE IF NOT EXISTS vehicle_spec_revisions (
        revision_id TEXT PRIMARY KEY,
        vehicle_id TEXT NOT NULL,
        revision_no INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        change_source TEXT NOT NULL,
        change_summary TEXT DEFAULT '',
        provenance_status TEXT NOT NULL,
        evidence_source_type TEXT DEFAULT '',
        evidence_reference TEXT DEFAULT '',
        verified_by TEXT DEFAULT NULL,
        verified_at TEXT DEFAULT NULL,
        class_type TEXT NOT NULL,
        model_name TEXT NOT NULL,
        maker TEXT NOT NULL,
        axle_config TEXT,
        gvw_tons REAL NOT NULL,
        operational_range_km INTEGER NOT NULL,
        max_speed_kmh INTEGER NOT NULL,
        routing_footprint TEXT,
        role_category TEXT NOT NULL DEFAULT 'DUAL',
        is_vip INTEGER NOT NULL DEFAULT 0,
        rated_passenger_capacity INTEGER,
        passenger_capacity_verified INTEGER NOT NULL DEFAULT 0,
        rated_payload_tons REAL,
        payload_capacity_verified INTEGER NOT NULL DEFAULT 0,
        fuel_type TEXT NOT NULL DEFAULT 'DIESEL',
        tank_capacity_liters REAL,
        fuel_consumption_kmpl REAL,
        fuel_spec_verified INTEGER NOT NULL DEFAULT 0,
        spec_snapshot_json TEXT NOT NULL,
        spec_hash TEXT NOT NULL,
        FOREIGN KEY (vehicle_id) REFERENCES vehicle_master(vehicle_id)
    );
    """)

    c.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_spec_rev_vid_no 
    ON vehicle_spec_revisions(vehicle_id, revision_no);
    """)

    c.execute("""
    CREATE INDEX IF NOT EXISTS idx_spec_rev_hash 
    ON vehicle_spec_revisions(spec_hash);
    """)

    c.execute("""
    CREATE INDEX IF NOT EXISTS idx_spec_rev_created 
    ON vehicle_spec_revisions(created_at DESC);
    """)

    c.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_prevent_spec_rev_update
    BEFORE UPDATE ON vehicle_spec_revisions
    BEGIN
        SELECT RAISE(ABORT, 'vehicle_spec_revisions records are immutable and cannot be updated.');
    END;
    """)

    c.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_prevent_spec_rev_delete
    BEFORE DELETE ON vehicle_spec_revisions
    BEGIN
        SELECT RAISE(ABORT, 'vehicle_spec_revisions records are immutable and cannot be deleted.');
    END;
    """)

def record_spec_revision(
    c: sqlite3.Cursor,
    vehicle_id: str,
    spec_data: Dict[str, Any],
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    change_source: str = "API_UPDATE",
    change_summary: str = "",
    provenance_status: Optional[str] = None,
    evidence_source_type: str = "",
    evidence_reference: str = "",
    verified_by: Optional[str] = None,
    verified_at: Optional[str] = None,
    timestamp: Optional[str] = None,
    user: Optional[Dict[str, Any]] = None
) -> Tuple[str, int, str]:
    """
    Atomically records a new immutable revision for a vehicle model within caller's transaction.
    Returns: (revision_id, revision_no, spec_hash)
    """
    t = timestamp or now_iso()
    
    if user:
        actor_id = actor_id or str(user.get("id") or user.get("user_id") or user.get("email") or user.get("sub") or "SYSTEM")
        actor_role = actor_role or str(user.get("role") or "SYSTEM")
    actor_id = actor_id or "SYSTEM"
    actor_role = actor_role or "SYSTEM"

    # Query latest revision_no
    row_max = c.execute("SELECT MAX(revision_no) FROM vehicle_spec_revisions WHERE vehicle_id = ?", [vehicle_id]).fetchone()
    current_max = row_max[0] if (row_max and row_max[0] is not None) else 0
    next_rev_no = current_max + 1
    rev_id = f"REV-{vehicle_id}-{next_rev_no:04d}"

    canon_dict = compute_canonical_spec_dict(spec_data)
    canon_dict["vehicle_id"] = vehicle_id
    spec_hash = compute_spec_hash(canon_dict)
    snapshot_json = json.dumps(canon_dict, sort_keys=True, separators=(",", ":"))

    prov_status = provenance_status or "UNVERIFIED"
    if prov_status not in PROVENANCE_CATEGORIES:
        prov_status = "UNVERIFIED"

    c.execute("""
    INSERT INTO vehicle_spec_revisions (
        revision_id, vehicle_id, revision_no, created_at, actor_id, actor_role,
        change_source, change_summary, provenance_status, evidence_source_type,
        evidence_reference, verified_by, verified_at,
        class_type, model_name, maker, axle_config, gvw_tons,
        operational_range_km, max_speed_kmh, routing_footprint, role_category,
        is_vip, rated_passenger_capacity, passenger_capacity_verified,
        rated_payload_tons, payload_capacity_verified, fuel_type,
        tank_capacity_liters, fuel_consumption_kmpl, fuel_spec_verified,
        spec_snapshot_json, spec_hash
    ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?
    )
    """, (
        rev_id, vehicle_id, next_rev_no, t, actor_id, actor_role,
        change_source, change_summary, prov_status, evidence_source_type,
        evidence_reference, verified_by, verified_at,
        canon_dict["class_type"], canon_dict["model_name"], canon_dict["maker"],
        canon_dict["axle_config"], canon_dict["gvw_tons"],
        canon_dict["operational_range_km"], canon_dict["max_speed_kmh"],
        canon_dict["routing_footprint"], canon_dict["role_category"],
        canon_dict["is_vip"], canon_dict["rated_passenger_capacity"],
        canon_dict["passenger_capacity_verified"], canon_dict["rated_payload_tons"],
        canon_dict["payload_capacity_verified"], canon_dict["fuel_type"],
        canon_dict["tank_capacity_liters"], canon_dict["fuel_consumption_kmpl"],
        canon_dict["fuel_spec_verified"], snapshot_json, spec_hash
    ))

    return rev_id, next_rev_no, spec_hash

def validate_f1b_database(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Executes the 8 mandatory structural, cryptographic, and attribution checks.
    Raises RuntimeError if validation fails; returns summary dict on success.
    """
    c = conn.cursor()
    
    # 1. Check table exists
    tbl = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicle_spec_revisions'").fetchone()
    if not tbl:
        raise RuntimeError("Validation failure: Table 'vehicle_spec_revisions' does not exist.")

    # 2. Check model completeness
    missing_models = [r[0] for r in c.execute("""
        SELECT vm.vehicle_id FROM vehicle_master vm
        WHERE NOT EXISTS (SELECT 1 FROM vehicle_spec_revisions vsr WHERE vsr.vehicle_id = vm.vehicle_id)
    """).fetchall()]
    if missing_models:
        raise RuntimeError(f"Validation failure: Models missing baseline revisions: {missing_models}")

    # 3. Check baseline revision numbering
    bad_base_revs = [r[0] for r in c.execute("""
        SELECT vm.vehicle_id FROM vehicle_master vm
        WHERE (SELECT MIN(revision_no) FROM vehicle_spec_revisions WHERE vehicle_id = vm.vehicle_id) != 1
    """).fetchall()]
    if bad_base_revs:
        raise RuntimeError(f"Validation failure: Models with non-contiguous or invalid starting revision: {bad_base_revs}")

    # 4. Check for orphaned revisions
    orphans = [r[0] for r in c.execute("""
        SELECT vsr.vehicle_id FROM vehicle_spec_revisions vsr
        WHERE NOT EXISTS (SELECT 1 FROM vehicle_master vm WHERE vm.vehicle_id = vsr.vehicle_id)
    """).fetchall()]
    if orphans:
        raise RuntimeError(f"Validation failure: Orphaned revisions found referencing non-existent models: {orphans}")

    # 5. Check duplicate baselines
    dup_baselines = [r[0] for r in c.execute("""
        SELECT vehicle_id FROM vehicle_spec_revisions
        WHERE revision_no = 1
        GROUP BY vehicle_id HAVING COUNT(*) > 1
    """).fetchall()]
    if dup_baselines:
        raise RuntimeError(f"Validation failure: Duplicate baseline revisions detected for: {dup_baselines}")

    # 6. Check cryptographic hash integrity across all revisions
    all_revs = c.execute("SELECT revision_id, spec_snapshot_json, spec_hash FROM vehicle_spec_revisions").fetchall()
    for rev in all_revs:
        r_id, snap_json, stored_hash = rev[0], rev[1], rev[2]
        try:
            d = json.loads(snap_json)
            # Verify 19 keys
            missing_keys = set(CANONICAL_SPEC_FIELDS) - set(d.keys())
            if missing_keys:
                raise RuntimeError(f"Validation failure: Snapshot {r_id} missing canonical keys: {missing_keys}")
            calc_hash = compute_spec_hash(d)
            if calc_hash != stored_hash:
                raise RuntimeError(f"Validation failure: Hash mismatch in {r_id}: stored {stored_hash} != calculated {calc_hash}")
        except Exception as e:
            raise RuntimeError(f"Validation failure in revision {r_id}: {str(e)}")

    # 7. Check baseline attribution and provenance categories
    base_rows = c.execute("""
        SELECT vehicle_id, actor_id, actor_role, change_source, provenance_status 
        FROM vehicle_spec_revisions 
        WHERE revision_no = 1 AND change_source = 'INITIAL_MIGRATION'
    """).fetchall()
    if len(base_rows) != 36:
        raise RuntimeError(f"Validation failure: Expected 36 initial migration baselines, found {len(base_rows)}")
    prov_counts = {}
    for r in base_rows:
        vid, a_id, a_role, c_src, p_stat = r[0], r[1], r[2], r[3], r[4]
        if a_id != "SYSTEM_MIGRATION" or a_role != "SYSTEM" or c_src != "INITIAL_MIGRATION":
            raise RuntimeError(f"Validation failure: Invalid baseline attribution for {vid}: actor={a_id}, role={a_role}, source={c_src}")
        prov_counts[p_stat] = prov_counts.get(p_stat, 0) + 1

    expected_counts = {
        "CLAIMED_VERIFIED_NO_EVIDENCE": 31,
        "ESTIMATED": 3,
        "UNVERIFIED": 2
    }
    if prov_counts != expected_counts:
        raise RuntimeError(f"Validation failure: Baseline provenance distribution mismatch: observed {prov_counts} != expected {expected_counts}")

    # 8. Check immutability triggers
    triggers = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()]
    if "trg_prevent_spec_rev_update" not in triggers or "trg_prevent_spec_rev_delete" not in triggers:
        raise RuntimeError("Validation failure: Immutability triggers missing in sqlite_master.")

    total_models = c.execute("SELECT COUNT(*) FROM vehicle_master").fetchone()[0]
    total_revs = c.execute("SELECT COUNT(*) FROM vehicle_spec_revisions").fetchone()[0]

    return {
        "status": "VALID",
        "total_models": total_models,
        "total_revisions": total_revs,
        "provenance_counts": prov_counts
    }

def get_vehicle_revisions(c: sqlite3.Connection, vehicle_id: str) -> List[Dict[str, Any]]:
    """
    Returns ordered revision history for a vehicle model.
    """
    rows = c.execute(
        "SELECT * FROM vehicle_spec_revisions WHERE vehicle_id = ? ORDER BY revision_no ASC",
        (vehicle_id,)
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("spec_snapshot_json"), str):
            try:
                d["spec_snapshot"] = json.loads(d["spec_snapshot_json"])
            except Exception:
                d["spec_snapshot"] = {}
        results.append(d)
    return results

def run_f1b_migration(db_path: str) -> Dict[str, Any]:
    """
    Executes the controlled F1b baseline schema creation and migration.
    Wraps entire execution inside a single atomic write transaction.
    Returns status dictionary on success; raises RuntimeError on failure.
    """
    if not os.path.exists(db_path):
        raise RuntimeError(f"Migration failure: Target database file '{db_path}' does not exist.")

    conn = sqlite3.connect(db_path, timeout=10.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    try:
        # Check if already migrated
        tbl = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicle_spec_revisions'").fetchone()
        if tbl:
            missing_cnt = c.execute("""
                SELECT COUNT(*) FROM vehicle_master vm
                WHERE NOT EXISTS (SELECT 1 FROM vehicle_spec_revisions vsr WHERE vsr.vehicle_id = vm.vehicle_id)
            """).fetchone()[0]
            if missing_cnt == 0:
                # Run full validation before returning ALREADY_MIGRATED
                v_res = validate_f1b_database(conn)
                return {
                    "status": "ALREADY_MIGRATED",
                    "seeded_count": 0,
                    "total_models": v_res["total_models"],
                    "total_revisions": v_res["total_revisions"],
                    "provenance_counts": v_res["provenance_counts"]
                }

        # Begin atomic write transaction
        c.execute("BEGIN IMMEDIATE;")
        
        # 1. Initialize schema, indexes, and triggers
        init_revision_schema(c)

        # 2. Identify missing models
        rows = c.execute("""
            SELECT * FROM vehicle_master vm
            WHERE NOT EXISTS (SELECT 1 FROM vehicle_spec_revisions vsr WHERE vsr.vehicle_id = vm.vehicle_id)
            ORDER BY vm.vehicle_id
        """).fetchall()

        seeded_count = 0
        migration_ts = "2026-10-27T00:00:00+00:00"

        for r in rows:
            r_dict = dict(r)
            vid = r_dict["vehicle_id"]
            prov_status, ref_note = classify_baseline_provenance(r_dict)
            
            record_spec_revision(
                c=c,
                vehicle_id=vid,
                spec_data=r_dict,
                actor_id="SYSTEM_MIGRATION",
                actor_role="SYSTEM",
                change_source="INITIAL_MIGRATION",
                change_summary="Baseline specification captured from vehicle_master catalog at F1b migration",
                provenance_status=prov_status,
                evidence_source_type="CATALOG_BASELINE",
                evidence_reference=ref_note,
                timestamp=migration_ts
            )
            seeded_count += 1

        # 3. Post-migration health checks before commit
        # Run validation queries inside active transaction
        val_res = validate_f1b_database(conn)
        
        c.execute("COMMIT;")
        
        return {
            "status": "SUCCESS",
            "seeded_count": seeded_count,
            "total_models": val_res["total_models"],
            "total_revisions": val_res["total_revisions"],
            "provenance_counts": val_res["provenance_counts"]
        }

    except Exception as e:
        c.execute("ROLLBACK;")
        raise RuntimeError(f"F1b Migration failed and rolled back cleanly: {str(e)}") from e
    finally:
        conn.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="VAYU ORBIT F1b Vehicle Specification Revision Migration CLI")
    parser.add_argument("--db", required=True, help="Path to target SQLite database")
    parser.add_argument("--migrate", action="store_true", help="Execute F1b migration")
    parser.add_argument("--validate", action="store_true", help="Validate existing F1b migration")
    args = parser.parse_args()

    if args.migrate:
        res = run_f1b_migration(args.db)
        print(f"Migration completed successfully: {json.dumps(res, indent=2)}")
    elif args.validate:
        conn = sqlite3.connect(args.db)
        conn.row_factory = sqlite3.Row
        res = validate_f1b_database(conn)
        conn.close()
        print(f"Validation passed successfully: {json.dumps(res, indent=2)}")
    else:
        parser.print_help()
