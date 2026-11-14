"""
VAYU ORBIT — Idempotent Additive Database Migration
Applies missing auxiliary operational tables to military_logistics.db safely.
Preserves all existing data, journeys, nodes, vehicles, users, and audit records.
"""

import os
import sys
import sqlite3
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get('CMS_DB_PATH', os.path.join(BASE_DIR, 'military_logistics.db'))

DDL_STATEMENTS = [
    (
        "rop_reports",
        """
        CREATE TABLE IF NOT EXISTS rop_reports (
          report_id TEXT PRIMARY KEY,
          journey_id TEXT NOT NULL,
          route_version TEXT NOT NULL,
          reporting_user_id TEXT NOT NULL,
          reporting_user_email TEXT NOT NULL,
          reporting_user_role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SUBMITTED',
          observation_period_start TEXT,
          observation_period_end TEXT,
          parameters_json TEXT NOT NULL DEFAULT '{}',
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          review_decision_notes TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    ),
    (
        "journey_sensitivity_advisory",
        """
        CREATE TABLE IF NOT EXISTS journey_sensitivity_advisory (
          journey_id TEXT PRIMARY KEY,
          sensitivity_level TEXT NOT NULL DEFAULT 'STANDARD',
          escort_requirement_state TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
          policy_reference TEXT NOT NULL DEFAULT 'DEF-LOG-SOP-2026/SEC-04',
          support_notes TEXT DEFAULT '',
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          confirmed_by TEXT DEFAULT NULL,
          confirmed_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    ),
    (
        "journey_readiness_overrides",
        """
        CREATE TABLE IF NOT EXISTS journey_readiness_overrides (
          journey_id TEXT PRIMARY KEY,
          override_type TEXT NOT NULL DEFAULT 'READINESS_ADVISORY_OVERRIDE',
          reason TEXT NOT NULL,
          authorized_by TEXT NOT NULL,
          authorized_role TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    ),
    (
        "staged_sessions",
        """
        CREATE TABLE IF NOT EXISTS staged_sessions (
          staged_id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    ),
]


def run_migration(db_path: str = DB_PATH) -> bool:
    if not os.path.exists(db_path):
        logging.error(f"Database not found at: {db_path}")
        return False

    logging.info(f"Starting additive migration on: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        
        # Check initial tables
        initial_tables = set(
            r[0] for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        )
        
        # Check existing journey count before migration
        journey_count_before = cur.execute("SELECT count(*) FROM journeys").fetchone()[0] if 'journeys' in initial_tables else 0
        logging.info(f"Existing tables count: {len(initial_tables)}, Existing journeys: {journey_count_before}")

        # Execute migration within transaction
        with conn:
            for table_name, ddl in DDL_STATEMENTS:
                cur.execute(ddl)
                logging.info(f"Verified/Created table: {table_name}")

        # Verify tables post-migration
        final_tables = set(
            r[0] for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        )
        journey_count_after = cur.execute("SELECT count(*) FROM journeys").fetchone()[0] if 'journeys' in final_tables else 0

        # Assert no data loss
        assert journey_count_after == journey_count_before, (
            f"DATA LOSS DETECTED: Journeys before ({journey_count_before}) != after ({journey_count_after})"
        )

        for table_name, _ in DDL_STATEMENTS:
            assert table_name in final_tables, f"Table {table_name} missing after migration"

        logging.info("Additive migration completed successfully. All data preserved.")
        logging.info(f"Final tables count: {len(final_tables)}, Journeys preserved: {journey_count_after}")
        return True
    finally:
        conn.close()


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
