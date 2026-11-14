# VAYU ORBIT v6.0.0 — Database Migration & Regression Test Report
**Document ID:** VAYU-DOC-TST-007  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Full Verification Report for Database Migration, DB Adapter, Security & Workflows  
**Date:** November 15, 2026  
**Target Environment:** SQLite & Cloud SQL for PostgreSQL / Firebase SQL Connect (`vayuorbit-b20b5`)  

---

## 1. Executive Summary

This report documents the verification and regression testing executed for the **SQLite to PostgreSQL / Firebase SQL Connect Migration** across the VAYU ORBIT Academic Release (`v6.0.0-academic`).

### Key Results Summary (Stage 2 Hardened):
- **Database Migration Unit Tests:** 17 / 17 Passed (100%)
- **Pytest Regression Suite:** 77 / 77 Passed (100%)
- **Firebase Authentication & RBAC Regression:** 6 / 6 Suites Passed (100%)
- **Operational Convoy Workflows Regression:** 7 / 7 Workflows Passed (100%)
- **Migration Dry-Run Validation (Active DB):** 18 / 18 Tables Validated (1,005 records, 100% PK coverage, 0 errors)
- **Migration Dry-Run Validation (Demo DB):** 18 / 18 Tables Validated (280 records, 100% PK coverage, 0 errors)
- **Zero Source Mutation:** Verified byte-for-byte before and after dry-run migration across both databases.
- **Backup & Non-Destructive Restore Test:** Restored `military_logistics.db.backup_20261115_024500` to temporary database; verified `PRAGMA integrity_check = 'ok'`, 18 tables, 996 records; cleaned up temporary file.
- **Fail-Fast Strict Isolation:** Strict `DatabaseConnectionError` on unreachable PostgreSQL with `DATABASE_ALLOW_FALLBACK=false` (0 silent fallback).
- **Frontend Production Build:** Built successfully in 782ms (1948 modules transformed, 0 errors).

---

## 2. Test Environment Matrix

In strict accordance with project safety guidelines, testing environments were classified and isolated:

| Component Under Test | Test Target Used | Status / Notes |
|---|---|---|
| **FastAPI Core & Routing** | SQLite (`military_logistics.db`) | **TESTED & VERIFIED** (71/71 pytest passed) |
| **Database Adapter (`db_adapter.py`)** | SQLite & Simulated PostgreSQL Adapter | **TESTED & VERIFIED** (Syntax, parameters, transactions) |
| **Migration Engine (`sqlite_to_postgres.py`)** | SQLite (Source) + Dry-Run SQL Engine | **TESTED & VERIFIED** (18 tables, 996 records validated) |
| **Target PostgreSQL Instance** | Local Port 5432 & Cloud SQL | **UNAVAILABLE / BLOCKED BY AUTHORISATION** (Port 5432 closed; no paid Cloud SQL provisioned) |
| **Firebase SQL Connect Schema** | Local GraphQL SDL (`schema.gql`) | **VERIFIED LOCALLY** (Compatible schema validation configured) |
| **Firebase Auth Token Verification** | Deterministic Test Tokens & Web SDK | **TESTED & VERIFIED** (Air-gapped token validation) |
| **App Check Middleware** | Custom Provider & Audit Mode | **TESTED & VERIFIED** (Exemptions & attestation handling) |

---

## 3. Test Suite Details & Evidence

### 3.1 Database Migration Unit Suite (`test_database_migration.py`)
- **Command:** `python -m pytest academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/tests/test_database_migration.py -v`
- **Output:** 17 passed in 2.42s.
- **Assertions Verified:**
  1. `test_db_adapter_default_provider`: Validates provider detection (`sqlite` / `postgresql`).
  2. `test_adapt_sql_placeholders`: Validates `?` -> `%s` translation.
  3. `test_adapt_sql_string_literal_preservation`: Ensures `?` inside strings is preserved.
  4. `test_adapt_sql_escaped_quote_preservation`: Handles SQL escaped single quotes.
  5. `test_adapt_sql_comment_preservation`: Preserves line comments (`--`) and block comments (`/* */`).
  6. `test_adapt_sql_insert_or_ignore`: Translates `INSERT OR IGNORE` to `INSERT ... ON CONFLICT DO NOTHING`.
  7. `test_adapt_sql_sqlite_master_translation`: Translates `sqlite_master` lookups to `information_schema.tables`.
  8. `test_adapt_sql_datetime_now`: Replaces `datetime('now')` with `CURRENT_TIMESTAMP`.
  9. `test_row_dict_access`: Validates both string key and integer positional indexing on `RowDict` matching `sqlite3.Row`.
  10. `test_table_exists`: Validates catalog inspection on active database.
  11. `test_postgres_unreachable_strict_failure`: Proves zero silent fallback; raises `DatabaseConnectionError` when PostgreSQL server is down.
  12. `test_db_transaction_commit_and_rollback`: Tests atomic commit and rollback.
  13. `test_row_transformation_booleans`: Validates integer 0/1 to boolean casting.
  14. `test_row_transformation_json`: Validates JSON formatting for JSONB.
  15. `test_migration_engine_dry_run_main_db`: Validates dry-run on `military_logistics.db` and proves source SQLite hash is identical before and after.
  16. `test_migration_engine_dry_run_demo_db`: Validates dry-run on `military_logistics_demo.db` and proves zero mutation.
  17. `test_topological_table_order_completeness`: Validates all 18 tables are ordered without cyclic dependencies.

### 3.2 Firebase Auth & RBAC Regression (`test_firebase_auth_migration.py`)
- **Command:** `python scratch/test_firebase_auth_migration.py`
- **Output:** 6/6 Suites Passed.
- **Suites Verified:**
  - Suite 1: Firebase ID token identity verification & user mapping.
  - Suite 2: Zero-downtime JIT UID linking by verified email.
  - Suite 3: Security failure modes (missing, malformed, expired, unknown token, disabled account).
  - Suite 4: Role-Based Access Control on protected operational routes.
  - Suite 5: Session cookie establishment via `/api/auth/session`.
  - Suite 6: Administrative account lifecycle governance (`PENDING_ROLE`, status change).

### 3.3 Operational Convoy Workflows Regression (`test_operational_workflows_firebase.py`)
- **Command:** `python scratch/test_operational_workflows_firebase.py`
- **Output:** 7/7 Workflows Passed.
- **Workflows Verified:**
  - Workflow 1: Route Assessment & VORAM risk calculation.
  - Workflow 2: Active journey retrieval (122 journeys).
  - Workflow 3: Fuel intelligence evaluation.
  - Workflow 4: Coordinator fuel override (Creator blocked with 403; Coordinator approved).
  - Workflow 5: Checkpoint event logging.
  - Workflow 6: Road Opening Party (ROP) recon report submission & coordinator review (separation of duties).
  - Workflow 7: Structured audit log retrieval (200 records).

---

## 4. Reconciliation Table (Source SQLite vs Validated Target)

| Table Name | Source SQLite Rows | Target Validated Rows | Primary Key Coverage | Status |
|:---|:---:|:---:|:---:|:---:|
| `military_nodes` | 116 | 116 | 116/116 (100%) | `VALIDATED` |
| `places` | 116 | 116 | 116/116 (100%) | `VALIDATED` |
| `vehicle_master` | 36 | 36 | 36/36 (100%) | `VALIDATED` |
| `users` | 3 | 3 | 3/3 (100%) | `VALIDATED` |
| `audit_events` | 4 | 4 | 4/4 (100%) | `VALIDATED` |
| `audit_log` | 286 | 286 | 286/286 (100%) | `VALIDATED` |
| `staged_sessions` | 0 | 0 | 0/0 (N/A) | `VALIDATED` |
| `fleet_units` | 4 | 4 | 4/4 (100%) | `VALIDATED` |
| `vehicle_status` | 0 | 0 | 0/0 (N/A) | `VALIDATED` |
| `journeys` | 122 | 122 | 122/122 (100%) | `VALIDATED` |
| `journey_fuel_config` | 68 | 68 | 68/68 (100%) | `VALIDATED` |
| `journey_fuel_overrides` | 15 | 15 | 15/15 (100%) | `VALIDATED` |
| `journey_spacing_config` | 10 | 10 | 10/10 (100%) | `VALIDATED` |
| `journey_sensitivity_advisory` | 3 | 3 | 3/3 (100%) | `VALIDATED` |
| `journey_readiness_overrides` | 0 | 0 | 0/0 (N/A) | `VALIDATED` |
| `journey_events` | 195 | 195 | 195/195 (100%) | `VALIDATED` |
| `incidents` | 12 | 12 | 12/12 (100%) | `VALIDATED` |
| `rop_reports` | 6 | 6 | 6/6 (100%) | `VALIDATED` |
| **TOTALS** | **996** | **996** | **996/996 (100%)** | **SUCCESS** |
