import os
import sys
import sqlite3
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import api

def test_auxiliary_tables_exist():
    db_path = api.get_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    conn.close()

    required = [
        "rop_reports",
        "journey_sensitivity_advisory",
        "journey_readiness_overrides",
        "staged_sessions",
    ]
    for req in required:
        assert req in tables, f"Expected table {req} to exist in database"

def test_fetch_journey_all_statuses():
    db_path = api.get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    sample_journeys = cur.execute("SELECT journey_id, status FROM journeys GROUP BY status").fetchall()
    conn.close()

    assert len(sample_journeys) > 0, "Expected at least one journey in database"

    for row in sample_journeys:
        jid = row['journey_id']
        status = row['status']
        res = api._fetch_journey(jid)
        assert res is not None
        assert res['journey_id'] == jid
        assert res['status'] == status
        assert 'sensitivity_advisory' in res
        assert 'rop_report' in res
        assert 'readiness_override' in res
        assert 'convoy' in res
        assert 'route' in res

def test_migration_repeatability():
    from migrate_auxiliary_tables import run_migration
    # Must succeed cleanly when run again
    assert run_migration() is True
