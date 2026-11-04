# VAYU ORBIT

### Intelligent Convoy Movement Planning & Dynamic Route Optimization System for Military Logistics Decision Support

**Author:** Rudra Narayan Mishra  
**Release:** Academic Evaluation Release (v6.0.0)  
**Distribution Target:** Academic Instructors, Evaluators & Authorized Collaborators  
**Licence:** Proprietary Academic Evaluation Licence (See [LICENSE](LICENSE))  
**Copyright:** Copyright © 2026 Rudra Narayan Mishra. All rights reserved.  

---

## 1. PROJECT OVERVIEW

**VAYU ORBIT** is an academic software engineering and decision-support prototype designed to model, simulate, optimize, and supervise complex military logistical convoy movements across large geographical transportation corridors.

Combining constraint-aware graph network routing, vehicle axle weight calculations, live telemetry simulation, dynamic disruption re-planning, and automated debrief reporting, VAYU ORBIT provides military logistics planners with actionable intelligence before, during, and after critical transport missions.

- **Tagline:** *Intelligence Around Every Journey*
- **Primary Operational Loop:**
  $$\text{PLAN} \longrightarrow \text{MOVE} \longrightarrow \text{MONITOR} \longrightarrow \text{DETECT} \longrightarrow \text{RESPOND} \longrightarrow \text{REPORT} \longrightarrow \text{PLAN}$$

---

## 2. ACADEMIC PURPOSE

This release package is created exclusively for **academic evaluation, coursework examination, architectural review, and non-commercial demonstration**. 

It allows academic teachers, project examiners, and authorized student collaborators to:
1. Inspect the source-code architecture, mathematical graph heuristics, and component models.
2. Run the application locally in an isolated development environment without touching any production database.
3. Validate software engineering principles, security boundaries (JWT/RBAC), and user experience design.
4. Verify algorithmic correctness through the integrated test suites.

---

## 3. PROBLEM STATEMENT

Military logistics convoy movement planning across vast territories is hampered by several critical challenges:
1. **Multi-Echelon Physical Road Constraints:** Heavy transport vehicles (e.g., tank transporters, ammunition carriers) exceed the axle-load limits and vertical height clearances of civilian bridges and narrow mountain corridors.
2. **Dynamic Route Fragility:** Real-world disruptions (landslides, flash floods, simulated SITREP threats, civil strikes) require instant re-routing that takes convoy mass, speed, and remaining fuel into account.
3. **Information Asymmetry:** Convoy dispatchers often lack real-time visibility into inter-vehicle spacing violations, speed limits, and checkpoint clearance delays.
4. **Post-Mission Debrief Gaps:** Historical convoy data is frequently lost in fragmented paperwork, preventing institutional learning and route optimization.

---

## 4. PROPOSED SOLUTION

VAYU ORBIT addresses these challenges through a unified tactical platform:
- **Corridor Graph Engine:** A multi-node topological network representing 116 military installations, cantonments, and airbases with enforced weight, height, and clearance constraints.
- **VORAM & ROP Readiness Matrix:** The *Vayu Operational Readiness & Assessment Matrix* (VORAM) evaluates convoy readiness across 7 critical logistical vectors before dispatch.
- **Tactical Rerouting Heuristics:** Modified Dijkstra routing using NetworkX with dynamic penalty weight adjustments triggered by real-time SITREP intelligence.
- **Atomic Incident Ledger & Real-Time Monitoring:** Real-time detection and logging of spacing deviations, fuel deficits, and checkpoint delays.
- **Automated Debrief PDF Generation:** One-click generation of multi-page mission debrief PDFs detailing GPS waypoints, telemetry graphs, and incident chronologies.

---

## 5. MAJOR SYSTEM CAPABILITIES

### Implemented & Verified Capabilities
- **Pan-India GIS Installation Registry (116 Nodes):** Complete node catalog with latitude/longitude coordinates, state jurisdictions, and clearance delay multipliers.
- **Master Fleet Catalog (36 Military Models):** Detailed vehicle specs across 5 categories:
  - Category A: Light Tactical Vehicles (LTV) — Tata Safari GS800, Mahindra Armado, Gypsy.
  - Category B: Medium Logistical Vehicles (MSV) — Ashok Leyland Stallion 4x4, Tata 713 TC.
  - Category C: Heavy Logistical & Specialist Vehicles (HSV) — Tatra 8x8, AL FAT 6x6, Scania HET.
  - Category D: Armoured Combat Vehicles (ACV) — BMP-2 Sarath, T-90 Bhishma, T-72 Ajeya.
  - Category E: Heavy Equipment Transporters (HET) — Tank trailers and recovery vehicles.
- **Dynamic Convoy Composition:** Real-time calculation of total convoy weight, max axle load, minimum vertical clearance, and convoy length.
- **Constraint-Aware Route Planning:** Automated identification of blocked corridors, delay penalties, and alternate route generation.
- **VORAM Pre-Dispatch Readiness Gate:** Enforces speed, spacing, fuel reserve, escort necessity, and driver clearance before allowing mission commitment.
- **Live Lifecycle Operations Dashboard:** Simulates real-time convoy progression through active, interrupted, and completed phases.
- **Automated Incident Logging:** Detects rule violations (e.g., speed > 60 km/h, spacing < 40m).
- **ReportLab PDF Debrief Generator:** Compiles audit logs, mission timelines, and charts into downloadable PDF debrief reports.
- **Role-Based Access Control (RBAC):** Cryptographically enforced JWT authentication for 4 distinct roles: `COORDINATOR`, `COMMANDER`, `OPERATOR`, `OBSERVER`.

### Partially Implemented / Experimental Capabilities
- **What-If Scenario Sandbox (`scenario_engine.py`):** Deterministic mathematical perturbation engine for evaluating multi-threat simulations against baseline routes.
- **Multi-Route Elevation Profiler:** Visual elevation approximation based on corridor geographical coordinates.

---

## 6. TECHNOLOGY STACK

### Backend
- **Framework:** FastAPI `0.142.2` (Asynchronous ASGI REST API)
- **ASGI Server:** Uvicorn `0.54.0`
- **Data Serialization & Validation:** Pydantic `2.13.5`
- **Graph & Algorithms:** NetworkX `3.6.1` (Corridor Graph Dijkstra)
- **Security & Cryptography:** PyJWT `2.13.0`, Passlib `1.7.4`, Bcrypt `4.1.3`
- **Report Generation:** ReportLab `4.4.10`, Pillow `11.3.0`
- **Database Engine:** SQLite 3 (WAL journal mode, busy timeout 5000ms)
- **Test Framework:** Pytest `9.1.1`

### Frontend
- **Framework:** React `19.3.0` (Client Single Page Application)
- **Tooling & Bundler:** Vite `8.3.3` (with `@vitejs/plugin-react` `6.1.2`)
- **Mapping & GIS:** Leaflet `1.9.4`
- **Icons:** Lucide React `1.52.0`
- **Design System:** Custom tactical CSS with CSS variables, dark/light theme support, and responsive grid layouts.

---

## 7. SYSTEM ARCHITECTURE OVERVIEW

```text
┌───────────────────────────────────────────────────────────────┐
│                    VAYU ORBIT FRONTEND                        │
│      React 19 / Vite 8 / Leaflet GIS / Lucide Tactical Icons  │
│  (Overview, Planning, Convoy, Assessment, Operations, Report) │
└───────────────────────────────┬───────────────────────────────┘
                                │ HTTPS / REST API + JWT
┌───────────────────────────────▼───────────────────────────────┐
│                    VAYU ORBIT BACKEND                         │
│               FastAPI / Uvicorn / Pydantic                    │
├───────────────────────────────┬───────────────────────────────┤
│  Routing & Graph Engines      │  Security & Governance        │
│  - tactical_router.py         │  - auth.py (JWT / RBAC)       │
│  - NetworkX Dijkstra          │  - audit_service.py           │
├───────────────────────────────┼───────────────────────────────┤
│  Logistics Intelligence       │  Reporting & Export           │
│  - fleet_engine.py            │  - report_service.py          │
│  - voram_service.py           │  - report_pdf.py (ReportLab)  │
│  - intelligence_engine.py     │  - revision_service.py        │
└───────────────────────────────┬───────────────────────────────┘
                                │ SQLite PRAGMA WAL
┌───────────────────────────────▼───────────────────────────────┐
│              ISOLATED DEMO DATABASE (SQLite)                  │
│               military_logistics_demo.db                      │
│     (116 Places, 36 Models, Demo Journeys, Audit Ledger)      │
└───────────────────────────────────────────────────────────────┘
```

---

## 8. REPOSITORY STRUCTURE (ACADEMIC PACKAGE)

```text
academic/VAYU_ORBIT_ACADEMIC_RELEASE/
├── LICENSE                          # Proprietary academic evaluation licence
├── COPYRIGHT.md                     # Copyright declaration & ownership attribution
├── AUTHORIZED_USE.md                # Permitted academic use & operational boundaries
├── THIRD_PARTY_NOTICES.md           # Third-party dependencies & licence register
├── README.md                        # THIS MAIN DOCUMENTATION
├── START_VAYU_ORBIT_DEMO.bat        # One-click demo launcher (supervisor)
├── RESET_VAYU_ORBIT_DEMO.bat        # Demo database reset utility
├── SEED_DEMO_SCENARIOS.bat          # Sample scenarios pre-stager
├── backend/                         # FastAPI backend service
│   ├── api.py                       # REST API endpoints & route handlers
│   ├── auth.py                      # Authentication & token verification
│   ├── audit_service.py             # Atomic audit logging service
│   ├── database_engine.py           # Master node GPS database provisioner
│   ├── demo_launcher.py             # Process supervisor & port health checker
│   ├── fleet_engine.py              # Convoy calculations & constraints
│   ├── intelligence_engine.py       # Heuristic SITREP text parser
│   ├── migrate_fleet_schema.py      # Master vehicle fleet catalog migrations
│   ├── military_logistics.db        # Protected catalog master baseline
│   ├── military_logistics_demo.db   # Active isolated demonstration database
│   ├── prepare_demo_db.py           # Demo DB reset utility
│   ├── report_pdf.py                # ReportLab PDF debrief engine
│   ├── report_service.py            # Journey analytics & report aggregator
│   ├── requirements.txt             # Python dependencies manifest
│   ├── revision_service.py          # Multi-hop route revision engine
│   ├── scenario_engine.py           # Phase 4 what-if perturbation sandbox
│   ├── seed_demo_scenarios.py       # Demo scenario seeder
│   ├── tactical_router.py           # NetworkX graph Dijkstra router
│   ├── vehicle_database.py          # Fleet schema provisioner
│   ├── voram_service.py             # VORAM readiness matrix engine
│   └── tests/                       # Formal pytest automated test suite
│       ├── test_voram_api.py        # 13 VORAM API integration tests
│       └── test_voram_core.py       # 44 VORAM core algorithmic unit tests
├── frontend/                        # React 19 / Vite client application
│   ├── index.html                   # HTML5 client entry point
│   ├── package.json                 # Node package manifest
│   ├── package-lock.json            # Dependency lockfile
│   ├── vite.config.js               # Bundler configuration
│   ├── .env.local                   # Local API host binding
│   ├── .env.example                 # Environment template
│   ├── vayu.png                     # Protected brand logo
│   ├── vayu_logo.png                # Primary brand asset
│   ├── public/                      # Static assets & vehicle SVGs
│   └── src/                         # React component & page source code
│       ├── App.jsx                  # Main application state container
│       ├── main.jsx                 # Client DOM mounting
│       ├── styles.css               # Tactical design system tokens & styles
│       ├── components/              # Layout, MapView, ErrorBoundary, Planning
│       ├── pages/                   # 14 active tactical application views
│       └── services/                # API client, navigation, preferences
└── documentation/                   # Evaluation documentation
    ├── VAYU_ORBIT_Target_System_Specification_v1.1.pdf
    ├── VAYU_ORBIT_DEMO_SCENARIOS.md
    ├── DEMO_QUICK_START.md
    └── DEMO_TROUBLESHOOTING.md
```

---

## 9. PREREQUISITES

Before running the application, ensure the host machine has:
1. **Python:** Version `3.11` or higher (Tested on `3.13.6` 64-bit). Ensure `python` is added to system `PATH`.
2. **Node.js & npm:** Node.js LTS version `18` or `20+` (Tested with npm `11.x`).
3. **Web Browser:** Google Chrome, Microsoft Edge, or Mozilla Firefox.

---

## 10. BACKEND INSTALLATION

Open a terminal (PowerShell or Bash) in `academic/VAYU_ORBIT_ACADEMIC_RELEASE/`:

```powershell
cd backend
python -m pip install -r requirements.txt
```

Verify the installation:
```powershell
python -c "import fastapi, uvicorn, networkx, reportlab; print('All core modules installed successfully!')"
```

---

## 11. FRONTEND INSTALLATION

In another terminal window:

```powershell
cd frontend
npm install
```

---

## 12. ENVIRONMENT CONFIGURATION

The frontend connects to the backend via `VITE_API_BASE_URL`. A pre-configured `.env.local` is included:

```ini
VITE_API_BASE_URL=http://127.0.0.1:8000
```

If deploying on a different local port, edit `.env.local` accordingly.

---

## 13. DATABASE INITIALISATION

The academic release includes a pre-staged demonstration database (`backend/military_logistics_demo.db`).

If you ever wish to reset the database to a pristine zero-journey state:
- Double-click `RESET_VAYU_ORBIT_DEMO.bat`, OR
- Run:
  ```powershell
  python backend/prepare_demo_db.py
  ```

To pre-stage sample demonstration journeys (`CMS-DEMO-ACTIVE-01` and `CMS-DEMO-COMPLETED-02`):
- Double-click `SEED_DEMO_SCENARIOS.bat`, OR
- Run:
  ```powershell
  python backend/seed_demo_scenarios.py
  ```

---

## 14. RUNNING THE APPLICATION

### Option A: One-Click Demonstration Launcher (Recommended)
Double-click `START_VAYU_ORBIT_DEMO.bat` in the project root.  
This launches `backend/demo_launcher.py`, which:
1. Verifies production catalog hash integrity.
2. Binds the isolated demonstration database (`CMS_DB_PATH`).
3. Starts the FastAPI backend on `http://127.0.0.1:8000`.
4. Starts the Vite frontend on `http://localhost:5173`.
5. Automatically opens your default web browser to the VAYU ORBIT dashboard.

### Option B: Manual Process Startup

**Terminal 1 (Backend):**
```powershell
cd backend
$env:CMS_DB_PATH = "$PWD\military_logistics_demo.db"
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm run dev
```

Navigate to: `http://localhost:5173`

---

## 15. DEMONSTRATION USAGE & LOGIN CREDENTIALS

The prototype includes pre-configured academic evaluation accounts:

| Role | Username / Email | Password | Access Scope |
|---|---|---|---|
| **COORDINATOR** | `coordinator@vayu.local` | `VayuOrbit@2026` | Full planning, convoy builder, dispatch, debrief export |
| **CREATOR** | `creator@vayu.local` | `VayuOrbit@2026` | Route creation, node management, initial manifest staging |
| **CHECKPOINT OPERATOR** | `checkpoint@vayu.local` | `VayuOrbit@2026` | Checkpoint clearance, live disruption logging, speed monitoring |

*See [documentation/VAYU_ORBIT_DEMO_SCENARIOS.md](documentation/VAYU_ORBIT_DEMO_SCENARIOS.md) for full walkthrough scenarios.*

---

## 16. RUNNING AUTOMATED TESTS

The academic package includes a full automated test suite verifying VORAM readiness calculations, axle tolerance math, and API contract security:

```powershell
python -m pytest backend/tests
```

**Expected Result:** `57 passed in ~2.5s`

---

## 17. KNOWN LIMITATIONS

1. **Simulation Scope:** Road coordinates and distance calculations are computed using Haversine distance heuristics on graph corridors. Real-world physical road gradients and unmapped detours are not modeled.
2. **Database Engine:** SQLite 3 is utilized for lightweight academic portability. It is suitable for single-node simulation, not high-throughput distributed military deployments.
3. **Map Tile Streaming:** The interactive map requires an active internet connection to download cartographic tiles from CARTO / OpenStreetMap. If offline, the map renders with a grid canvas while all routing algorithms function normally.

---

## 18. ACADEMIC USAGE CONDITIONS

This software is licensed solely for personal educational review, coursework examination, and authorized collaborative research. **Unauthorised redistribution, commercial exploitation, public hosting, or deployment into defence operational systems is strictly prohibited.** See [AUTHORIZED_USE.md](AUTHORIZED_USE.md) for details.

---

## 19. COPYRIGHT & OWNERSHIP

```text
Copyright © 2026 Rudra Narayan Mishra. All rights reserved.
```
Authored by Rudra Narayan Mishra. See [COPYRIGHT.md](COPYRIGHT.md) and [LICENSE](LICENSE).

---

## 20. OPERATIONAL MILITARY DISCLAIMER

**VAYU ORBIT IS AN ACADEMIC PROTOTYPE FOR RESEARCH AND COURSEWORK PURPOSES ONLY.**  
It is **NOT** certified for operational military deployment, tactical convoy dispatch on active civil/military highways, or mission-critical life safety operations. No classified or real-world military operational security (OPSEC) data is included in or supported by this software.
