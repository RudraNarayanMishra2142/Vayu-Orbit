# VAYU ORBIT v6.0.0 — PostgreSQL Database Architecture Specification
**Document ID:** VAYU-DOC-PGA-002  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** PostgreSQL 15+ Target Architecture, Data Model, Connection Pooling & Security  
**Date:** November 15, 2026  
**Target Environment:** Cloud SQL for PostgreSQL / Firebase SQL Connect (`vayuorbit-b20b5`)  

---

## 1. Overview & Architectural Principles

Under Academic Problem Statement **PDS-3**, VAYU ORBIT transitions its relational persistence tier from embedded SQLite to **Enterprise PostgreSQL 15+** managed via Google Cloud SQL and integrated with Firebase SQL Connect (Firebase Data Connect).

### Key Architectural Tenets:
1. **FastAPI Remains the Sole Authoritative API:** The frontend React SPA never connects directly to database tables. All operational transactions, convoy manifest validations, fuel feasibility calculations, ROP clearance workflows, and VORAM scoring remain strictly mediated by the FastAPI backend.
2. **Sovereign Operational RBAC:** Identity verification is performed via Firebase Authentication ID tokens at the edge, but all role authorizations (`CREATOR`, `CHECKPOINT_OPERATOR`, `COORDINATOR`, `ADMIN`) are enforced exclusively by the authoritative `users` table in PostgreSQL.
3. **Strict Type Safety & JSONB Acceleration:** Unstructured JSON strings (`convoy_json`, `route_json`, `parameters_json`) are stored natively as `JSONB`, enabling indexing and query acceleration.
4. **Zero Cloud Lock-in / Dual Adapter Support:** The application data layer supports both `DATABASE_PROVIDER=sqlite` (local testing/air-gapped development) and `DATABASE_PROVIDER=postgresql` (staging/production Cloud SQL).

---

## 2. PostgreSQL Relational Data Model

The schema comprises **18 relational tables** organized into four functional domains:

```
+---------------------------------------------------------------------------------------------------+
| 1. CORE GEOGRAPHY & FLEET MASTER                                                                  |
|    - military_nodes (116 nodes, lat/lon, delay_multiplier, max_axle_load_tons)                    |
|    - places (116 installations, access_class, clearance_m, max_vehicle_tons)                     |
|    - vehicle_master (36 models, gvw_tons, range, speed, fuel specs)                              |
|    - fleet_units (active convoy assets -> FK: vehicle_master.vehicle_id)                          |
|    - vehicle_status (live operational condition)                                                  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 2. USER IDENTITY & AUTHORITATIVE RBAC                                                             |
|    - users (id, email UNIQUE, password_hash, role, firebase_uid UNIQUE, status)                   |
|    - staged_sessions (ephemeral session state)                                                    |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 3. CONVOY JOURNEYS & FUEL GOVERNANCE                                                              |
|    - journeys (id, origin/dest, route_json JSONB, convoy_json JSONB, risk, eta_hours)            |
|    - journey_events (BIGSERIAL PK, timeline events, payload_json JSONB)                           |
|    - journey_fuel_config (FK: journeys -> reserve_percent, vehicle_fuel_levels_json JSONB)        |
|    - journey_fuel_overrides (FK: journeys -> assessment_hash, authorized_by, audit reason)        |
|    - journey_spacing_config (FK: journeys -> min_spacing_m, max_spacing_m)                         |
|    - journey_sensitivity_advisory (security escort requirement state)                             |
|    - journey_readiness_overrides (coordinator departure override)                                 |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| 4. RECONNAISSANCE, INCIDENTS & IMMUTABLE AUDITS                                                   |
|    - rop_reports (scout recon clearance -> parameters_json JSONB, status, separation of duties)   |
|    - incidents (FK: journeys -> rule violations, verification_state, handling_state)              |
|    - audit_log (BIGSERIAL PK, operational action history, actor_id, actor_role)                   |
|    - audit_events (UUID PK, fine-grained state diffs, diff_json JSONB)                           |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Type System & Semantics Mapping

| SQLite Predecessor | PostgreSQL Target Type | Rationale & Behavioral Semantics |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL PRIMARY KEY` | High-capacity sequential identity. Sequence reset via `setval()` post-migration. |
| `TEXT` (JSON strings) | `JSONB` | Binary JSON storage with decomposition, key lookups, and syntax validation. |
| `INTEGER` (Booleans: 0 or 1) | `BOOLEAN` | Native PostgreSQL boolean type (`true` / `false`). Coerced safely during export/import. |
| `TEXT` (ISO-8601 strings) | `TIMESTAMPTZ` | Timezone-aware timestamping (`CURRENT_TIMESTAMP`). Eliminates SQLite date formatting bugs. |
| `REAL` | `DOUBLE PRECISION` | 64-bit IEEE floating-point arithmetic for latitude, longitude, and tonnage. |
| `TEXT` (Unique Email) | `VARCHAR(255)` with `idx_users_email` | Case-insensitive lookup accelerated via index on `LOWER(email)`. |

---

## 4. Connection Management & Pooling

### 4.1 Connection Architecture
To handle high-concurrency requests and prevent connection exhaustion on Cloud SQL, the FastAPI backend implements connection pooling via `psycopg_pool` (ConnectionPool) or `SQLAlchemy` engine pool:

```python
# Pool Configuration Parameters:
# min_size: 4 connections (pre-warmed for low cold-start latency)
# max_size: 20 connections (sized for Cloud Run concurrency limits)
# max_idle: 300 seconds (recycles stale sockets)
# timeout: 10.0 seconds (fast-fail on network partitioning)
```

### 4.3 Database Adapter & RowDict Semantics (Stage 2 Hardening)

In Stage 2, `backend/db_adapter.py` was hardened to ensure 100% behavioral compatibility between SQLite and PostgreSQL:

1. **`RowDict` Dual-Access Wrapper:**
   - In SQLite, `sqlite3.Row` permits both dictionary key access (`row['status']`) and integer positional indexing (`row[0]`).
   - Standard PostgreSQL dictionaries (`psycopg.rows.dict_row`) do not support integer indexing.
   - `RowDict` subclasses `dict` while wrapping keys in a positional index list, enabling seamless index-based unpacking (`row[0]`, `row[1]`) and key access (`row['journey_id']`) across all backend modules without code refactoring.
2. **`SimpleConnectionPool` Implementation:**
   - Thread-safe queue-based connection pool with configurable `max_size` (default 10) and `timeout` (default 5.0s).
   - Validates socket liveness on release, discarding terminated connections and creating replacements on demand.
3. **Hardened `adapt_sql` Query Engine:**
   - AST-safe character stream tokenizer that preserves SQL comments (`--`, `/* */`), single quotes, and escaped quotes (`''`).
   - Translates `?` parameter markers outside literals to `%s`.
   - Converts SQLite `datetime('now')` to PostgreSQL standard `CURRENT_TIMESTAMP`.
   - Translates `INSERT OR IGNORE INTO` to standard `INSERT INTO ... ON CONFLICT DO NOTHING`.
   - Translates `sqlite_master` catalog checks to `information_schema.tables`.
4. **Zero Silent Fallback:**
   - Connection or query errors under `DATABASE_PROVIDER=postgresql` raise immediately as `DatabaseConnectionError` / `DatabaseOperationalError`.
   - Prevents split-brain transactions and silently desynchronized writes.

---

## 5. Security & Isolation Controls

1. **Least-Privilege Database Role:** The application connects as an unprivileged application user (`vayu_app_user`), not `postgres`. The role owns table DML rights but cannot drop databases or alter server configurations.
2. **Strict Parameterization:** 100% of queries use parameter placeholders (`%s`), preventing SQL injection.
3. **Transaction Boundaries:** Multi-step operational operations (such as Journey Commit, Checkpoint Arrival, and ROP Review) run within atomic transactions (`BEGIN ... COMMIT`).
4. **Zero Secret Leakage:** Database credentials and socket paths are read from environment variables or Google Secret Manager (`DATABASE_URL`, `DB_PASSWORD`), never hardcoded in source.
