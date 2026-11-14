"""
VAYU ORBIT v6.0.0 — Database Migration & Adapter Unit Test Suite
Academic Release Problem Statement: PDS-3

Tests:
- Database adapter provider resolution and graceful fallback.
- SQL syntax adaptation (? -> %s, datetime('now') -> CURRENT_TIMESTAMP).
- Transaction commit and rollback integrity.
- Migration engine dry run on live and demo databases.
- Zero-mutation guarantee for source SQLite databases.
- Foreign-key dependency graph and topological sequencing.
"""

import os
import sys
import hashlib
import sqlite3
import pytest

# Ensure backend root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import db_adapter
from db_adapter import adapt_sql
from migrations.sqlite_to_postgres import (
    SQLiteToPostgresMigrator,
    TOPOLOGICAL_TABLE_ORDER,
    transform_row,
)

def compute_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

# ------------------------------------------------------------------------------
# 1. DB Adapter Tests
# ------------------------------------------------------------------------------

def test_db_adapter_default_provider():
    assert db_adapter.get_provider() in ("sqlite", "postgresql")

def test_adapt_sql_placeholders():
    raw = "SELECT * FROM users WHERE email = ? AND role = ?"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert adapted == "SELECT * FROM users WHERE email = %s AND role = %s"

def test_adapt_sql_string_literal_preservation():
    raw = "SELECT * FROM notes WHERE title = 'Route clearance check?' AND status = ?"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert adapted == "SELECT * FROM notes WHERE title = 'Route clearance check?' AND status = %s"

def test_adapt_sql_escaped_quote_preservation():
    raw = "INSERT INTO places (place_name, status) VALUES ('O''Donnell Airfield', ?)"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert adapted == "INSERT INTO places (place_name, status) VALUES ('O''Donnell Airfield', %s)"

def test_adapt_sql_comment_preservation():
    raw = "-- Check status ?\n/* Another block ? */\nSELECT * FROM users WHERE id = ?"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert adapted == "-- Check status ?\n/* Another block ? */\nSELECT * FROM users WHERE id = %s"

def test_adapt_sql_insert_or_ignore():
    raw = "INSERT OR IGNORE INTO places (place_id, name) VALUES (?, ?)"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert adapted == "INSERT INTO places (place_id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING"

def test_adapt_sql_sqlite_master_translation():
    raw = "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert "information_schema.tables" in adapted
    assert "table_name" in adapted
    assert "%s" in adapted

def test_adapt_sql_datetime_now():
    raw = "UPDATE users SET updated_at = datetime('now') WHERE id = ?"
    adapted = db_adapter.adapt_sql(raw, "postgresql")
    assert "CURRENT_TIMESTAMP" in adapted
    assert "%s" in adapted

def test_row_dict_access():
    rd = db_adapter.RowDict({"col_a": 100, "col_b": "hello"})
    # Key access
    assert rd["col_a"] == 100
    assert rd["col_b"] == "hello"
    # Positional access matching sqlite3.Row
    assert rd[0] == 100
    assert rd[1] == "hello"
    # dict conversion
    d = dict(rd)
    assert d == {"col_a": 100, "col_b": "hello"}

def test_table_exists():
    # In default sqlite mode
    assert db_adapter.table_exists("users") is True
    assert db_adapter.table_exists("journeys") is True
    assert db_adapter.table_exists("nonexistent_table_xyz123") is False

def test_postgres_unreachable_strict_failure(monkeypatch):
    monkeypatch.setenv("DATABASE_PROVIDER", "postgresql")
    monkeypatch.setenv("DATABASE_ALLOW_FALLBACK", "false")
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "1")
    monkeypatch.setenv("DATABASE_URL", "postgresql://invalid_user:invalid_pass@127.0.0.1:5432/invalid_db")
    db_adapter.reset_pg_pool()
    
    try:
        with pytest.raises(db_adapter.DatabaseConnectionError) as exc_info:
            db_adapter.get_connection()
        assert "PostgreSQL connection failed" in str(exc_info.value)
    finally:
        db_adapter.reset_pg_pool()

def test_jwt_production_startup_fails_without_secret(monkeypatch):
    import auth
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("VAYU_JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError) as exc_info:
        auth._resolve_jwt_secret()
    assert "CRITICAL SECURITY CONFIGURATION ERROR" in str(exc_info.value)
    assert "VAYU_JWT_SECRET is not configured" in str(exc_info.value)

def test_jwt_production_startup_fails_with_placeholder_secret(monkeypatch):
    import auth
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("VAYU_JWT_SECRET", "CHANGE_THIS_TO_A_SECURE_64_CHAR_RANDOM_SECRET_KEY")
    with pytest.raises(RuntimeError) as exc_info:
        auth._resolve_jwt_secret()
    assert "CRITICAL SECURITY CONFIGURATION ERROR" in str(exc_info.value)
    assert "template placeholder" in str(exc_info.value)

def test_jwt_dev_mode_uses_isolated_fallback(monkeypatch):
    import auth
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("VAYU_JWT_SECRET", raising=False)
    secret = auth._resolve_jwt_secret()
    assert "vayu-dev-only-jwt-secret" in secret

def test_db_transaction_commit_and_rollback(tmp_path):
    # Test on a temporary SQLite database
    db_file = str(tmp_path / "test_tx.db")
    conn = sqlite3.connect(db_file)
    conn.execute("CREATE TABLE test_tx (id INTEGER PRIMARY KEY, val TEXT);")
    conn.commit()
    conn.close()

    # Commit test
    with sqlite3.connect(db_file) as c:
        c.execute("INSERT INTO test_tx (val) VALUES ('committed');")
        c.commit()

    conn = sqlite3.connect(db_file)
    assert conn.execute("SELECT COUNT(*) FROM test_tx").fetchone()[0] == 1
    conn.close()

    # Rollback test
    conn = sqlite3.connect(db_file)
    try:
        conn.execute("BEGIN IMMEDIATE;")
        conn.execute("INSERT INTO test_tx (val) VALUES ('rolled_back');")
        raise RuntimeError("Forced error to trigger rollback")
    except RuntimeError:
        conn.rollback()

    assert conn.execute("SELECT COUNT(*) FROM test_tx").fetchone()[0] == 1
    conn.close()

# ------------------------------------------------------------------------------
# 2. Migration Engine Dry-Run & Transformation Tests
# ------------------------------------------------------------------------------

def test_row_transformation_booleans():
    row = {
        "vehicle_id": "VM-TEST",
        "is_vip": 1,
        "passenger_capacity_verified": 0,
        "is_active": 1,
    }
    transformed = transform_row("vehicle_master", row)
    assert transformed["is_vip"] is True
    assert transformed["passenger_capacity_verified"] is False
    assert transformed["is_active"] is True

def test_row_transformation_json():
    row = {
        "journey_id": "CMS-TEST",
        "route_json": '{"waypoints": ["CN-AMB", "MS-LEH"], "distance": 450}',
        "convoy_json": '[{"unit_id": "U-1"}]',
    }
    transformed = transform_row("journeys", row)
    assert isinstance(transformed["route_json"], str)
    assert "waypoints" in transformed["route_json"]

def test_migration_engine_dry_run_main_db():
    db_path = os.path.join(BASE_DIR, "military_logistics.db")
    if not os.path.exists(db_path):
        pytest.skip("military_logistics.db not found")

    hash_before = compute_hash(db_path)
    migrator = SQLiteToPostgresMigrator(sqlite_path=db_path, dry_run=True)
    report = migrator.run_dry_run()

    # Zero mutation guarantee
    hash_after = compute_hash(db_path)
    assert hash_before == hash_after, "CRITICAL: Source SQLite file was mutated during migration dry-run!"

    assert report["overall_status"] == "SUCCESS"
    assert report["total_tables"] == 18
    assert report["total_records"] >= 900
    assert len(report["validation_errors"]) == 0

def test_migration_engine_dry_run_demo_db():
    db_path = os.path.join(BASE_DIR, "military_logistics_demo.db")
    if not os.path.exists(db_path):
        pytest.skip("military_logistics_demo.db not found")

    hash_before = compute_hash(db_path)
    migrator = SQLiteToPostgresMigrator(sqlite_path=db_path, dry_run=True)
    report = migrator.run_dry_run()

    hash_after = compute_hash(db_path)
    assert hash_before == hash_after, "CRITICAL: Source SQLite demo file was mutated during migration dry-run!"

    assert report["overall_status"] == "SUCCESS"
    assert report["total_tables"] == 18
    assert report["total_records"] >= 250
    assert len(report["validation_errors"]) == 0

def test_topological_table_order_completeness():
    assert len(TOPOLOGICAL_TABLE_ORDER) == 18
    # Assert Layer 0 precedes Layer 1
    assert TOPOLOGICAL_TABLE_ORDER.index("vehicle_master") < TOPOLOGICAL_TABLE_ORDER.index("fleet_units")
    # Assert Layer 1 precedes Layer 2
    assert TOPOLOGICAL_TABLE_ORDER.index("journeys") < TOPOLOGICAL_TABLE_ORDER.index("journey_fuel_config")
    assert TOPOLOGICAL_TABLE_ORDER.index("journeys") < TOPOLOGICAL_TABLE_ORDER.index("incidents")
    assert TOPOLOGICAL_TABLE_ORDER.index("journeys") < TOPOLOGICAL_TABLE_ORDER.index("rop_reports")
