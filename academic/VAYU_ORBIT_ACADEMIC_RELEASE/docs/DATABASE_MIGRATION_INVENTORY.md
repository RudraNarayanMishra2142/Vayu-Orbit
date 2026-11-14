# VAYU ORBIT v6.0.0 — Forensic Database Migration Inventory
**Document ID:** VAYU-DOC-DBM-001  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Complete Forensic Audit of SQLite Databases & PostgreSQL Migration Mapping  
**Date:** November 15, 2026  
**Target Environment:** Firebase SQL Connect / Cloud SQL for PostgreSQL (`vayuorbit-b20b5`)  

---

## 1. Executive Summary & Database Roles

A forensic audit of the VAYU ORBIT Academic Release (`academic/VAYU_ORBIT_ACADEMIC_RELEASE/`) identified two active SQLite databases and two timestamped forensic backups located in `backend/`:

| Database File | File Size | SHA-256 Checksum (Prefix) | Role & Operational Status |
|---|---|---|---|
| `military_logistics.db` | 3,166,208 bytes | `91c5abe7118e416e...` | **Active Operational Database:** Primary persistent store utilized by the FastAPI backend during live runtime, simulation runs, and automated testing. |
| `military_logistics_demo.db` | 229,376 bytes | `002f364d3ac6165e...` | **Demonstration Seed Baseline:** Clean evaluation baseline populated with static reference data (military nodes, places, vehicle master) but reset of active operational journeys and transient audit logs. |
| `military_logistics.db.backup_20261115_020231` | 3,166,208 bytes | `4b14b27d7fceca65...` | **Pre-Auth Migration Backup:** Forensic backup capturing pre-Firebase state. Verified intact with `PRAGMA integrity_check = 'ok'`. |
| `military_logistics_demo.db.backup_20261115_020231` | 221,184 bytes | `934ac45b236ec253...` | **Pre-Auth Demo Backup:** Forensic backup of pristine demo database. Verified intact with `PRAGMA integrity_check = 'ok'`. |

All four database files were verified with SQLite `PRAGMA integrity_check;` and returned status `ok`.

---

## 2. Discovered Table Inventory & Row Counts

Both `military_logistics.db` and `military_logistics_demo.db` contain exactly **18 relational tables**, 0 views, 0 triggers, and 4 explicit non-automatic indices:

| Table Name | Active DB Rows | Demo DB Rows | Column Count | Primary Key | Declared Foreign Keys |
|---|---|---|---|---|---|
| `audit_events` | 4 | 0 | 9 | `event_id` | 0 |
| `audit_log` | 286 | 0 | 8 | `id` (Autoincrement) | 0 |
| `fleet_units` | 4 | 4 | 10 | `unit_id` | 1 (`model_id` -> `vehicle_master.vehicle_id`) |
| `incidents` | 12 | 0 | 18 | `id` | 1 (`journey_id` -> `journeys.journey_id`) |
| `journey_events` | 195 | 0 | 6 | `id` (Autoincrement) | 0 |
| `journey_fuel_config` | 68 | 0 | 7 | `journey_id` | 1 (`journey_id` -> `journeys.journey_id`) |
| `journey_fuel_overrides` | 15 | 0 | 8 | `journey_id` | 1 (`journey_id` -> `journeys.journey_id`) |
| `journey_readiness_overrides` | 0 | 0 | 6 | `journey_id` | 0 |
| `journey_sensitivity_advisory` | 3 | 3 | 11 | `journey_id` | 0 |
| `journey_spacing_config` | 10 | 0 | 6 | `journey_id` | 1 (`journey_id` -> `journeys.journey_id`) |
| `journeys` | 122 | 0 | 16 | `journey_id` | 0 |
| `military_nodes` | 116 | 116 | 11 | `node_id` | 0 |
| `places` | 116 | 116 | 14 | `place_id` | 0 |
| `rop_reports` | 6 | 2 | 15 | `report_id` | 0 |
| `staged_sessions` | 0 | 0 | 4 | `staged_id` | 0 |
| `users` | 3 | 3 | 8 | `id` | 0 |
| `vehicle_master` | 36 | 36 | 22 | `vehicle_id` | 0 |
| `vehicle_status` | 0 | 0 | 3 | `vehicle_id` | 0 |

---

## 3. Discovered Schema & Column Specifications

### 3.1 Core Geography & Master Fleet Catalog
- **`military_nodes`** (116 nodes):
  - `node_id` (TEXT, PK): E.g. `CN-AMB`, `MS-LEH`, `AF-SRN`.
  - `installation_name` (TEXT, NOT NULL)
  - `node_type` (TEXT, NOT NULL): E.g. `Cantonment`, `Forward Outpost`.
  - `state` (TEXT, NOT NULL), `command_jurisdiction` (TEXT, NOT NULL)
  - `primary_highway` (TEXT, NULL), `lat` (REAL), `lon` (REAL)
  - `delay_multiplier` (REAL), `max_axle_load_tons` (REAL), `clearance_time_mins` (INTEGER)
- **`places`** (116 places):
  - `place_id` (TEXT, PK), `place_name` (TEXT, NOT NULL), `category` (TEXT, NOT NULL), `region` (TEXT, DEFAULT '')
  - `lat` (REAL, NOT NULL), `lon` (REAL, NOT NULL), `status` (TEXT, DEFAULT 'ACTIVE')
  - `access_class` (TEXT, DEFAULT 'SIMULATION'), `max_vehicle_tons` (REAL, DEFAULT 12)
  - `clearance_m` (REAL, DEFAULT 4.0), `support_services` (TEXT, DEFAULT ''), `description` (TEXT, DEFAULT '')
  - `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`vehicle_master`** (36 vehicle models):
  - `vehicle_id` (TEXT, PK): E.g. `VM-STALLION-4X4`, `VM-SCANIA-TT-6X4`.
  - `class_type` (TEXT, NOT NULL), `model_name` (TEXT, NOT NULL), `maker` (TEXT, NOT NULL)
  - `axle_config` (TEXT), `gvw_tons` (REAL, NOT NULL), `operational_range_km` (INTEGER, NOT NULL)
  - `max_speed_kmh` (INTEGER, NOT NULL), `routing_footprint` (TEXT), `role_category` (TEXT, DEFAULT 'DUAL')
  - `is_vip` (INTEGER, DEFAULT 0), `rated_passenger_capacity` (INTEGER, NULL), `passenger_capacity_verified` (INTEGER, DEFAULT 0)
  - `rated_payload_tons` (REAL, NULL), `payload_capacity_verified` (INTEGER, DEFAULT 0), `capacity_source_note` (TEXT, DEFAULT '')
  - `image_url` (TEXT, DEFAULT ''), `is_active` (INTEGER, DEFAULT 1), `fuel_type` (TEXT, DEFAULT 'DIESEL')
  - `tank_capacity_liters` (REAL, NULL), `fuel_consumption_kmpl` (REAL, NULL), `fuel_spec_verified` (INTEGER, DEFAULT 1)
- **`fleet_units`** (4 active units):
  - `unit_id` (TEXT, PK), `model_id` (TEXT, NOT NULL, FK -> `vehicle_master.vehicle_id`), `callsign` (TEXT)
  - `status` (TEXT, DEFAULT 'AVAILABLE'), `registration_no` (TEXT), `assigned_base` (TEXT, DEFAULT '')
  - `is_demo` (INTEGER, DEFAULT 0), `notes` (TEXT, DEFAULT '')
  - `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`vehicle_status`**:
  - `vehicle_id` (TEXT, PK), `status` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)

### 3.2 User Identity, Access Control & Governance
- **`users`** (3 active accounts):
  - `id` (TEXT, PK): E.g. `USR-COORDINATOR-01`, `USR-CREATOR-01`, `USR-CHECKPOINT-01`.
  - `email` (TEXT, NOT NULL, UNIQUE): Unique index `idx_users_email`.
  - `password_hash` (TEXT, NOT NULL): PBKDF2-SHA256 hash (never printed).
  - `role` (TEXT, NOT NULL): Authoritative local role (`CREATOR`, `CHECKPOINT_OPERATOR`, `COORDINATOR`, `ADMIN`).
  - `firebase_uid` (TEXT, NULL, UNIQUE): Firebase Identity Subject. Unique index `idx_users_firebase_uid`.
  - `status` (TEXT, NOT NULL, DEFAULT 'ACTIVE'): Lifecycle state (`ACTIVE`, `DISABLED`, `PENDING_ROLE`).
  - `created_at` (TEXT, NULL), `updated_at` (TEXT, NULL)
- **`staged_sessions`**:
  - `staged_id` (TEXT, PK), `owner_user_id` (TEXT, NOT NULL), `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)

### 3.3 Convoy Journeys & Operational Management
- **`journeys`** (122 records in active DB):
  - `journey_id` (TEXT, PK): Format `CMS-YYYYMMDD-<HEX>`.
  - `origin_id` (TEXT, NOT NULL), `dest_id` (TEXT, NOT NULL)
  - `origin_name` (TEXT, NULL), `dest_name` (TEXT, NULL)
  - `departure_date` (TEXT, NULL), `departure_time` (TEXT, NULL)
  - `status` (TEXT, NOT NULL, DEFAULT 'DRAFT'): `DRAFT`, `PLANNED`, `IN_TRANSIT`, `COMPLETED`, `CANCELLED`.
  - `convoy_json` (TEXT, DEFAULT '[]'): JSON array of convoy vehicle units, payloads, and drivers.
  - `route_json` (TEXT, DEFAULT '{}'): JSON object of active route waypoints, coordinates, and VORAM profile.
  - `baseline_route_json` (TEXT, DEFAULT '{}'): JSON object of initial planned corridor.
  - `risk` (REAL, NULL), `distance_km` (REAL, NULL), `eta_hours` (REAL, NULL)
  - `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`journey_events`** (195 records):
  - `id` (INTEGER, PK, AUTOINCREMENT), `journey_id` (TEXT, NOT NULL)
  - `event_type` (TEXT, NOT NULL), `message` (TEXT, NOT NULL), `payload_json` (TEXT, DEFAULT '{}')
  - `created_at` (TEXT, NOT NULL)
- **`journey_fuel_config`** (68 records):
  - `journey_id` (TEXT, PK, FK -> `journeys.journey_id`), `reserve_percent` (REAL, DEFAULT 20.0)
  - `departure_fuel_mode` (TEXT, DEFAULT 'UNKNOWN'), `vehicle_fuel_levels_json` (TEXT, DEFAULT '{}')
  - `updated_at` (TEXT, NOT NULL), `updated_by` (TEXT, NOT NULL), `notes` (TEXT, DEFAULT '')
- **`journey_fuel_overrides`** (15 records):
  - `journey_id` (TEXT, PK, FK -> `journeys.journey_id`), `override_type` (TEXT, NOT NULL)
  - `fuel_assessment_status` (TEXT, NOT NULL), `assessment_hash` (TEXT, NOT NULL)
  - `reason` (TEXT, NOT NULL), `authorized_by` (TEXT, NOT NULL), `authorized_role` (TEXT, NOT NULL)
  - `created_at` (TEXT, NOT NULL)
- **`journey_spacing_config`** (10 records):
  - `journey_id` (TEXT, PK, FK -> `journeys.journey_id`), `min_spacing_m` (REAL, DEFAULT 40.0)
  - `max_spacing_m` (REAL, NULL), `updated_at` (TEXT, NOT NULL), `updated_by` (TEXT, NOT NULL), `reason` (TEXT, DEFAULT '')
- **`journey_sensitivity_advisory`** (3 records):
  - `journey_id` (TEXT, PK), `sensitivity_level` (TEXT, DEFAULT 'STANDARD')
  - `escort_requirement_state` (TEXT, DEFAULT 'REVIEW_REQUIRED'), `policy_reference` (TEXT, DEFAULT 'DEF-LOG-SOP-2026/SEC-04')
  - `support_notes` (TEXT, DEFAULT ''), `reviewed_by` (TEXT, NULL), `reviewed_at` (TEXT, NULL)
  - `confirmed_by` (TEXT, NULL), `confirmed_at` (TEXT, NULL), `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`journey_readiness_overrides`** (0 records):
  - `journey_id` (TEXT, PK), `override_type` (TEXT, DEFAULT 'READINESS_ADVISORY_OVERRIDE')
  - `reason` (TEXT, NOT NULL), `authorized_by` (TEXT, NOT NULL), `authorized_role` (TEXT, NOT NULL), `created_at` (TEXT, NOT NULL)

### 3.4 Reconnaissance, Incidents & Audits
- **`rop_reports`** (6 records in active DB, 2 in demo):
  - `report_id` (TEXT, PK): Format `ROP-YYYYMMDD-<HEX>`.
  - `journey_id` (TEXT, NOT NULL), `route_version` (TEXT, NOT NULL)
  - `reporting_user_id` (TEXT, NOT NULL), `reporting_user_email` (TEXT, NOT NULL), `reporting_user_role` (TEXT, NOT NULL)
  - `status` (TEXT, DEFAULT 'SUBMITTED'): `SUBMITTED`, `VERIFIED`, `REJECTED`.
  - `observation_period_start` (TEXT, NULL), `observation_period_end` (TEXT, NULL)
  - `parameters_json` (TEXT, NOT NULL, DEFAULT '{}'): JSON object of verified VORAM road status factors.
  - `reviewed_by` (TEXT, NULL), `reviewed_at` (TEXT, NULL), `review_decision_notes` (TEXT, NULL)
  - `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`incidents`** (12 records):
  - `id` (TEXT, PK), `journey_id` (TEXT, NOT NULL, FK -> `journeys.journey_id`), `vehicle_id` (TEXT, NULL), `unit_id` (TEXT, NULL)
  - `rule_type` (TEXT, NOT NULL), `violation_type` (TEXT, NOT NULL), `message` (TEXT, NOT NULL)
  - `evidence_source` (TEXT, DEFAULT 'MANUAL_REPORT'), `observation_time` (TEXT, NOT NULL), `last_known_pos` (TEXT, NULL)
  - `verification_state` (TEXT, DEFAULT 'SUSPECTED'), `handling_state` (TEXT, DEFAULT 'OPEN')
  - `operator_ack` (TEXT, NULL), `checkpoint_ack` (TEXT, NULL), `occurrence_count` (INTEGER, DEFAULT 1)
  - `resolution_details` (TEXT, NULL), `created_at` (TEXT, NOT NULL), `updated_at` (TEXT, NOT NULL)
- **`audit_log`** (286 records):
  - `id` (INTEGER, PK, AUTOINCREMENT), `action` (TEXT, NOT NULL), `object_type` (TEXT, NULL), `object_id` (TEXT, NULL)
  - `details` (TEXT, NULL), `created_at` (TEXT, NOT NULL), `actor_id` (TEXT, NULL), `actor_role` (TEXT, NULL)
- **`audit_events`** (4 records):
  - `event_id` (TEXT, PK), `action` (TEXT, NOT NULL), `entity_type` (TEXT, NOT NULL), `entity_id` (TEXT, NOT NULL)
  - `actor_id` (TEXT, NOT NULL), `actor_role` (TEXT, NOT NULL), `details` (TEXT, NOT NULL), `diff_json` (TEXT, DEFAULT '{}')
  - `created_at` (TEXT, NOT NULL). Index `idx_audit_events_entity`, `idx_audit_events_created`.

---

## 4. Foreign-Key Graph & Topological Migration Order

The schema forms a clean Directed Acyclic Graph (DAG) with zero circular dependencies:

```
[Layer 0: Master Independent Tables]
  |-- military_nodes
  |-- places
  |-- vehicle_master
  |-- users
  |-- audit_events
  |-- audit_log
  `-- staged_sessions

[Layer 1: Dependent on Master Catalog]
  |-- fleet_units (FK: model_id -> vehicle_master.vehicle_id)
  |-- vehicle_status (Logical FK: vehicle_id -> vehicle_master.vehicle_id)
  `-- journeys (Logical FK: origin_id, dest_id -> military_nodes.node_id)

[Layer 2: Dependent on Journeys]
  |-- incidents (FK: journey_id -> journeys.journey_id)
  |-- journey_fuel_config (FK: journey_id -> journeys.journey_id)
  |-- journey_fuel_overrides (FK: journey_id -> journeys.journey_id)
  |-- journey_spacing_config (FK: journey_id -> journeys.journey_id)
  |-- journey_events (Logical FK: journey_id -> journeys.journey_id)
  |-- journey_sensitivity_advisory (Logical FK: journey_id -> journeys.journey_id)
  |-- journey_readiness_overrides (Logical FK: journey_id -> journeys.journey_id)
  `-- rop_reports (Logical FK: journey_id -> journeys.journey_id)
```

**Safe Topological Migration Sequence:**
1. `military_nodes`, `places`, `vehicle_master`, `users`, `audit_events`, `audit_log`, `staged_sessions`
2. `fleet_units`, `vehicle_status`, `journeys`
3. `journey_fuel_config`, `journey_fuel_overrides`, `journey_spacing_config`, `journey_sensitivity_advisory`, `journey_readiness_overrides`, `journey_events`, `incidents`, `rop_reports`

---

## 5. SQLite-Specific Features Requiring PostgreSQL Replacement

| SQLite Feature | Discovered Usage | PostgreSQL Replacement |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `audit_log.id`, `journey_events.id` | `BIGSERIAL PRIMARY KEY` or `INTEGER GENERATED ALWAYS AS IDENTITY` with sequence reset (`SELECT setval(...)`) |
| `datetime('now')` / `datetime('now', 'localtime')` | 4 occurrences in `api.py` (JIT link, user update) | `CURRENT_TIMESTAMP` or `NOW()` |
| Parameter Placeholder `?` | Used across ~150 queries in `api.py` | `%s` in `psycopg` / standard PostgreSQL drivers |
| `PRAGMA` Statements | WAL mode, busy timeout, table_info in `api.py` & `audit_service.py` | Native PostgreSQL connection pooling, `information_schema` queries |
| Transaction Syntax | `BEGIN IMMEDIATE` in `db_transaction()` | Standard `BEGIN` / `COMMIT` / `ROLLBACK` |
| Boolean as `INTEGER` (0/1) | `is_vip`, `is_active`, `is_demo` in `vehicle_master`, `fleet_units` | Native PostgreSQL `BOOLEAN` (preserving integer 0/1 during export/import) |
| JSON stored in `TEXT` | `convoy_json`, `route_json`, `parameters_json`, `diff_json` | Native PostgreSQL `JSONB` for indexing and query performance, or `TEXT` compatibility |
| Dict-like Row Factory | `sqlite3.Row` in `api.py` | `psycopg.rows.dict_row` or `RealDictCursor` |

---

## 6. Discovered Inconsistencies Between Main and Demo Databases

1. **Operational History Differences:**
   - `military_logistics.db` contains 122 active journeys, 195 journey timeline events, 286 audit logs, 15 fuel overrides, 68 fuel configs, 12 incidents, and 6 ROP recon reports accumulated during simulation sessions and test suites.
   - `military_logistics_demo.db` is an unpolluted baseline containing 0 journeys, 0 incidents, 0 audit logs, and 0 journey events, retaining only static reference catalogs (116 nodes, 116 places, 36 vehicle specifications, 4 fleet units, 3 user seeds, 2 template ROP reports).
2. **Schema Uniformity:**
   - Both databases share identical 18-table schemas, including the newly added `firebase_uid` and `status` columns and indices on `users`.
3. **Backup Parity:**
   - The timestamped backups `military_logistics.db.backup_20261115_020231` and `military_logistics_demo.db.backup_20261115_020231` represent the state prior to Firebase Auth schema changes (4-column `users` table). Both are verified byte-for-byte and structurally integral.

---

## 7. Affected Backend Modules & API Endpoints

### 7.1 Backend Modules
- **`backend/api.py`:** Core FastAPI service handling ~45 routes, database transaction context manager (`db_transaction`), connection factory (`conn`), query dispatcher (`query`), execution dispatcher (`execsql`), and user identity resolution (`get_current_user`).
- **`backend/audit_service.py`:** Structured audit recording (`record_audit`) inserting into `audit_log` and `audit_events`.
- **`backend/tactical_router.py`:** NetworkX corridor graph compilation querying `military_nodes` and `places`.
- **`backend/fleet_engine.py`:** Fleet retrieval querying `vehicle_master`.
- **`backend/revision_service.py`:** Vehicle specification revision provenance and immutability engine.
- **`backend/prepare_demo_db.py` & `backend/seed_demo_scenarios.py`:** Scenario seeder and database reset scripts.

### 7.2 Affected Operational Endpoints
- **Authentication & User Management:** `POST /api/auth/login`, `POST /api/auth/session`, `GET /api/auth/me`, `GET /api/auth/users`, `PUT /api/auth/users/{user_id}/role`, `PUT /api/auth/users/{user_id}/status`.
- **Fleet & Vehicles:** `GET /api/fleet`, `GET /api/vehicles`, `GET /api/fleet/units`.
- **Corridor & Route Planning:** `POST /api/routes/evaluate`, `POST /api/voram/assess`, `GET /api/nodes`, `GET /api/places`.
- **Journey Operations:** `GET /api/journeys`, `POST /api/journeys`, `GET /api/journeys/{id}`, `PUT /api/journeys/{id}/status`, `POST /api/journeys/{id}/checkpoints`.
- **Fuel Intelligence & Gates:** `GET /api/journeys/{id}/fuel-intelligence`, `POST /api/journeys/{id}/fuel-override`.
- **ROP Reconnaissance:** `POST /api/rop-reports`, `GET /api/rop-reports/{journey_id}`, `PUT /api/rop-reports/{report_id}/review`.
- **Audit Logging:** `GET /api/audit`, `GET /api/audit/events`.
