"""
VAYU ORBIT — Isolated Demonstration Database Preparation & Reset Utility
Prepares a clean, isolated demo state with 0 journeys while preserving master catalogs.
Strictly protects the production database from write operations.
"""

import os
import sys
import shutil
import sqlite3
import hashlib
import datetime
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BASE_DIR)

PROD_DB_PATH = os.path.abspath(os.path.join(BASE_DIR, 'military_logistics.db'))
PROD_DB_BASELINE_HASH = "755B144435639B3216A70BB9E37CBAA3A072671D6A3946A6133001C08510F14B"
DEFAULT_DEMO_DB_PATH = os.path.abspath(os.path.join(BASE_DIR, 'military_logistics_demo.db'))

def get_file_sha256(path):
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().upper()

def reset_demo_database(target_db_path=DEFAULT_DEMO_DB_PATH, require_confirmation=True):
    target_abs = os.path.abspath(target_db_path)
    
    print("=" * 70)
    print(" VAYU ORBIT — DEMO DATABASE PREPARATION & RESET UTILITY")
    print("=" * 70)
    print(f" Target Demo Database: {target_abs}")
    print(f" Production Database:  {PROD_DB_PATH}")

    # --- SAFETY GUARD 1: Refuse if target is the production database ---
    if target_abs.lower() == PROD_DB_PATH.lower():
        print("\n[FATAL ERROR] TARGET IS THE PROTECTED PRODUCTION DATABASE!")
        print("Refusing to modify or reset 'military_logistics.db'. Operation aborted.")
        sys.exit(1)

    # --- SAFETY GUARD 2: Verify production database hash before touching anything ---
    current_prod_hash = get_file_sha256(PROD_DB_PATH)
    if current_prod_hash != PROD_DB_BASELINE_HASH:
        print("\n[FATAL ERROR] Production database baseline hash mismatch!")
        print(f"Expected: {PROD_DB_BASELINE_HASH}")
        print(f"Observed: {current_prod_hash}")
        sys.exit(1)
    print(" [OK] Production database integrity verified (F1932F759E07...).")

    # --- CONFIRMATION (if interactive) ---
    if require_confirmation:
        print("\n[WARNING] This operation will reset the demonstration database:")
        print("  • All existing demonstration journeys will be removed.")
        print("  • All journey events, incidents, and overrides will be cleared.")
        print("  • Master vehicle, place, and node catalogs will be preserved.")
        print("  • Physical fleet units will be reset to AVAILABLE.")
        print("  • The production database will NOT be modified.")
        ans = input("\nProceed with reset? (type 'yes' or 'y' to confirm): ").strip().lower()
        if ans not in ('yes', 'y'):
            print("Reset cancelled by user.")
            sys.exit(0)

    # --- BACKUP EXISTING DEMO DATABASE ---
    if os.path.exists(target_abs):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{target_abs}.bak_{timestamp}"
        try:
            shutil.copy2(target_abs, backup_path)
            print(f" [OK] Created timestamped backup of existing demo DB:\n      {backup_path}")
        except Exception as e:
            print(f"[ERROR] Failed to create backup of existing demo database: {e}")
            sys.exit(1)

    # --- PROVISION FRESH DEMO DB FROM MASTER BASELINE ---
    print("\nCopying master catalog schema from production baseline...")
    try:
        shutil.copy2(PROD_DB_PATH, target_abs)
        print(" [OK] Fresh database structure replicated.")
    except Exception as e:
        print(f"[FATAL] Failed to copy master database: {e}")
        sys.exit(1)

    # --- TRUNCATE JOURNEY & RUNTIME RECORDS ---
    print("Purging journey-related records in demo database...")
    try:
        conn = sqlite3.connect(target_abs)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        
        # Execute in atomic transaction
        with conn:
            conn.execute("DELETE FROM journeys;")
            conn.execute("DELETE FROM journey_events;")
            conn.execute("DELETE FROM incidents;")
            conn.execute("DELETE FROM journey_spacing_config;")
            conn.execute("DELETE FROM journey_fuel_config;")
            conn.execute("DELETE FROM journey_fuel_overrides;")
            conn.execute("DELETE FROM audit_log;")
            
            # Clear any optional runtime scratch tables if present
            tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            if 'vehicle_status' in tables:
                conn.execute("DELETE FROM vehicle_status;")
            if 'audit_events' in tables:
                conn.execute("DELETE FROM audit_events;")
                
            # Reset physical fleet units to AVAILABLE
            conn.execute("UPDATE fleet_units SET status = 'AVAILABLE';")
            
        # Reclaim storage
        conn.execute("VACUUM;")
        conn.close()
        print(" [OK] Journey tables truncated and fleet units reset to AVAILABLE.")
    except Exception as e:
        print(f"[FATAL] Error resetting demo database records: {e}")
        sys.exit(1)

    # --- VERIFY RECORD COUNTS ---
    print("\nVerifying demonstration state invariants:")
    conn = sqlite3.connect(f"file:{target_abs}?mode=ro", uri=True)
    c = conn.cursor()
    
    def count_table(tbl):
        return c.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]

    j_count = count_table("journeys")
    je_count = count_table("journey_events")
    inc_count = count_table("incidents")
    audit_count = count_table("audit_log")
    nodes_count = count_table("military_nodes")
    veh_count = count_table("vehicle_master")
    places_count = count_table("places")
    fleet_count = count_table("fleet_units")
    user_count = count_table("users")
    conn.close()

    print(f"  • Journeys:               {j_count}  (Expected: 0)")
    print(f"  • Journey Events:         {je_count}  (Expected: 0)")
    print(f"  • Incidents:              {inc_count}  (Expected: 0)")
    print(f"  • Audit Log Records:      {audit_count}  (Expected: 0)")
    print(f"  • Military Nodes Catalog: {nodes_count} (Expected: 116)")
    print(f"  • Vehicle Master Models:  {veh_count}  (Expected: 36)")
    print(f"  • Place Registry:         {places_count} (Expected: 116)")
    print(f"  • Physical Fleet Units:   {fleet_count}   (Expected: 4)")
    print(f"  • Operational Users:      {user_count}   (Expected: 3)")

    assert j_count == 0, f"Journeys count is not zero! ({j_count})"
    assert je_count == 0, f"Journey events count is not zero! ({je_count})"
    assert inc_count == 0, f"Incidents count is not zero! ({inc_count})"
    assert audit_count == 0, f"Audit log count is not zero! ({audit_count})"
    assert nodes_count == 116, f"Military nodes altered! ({nodes_count})"
    assert veh_count == 36, f"Vehicle catalog altered! ({veh_count})"
    assert places_count == 116, f"Places altered! ({places_count})"
    assert fleet_count == 4, f"Fleet units altered! ({fleet_count})"
    assert user_count == 3, f"Users altered! ({user_count})"

    # --- SAFETY GUARD 3: Reverifying production database hash ---
    final_prod_hash = get_file_sha256(PROD_DB_PATH)
    assert final_prod_hash == PROD_DB_BASELINE_HASH, "FATAL: Production database was modified!"
    print("\n [OK] Production database hash 100% UNCHANGED.")

    print("\n" + "=" * 70)
    print(" DEMONSTRATION DATABASE RESET COMPLETED SUCCESSFULLY (PASS)")
    print(" Clean demonstration state confirmed: ZERO journeys.")
    print("=" * 70)
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="VAYU ORBIT Demo Database Reset Utility")
    parser.add_argument('--db', default=DEFAULT_DEMO_DB_PATH, help="Target demo database path")
    parser.add_argument('--confirm', action='store_true', help="Skip interactive prompt")
    args = parser.parse_args()

    reset_demo_database(target_db_path=args.db, require_confirmation=not args.confirm)
