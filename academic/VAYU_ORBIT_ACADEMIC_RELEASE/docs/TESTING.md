# VAYU ORBIT — Quality Assurance & Testing Suite
## Version 6.0.0 | Academic Release | Problem Statement PDS-3

---

## 1. Quality Assurance Overview

VAYU ORBIT employs a multi-tiered validation strategy to ensure high operational integrity across routing, manifest compliance, risk classification, and API security.

Testing encompasses:
- **Unit & Algorithmic Tests:** Verification of Dijkstra multi-factor edge weighting, VORAM scoring brackets, fuel safety reserves, and vehicle axle limits.
- **Relational Integrity Tests:** Foreign-key enforcement, SQLite schema migrations, and cryptographic baseline hashes.
- **API Endpoint Contract Tests:** REST request validation via Pydantic v2 schemas, JWT authentication, and RBAC authorization barriers.
- **Frontend Build Validation:** Zero-warning Vite bundle production builds.
- **Cryptographic Parity Verification:** SHA-256 hash comparison between original development assets and the academic release package.

---

## 2. Automated Test Execution

The automated test suite is powered by `pytest` and `pytest-asyncio` inside the `backend/` directory.

### Running the Full Test Suite
```bash
cd backend
pytest tests/ -v
```

### Running Specific Test Categories
```bash
# 1. Routing & VORAM algorithmic tests
pytest tests/test_routing.py -v

# 2. Database schema & manifest validation tests
pytest tests/test_database.py -v

# 3. API endpoint & authentication contract tests
pytest tests/test_api.py -v
```

---

## 3. Test Suite Results (60 / 60 Passed)

The academic release codebase achieves **100% test pass rate** across all 60 automated test cases:

```text
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-8.3.4, pluggy-1.5.0
rootdir: C:\Users\mishr\OneDrive\Desktop\CMS\programme\academic\VAYU_ORBIT_ACADEMIC_RELEASE\backend
plugins: anyio-4.8.0, asyncio-0.25.3
collected 60 items

tests/test_api.py::test_health_unauthenticated_guard PASSED              [  1%]
tests/test_api.py::test_auth_login_success PASSED                         [  3%]
tests/test_api.py::test_auth_login_invalid_password PASSED               [  5%]
tests/test_api.py::test_auth_me_endpoint PASSED                           [  6%]
tests/test_api.py::test_places_catalog_count PASSED                       [  8%]
tests/test_api.py::test_places_station_types PASSED                       [ 10%]
tests/test_api.py::test_nodes_topology_connectivity PASSED                [ 11%]
tests/test_api.py::test_route_calculation_valid_corridor PASSED           [ 13%]
tests/test_api.py::test_route_calculation_invalid_nodes PASSED            [ 15%]
tests/test_api.py::test_route_weight_penalty_enforcement PASSED           [ 16%]
tests/test_api.py::test_voram_risk_score_calculation PASSED               [ 18%]
tests/test_api.py::test_voram_risk_tier_classification PASSED             [ 20%]
tests/test_api.py::test_sitrep_intelligence_parsing PASSED               [ 21%]
tests/test_api.py::test_sitrep_threat_injection PASSED                    [ 23%]
tests/test_api.py::test_journey_creation_valid_manifest PASSED            [ 25%]
tests/test_api.py::test_journey_creation_overweight_rejection PASSED      [ 26%]
tests/test_api.py::test_journey_creation_passenger_only_cargo_rejection PASSED [ 28%]
tests/test_api.py::test_journey_retrieval_by_id PASSED                    [ 30%]
tests/test_api.py::test_rop_report_submission PASSED                      [ 31%]
tests/test_api.py::test_rop_report_status_update PASSED                   [ 33%]
tests/test_api.py::test_readiness_override_authorization PASSED           [ 35%]
tests/test_database.py::test_schema_initialization_tables PASSED          [ 36%]
tests/test_database.py::test_stations_count PASSED                        [ 38%]
tests/test_database.py::test_vehicle_master_records PASSED                [ 40%]
tests/test_database.py::test_vehicle_gvw_vs_tare_semantics PASSED        [ 41%]
tests/test_database.py::test_passenger_only_vehicle_flag PASSED           [ 43%]
tests/test_database.py::test_segment_directional_integrity PASSED         [ 45%]
tests/test_database.py::test_segment_gradient_values PASSED               [ 46%]
tests/test_database.py::test_segment_surface_categories PASSED           [ 48%]
tests/test_database.py::test_auxiliary_tables_presence PASSED             [ 50%]
tests/test_database.py::test_baseline_demo_database_hash PASSED          [ 51%]
tests/test_database.py::test_foreign_key_integrity PASSED                 [ 53%]
tests/test_database.py::test_audit_log_record_creation PASSED             [ 55%]
tests/test_database.py::test_session_staging_persistence PASSED           [ 56%]
tests/test_routing.py::test_dijkstra_shortest_distance PASSED             [ 58%]
tests/test_routing.py::test_dijkstra_gradient_cost_weighting PASSED      [ 60%]
tests/test_routing.py::test_dijkstra_surface_cost_weighting PASSED       [ 61%]
tests/test_routing.py::test_dijkstra_threat_cost_weighting PASSED        [ 63%]
tests/test_routing.py::test_bridge_load_limit_filtering PASSED            [ 65%]
tests/test_routing.py::test_alternate_route_divergence PASSED            [ 66%]
tests/test_routing.py::test_voram_threat_factor_scaling PASSED            [ 68%]
tests/test_routing.py::test_voram_elevation_factor_scaling PASSED         [ 70%]
tests/test_routing.py::test_voram_weather_factor_scaling PASSED           [ 71%]
tests/test_routing.py::test_voram_vulnerability_factor_scaling PASSED     [ 73%]
tests/test_routing.py::test_voram_aggregate_score_bounds PASSED          [ 75%]
tests/test_routing.py::test_voram_tier_threshold_low PASSED               [ 76%]
tests/test_routing.py::test_voram_tier_threshold_moderate PASSED          [ 78%]
tests/test_routing.py::test_voram_tier_threshold_high PASSED              [ 80%]
tests/test_routing.py::test_voram_tier_threshold_critical PASSED          [ 81%]
tests/test_routing.py::test_fuel_base_consumption_rate PASSED             [ 83%]
tests/test_routing.py::test_fuel_gradient_penalty_scaling PASSED           [ 85%]
tests/test_routing.py::test_fuel_crawl_speed_penalty PASSED               [ 86%]
tests/test_routing.py::test_fuel_safety_reserve_plain_sector PASSED       [ 88%]
tests/test_routing.py::test_fuel_safety_reserve_mountain_sector PASSED    [ 90%]
tests/test_routing.py::test_manifest_cargo_tonnage_aggregation PASSED     [ 91%]
tests/test_routing.py::test_manifest_passenger_headcount_aggregation PASSED [ 93%]
tests/test_routing.py::test_manifest_convoy_length_calculation PASSED     [ 95%]
tests/test_routing.py::test_manifest_vehicle_position_sequence PASSED     [ 96%]
tests/test_routing.py::test_rop_hazard_route_cost_escalation PASSED       [ 98%]
tests/test_routing.py::test_rop_clearance_route_restoration PASSED         [100%]

============================== 60 passed in 1.48s ==============================
```

---

## 4. Test Coverage Matrix

| Subsystem | Test Module | Test Count | Pass Rate | Key Invariants Verified |
|---|---|---|---|---|
| **API & Auth** | `test_api.py` | 21 | 100% | JWT validation, RBAC barriers, endpoint request schemas, HTTP error codes |
| **Database & Schema** | `test_database.py` | 13 | 100% | 116 stations, vehicle master, GVW/tare semantics, cryptographic hash guard |
| **Routing & VORAM** | `test_routing.py` | 26 | 100% | Modified Dijkstra, gradient/surface costs, VORAM formulas, fuel reserves |
| **Total** | **All Modules** | **60** | **100%** | **Full system specification verified** |

---

## 5. Frontend Production Build Verification

The frontend production build was verified using the Vite bundler:

```bash
cd frontend
npm run build
```

**Build Output:**
```text
vite v5.4.14 building for production...
transforming...
✓ 142 modules transformed.
rendering chunks...
computing chunk sizes...
dist/index.html                   0.92 kB │ gzip:  0.48 kB
dist/assets/index-D7K3eM9p.css   48.21 kB │ gzip:  8.44 kB
dist/assets/index-C8u2P2aK.js   346.85 kB │ gzip: 104.12 kB
✓ built in 769ms
```
- **Total compilation time:** < 800 milliseconds.
- **Zero build errors:** No broken module imports, circular dependencies, or JSX syntax errors.

---

## 6. Original vs. Academic Parity Verification

To prove that the migrated academic package is functionally identical to the source development application, a comprehensive SHA-256 hash audit was executed (`verify_hash_parity.py`):

- **Total Files Evaluated:** 164 files
- **Identical Hash Matches:** **157 files (100% parity across all runtime code)**
- **Intentional Modifications:** 1 file (`backend/prepare_demo_db.py` updated with active database cryptographic hash)
- **Academic Additions:** 6 files (Windows launchers, `requirements.txt`, `.env.example`, formal specification PDF)
- **Zero Missing Core Modules:** All components, routes, services, schemas, and tests accounted for.

---

## 7. Manual Smoke Testing Procedures

Evaluators can perform a rapid 5-minute manual smoke test:

1. **Start System:** Run `START_VAYU_ORBIT_DEMO.bat`.
2. **Authenticate:** Log in with `coordinator@vayu.local` / `<ASSIGNED_EVALUATOR_PASSWORD>`.
3. **Generate Route:** Navigate to **Route Assessment**, select `Ambala Air Force Station` to `Leh Military Station`, set speed to `40 km/h`, click **Assess Route**.
   - *Verification:* Primary route displays ~209 km, VORAM score displays classified risk, elevation profile displays gradient.
4. **Create Convoy:** Navigate to **Journey Planning**, select the evaluated corridor, add 1× Ashok Leyland Stallion (cargo: 4.5 T) and 1× Tata Safari (cargo: 0.0 T), click **Schedule Journey**.
   - *Verification:* Journey ID generated (`CMS-YYYYMMDD-XXXXXX`), status shows `SCHEDULED`.
5. **Open Operations Cockpit:** Navigate to **Journey Operations**, click the newly scheduled journey row.
   - *Verification:* Journey details open, turn-by-turn guidance displays, map renders route.
6. **File ROP Recon:** In Journey Cockpit, click **Submit ROP Report**, select `ROUTE CLEARED`, submit.
   - *Verification:* Readiness badge updates to **CLEARED FOR DEPARTURE**.

---
*VAYU ORBIT Quality Assurance Manual | School of Computer Science & Engineering | LPU 2026*
