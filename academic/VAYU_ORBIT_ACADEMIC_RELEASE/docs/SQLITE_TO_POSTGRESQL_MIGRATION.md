# VAYU ORBIT v6.0.0 — SQLite to PostgreSQL Migration Engine Manual
**Document ID:** VAYU-DOC-MIG-004  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Repeatable SQLite to PostgreSQL Migration Engine, CLI Tooling & Reconciliation  
**Date:** November 15, 2026  
**Target Environment:** Cloud SQL for PostgreSQL / Firebase SQL Connect (`vayuorbit-b20b5`)  

---

## 1. Overview & Capabilities

The VAYU ORBIT migration engine is implemented in [backend/migrations/sqlite_to_postgres.py](file:///c:/Users/mishr/OneDrive/Desktop/CMS/programme/academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/migrations/sqlite_to_postgres.py). It provides a fully automated, repeatable, and idempotent pipeline for migrating all operational datasets from SQLite to PostgreSQL.

### Core Architectural Features:
1. **Zero-Mutation Source Guarantee:** Source SQLite databases are opened exclusively with SQLite read-only URI mode (`file:... ?mode=ro`). The source file is never modified or locked.
2. **Topological Foreign-Key Ordering:** Tables are traversed in strict foreign-key dependency order (Layer 0 Master Catalogs -> Layer 1 Fleet/Journeys -> Layer 2 Operational Configs/Incidents/ROP), guaranteeing zero foreign-key constraint violations during load.
3. **Primary Key Preservation:** Existing identifiers (e.g. `CMS-20261115-5620E2`, `ROP-20261115-B93440`, `USR-COORDINATOR-01`) are explicitly preserved.
4. **Type Transformation Engine:**
   - Converts SQLite `0`/`1` integer columns to PostgreSQL native `BOOLEAN` (`true`/`false`).
   - Parses and validates JSON structures, wrapping them for PostgreSQL `JSONB` insertion.
   - Normalizes empty strings in date/time columns to `NULL`.
5. **Serial Sequence Synchronization:** For tables with autoincrement integer keys (`audit_log`, `journey_events`), automatically executes `SELECT setval(pg_get_serial_sequence('table', 'id'), COALESCE(MAX(id), 1), true)` to prevent primary key collision on subsequent insertions.
6. **Dry-Run & SQL Export:** Enables offline validation, generating clean SQL dump scripts without requiring an active PostgreSQL connection.
7. **Structured Reconciliation:** Produces detailed Markdown and JSON reconciliation metrics comparing source and target row counts, primary key coverage, and null checks.

---

## 2. CLI Usage Guide

### 2.1 Dry-Run Validation (Offline / Testing)
Executes extraction, type validation, in-memory foreign key reference checks, and exports an executable PostgreSQL SQL script:

```powershell
python backend/migrations/sqlite_to_postgres.py `
  --source backend/military_logistics.db `
  --dry-run `
  --export-sql backend/migrations/dry_run_migration.sql `
  --report docs/DATABASE_MIGRATION_RECONCILIATION.md
```

### 2.2 Live Migration Execution (Local or Cloud SQL Target)
Executes atomic transactional migration against a live PostgreSQL database:

```powershell
# Set target PostgreSQL connection string
$env:DATABASE_URL = "postgresql://vayu_app_user:SecurePassword@localhost:5432/vayu_orbit_db"

# Execute migration
python backend/migrations/sqlite_to_postgres.py `
  --source backend/military_logistics.db `
  --target $env:DATABASE_URL `
  --report docs/DATABASE_MIGRATION_RECONCILIATION.md
```

---

## 3. Execution Pipeline & Error Handling

```
[1. SQLite Source Check]
    |-- PRAGMA integrity_check
    `-- Extract Table Metadata & Row Counts
                |
                v
[2. Topological Extraction & Transformation]
    |-- Level 0: military_nodes, places, vehicle_master, users, audit_events, audit_log, staged_sessions
    |-- Level 1: fleet_units, vehicle_status, journeys
    `-- Level 2: journey_fuel_config, journey_fuel_overrides, journey_spacing_config,
                 journey_sensitivity_advisory, journey_readiness_overrides, journey_events,
                 incidents, rop_reports
                |
                v
[3. Target Insertion]
    |-- Batch Parameterized INSERT INTO ... ON CONFLICT DO NOTHING
    `-- Synchronize Sequences via setval()
                |
                v
[4. Post-Migration Verification]
    |-- Row-count reconciliation (Target vs Source)
    |-- Primary-key coverage audit
    `-- Generate Markdown Reconciliation Report
```

---

## 4. Migration Safety & Restart Behavior

- **Safe Restart / Idempotency:** All inserts utilize `ON CONFLICT DO NOTHING` or primary key conflict handling. If a migration is interrupted, re-running it resumes safely without duplicating existing records.
- **Transaction Rollback:** In live migration mode, all inserts run within an atomic PostgreSQL transaction block (`with pg_conn.transaction():`). If an unexpected error occurs, all changes are rolled back automatically.
- **Redaction of Secrets:** Password hashes, internal tokens, and confidential keys are never displayed in CLI stdout or written into Markdown reports.
