<div align="center">

<img src="academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend/public/vayu_logo.png" alt="VAYU ORBIT Logo" width="220"/>

# VAYU ORBIT

### Intelligent Convoy Movement Planning & Dynamic Route Optimisation System
**Academic Logistics Decision Support System · Problem Statement PDS-3**  
*School of Computer Science & Engineering, Lovely Professional University, Punjab, India*

---

[![Python](https://img.shields.io/badge/Python-3.13.6-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.142.2-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.3.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.3.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![NetworkX](https://img.shields.io/badge/NetworkX-3.6.1-orange?style=for-the-badge)](https://networkx.org)
[![Licence](https://img.shields.io/badge/Licence-Proprietary_Academic-red?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Academic_Evaluation_Release-yellow?style=for-the-badge)]()
[![Tests](https://img.shields.io/badge/Tests-80_Passing-brightgreen?style=for-the-badge)]()

</div>

---

> [!IMPORTANT]
> **Academic Evaluation Prototype Disclaimer**  
> **VAYU ORBIT** is an academic software decision-support simulation prototype developed by **Rudra Narayan Mishra** at Lovely Professional University under Academic Problem Statement **PDS-3**.  
> - It is **NOT** officially deployed, validated, or approved by the Indian Armed Forces, Ministry of Defence, or any military establishment.
> - It does **NOT** perform live vehicle GPS tracking, military satellite telemetry, or physical dispatch operations.
> - Risk assessment algorithms (VORAM) are deterministic weighted mathematical heuristics and do **NOT** constitute trained statistical machine learning or operational safety certifications.
> - The software is distributed strictly under a **Proprietary Academic Evaluation Licence** for authorized coursework examination, peer review, and research demonstration. Commercial exploitation and unauthorized redistribution are strictly prohibited.

---

## 1. Project Title & Overview

**VAYU ORBIT** is an intelligent decision-support system designed to model, assess, and optimize multi-vehicle tactical convoy transit across simulated road and terrain corridors. The system addresses critical logistical constraints encountered in convoy planning, including bridge axle weight limits, vehicle gross vehicle weight (GVW) ratings, passenger-to-freight payload safety separation, elevation gradients, and real-time Road Opening Party (ROP) recon updates.

- **Author & Copyright Claimant:** Rudra Narayan Mishra (Project Lead & Lead Developer)
- **Project Documentation Associate:** Suryansh Kumar Singh
- **Institution:** Lovely Professional University, Punjab, India
- **Problem Statement:** PDS-3 (Convoy Movement Planning & Dynamic Tactical Route Optimization)
- **Release Version:** 6.0.0 (Academic Release)

---

## 2. Problem Statement

Military logistical convoys operating in rugged, high-altitude, and hostile environments demand rapid, multi-criteria decision-making that civilian navigation services cannot provide:
1. **Civilian Map Inadequacy:** Commercial navigation platforms prioritize minimal travel time for single passenger cars, ignoring column length, turning radius, military convoy speed governors, and bridge classification.
2. **Structural & Mechanical Risk:** Heavy tank transporters (e.g., BEML HET, Scania 70t) crossing weight-restricted or damaged bridges cause catastrophic transit failure if axle ratings are not strictly checked.
3. **Payload Non-Compliance:** Unchecked co-mingling of hazardous ammunition/explosives with personnel transports violates safety protocols.
4. **Information Asymmetry:** Convoy dispatch coordinators often lack a consolidated interface connecting reconnaissance intelligence (road closures, culvert damage, unconfirmed bottlenecks) with real-time route replanning.

---

## 3. Proposed Solution

VAYU ORBIT provides a deterministic, multi-criteria decision-support architecture:
- **Corridor Graph Engine:** A topological routing graph of 116 public simulation cantonments, air bases, and transit waypoints across northern and western corridors in India.
- **Dynamic Constraint Filtering:** Segments are automatically pruned or penalized if convoy gross weight exceeds bridge classification or road surface clearance.
- **Deterministic Risk Scoring (VORAM):** A multi-factor mathematical heuristic evaluating route segments across surface condition, bridge compatibility, weather severity, altitude gradient, bottleneck density, and intelligence freshness.
- **Road Opening Party (ROP) Recon Integration:** Forward checkpoint reconnaissance units submit structured condition reports directly affecting corridor traversability.
- **Enforced Separation of Duties:** Role-based access control (RBAC) ensuring creators, checkpoint observers, and dispatch coordinators operate with distinct, auditable privileges.

---

## 4. Key Objectives

1. Model tactical vehicle convoy configurations (light tactical vehicles, medium supply vehicles, heavy equipment transporters, and specialized recovery assets).
2. Validate manifest legality (tare weight, rated payload, seating capacity, and hazardous cargo segregation) prior to corridor assignment.
3. Compute cost-optimal, multi-criteria primary and alternate routes using weighted graph algorithms (NetworkX Dijkstra with tactical penalty multipliers).
4. Provide interactive map visualization leveraging **Leaflet** for rendering and **TomTom Routing API** for road network geometry.
5. Provide auditable departure gate controls, fuel feasibility checks, and coordinator override mechanisms.

---

## 5. Key Features

- **Multi-Vehicle Convoy Builder:** Interactive composition of tactical columns from 36 vehicle specifications with manifest validation.
- **Dynamic Tactical Routing:** Real-time generation of balanced, fastest, safest, and terrain-avoidant transit alternatives.
- **VORAM Intelligence Panel:** Segment-by-segment visual breakdown of route risk scores, identifying critical bottleneck sectors.
- **Road Opening Party (ROP) Recon Workflow:** Two-party workflow where checkpoint observers submit reconnaissance observations and coordinators review/approve them.
- **Fuel Feasibility & Emergency Departure Gates:** Autonomous fuel consumption modeling preventing dispatch when reserves fall below safety thresholds unless explicitly overridden by an authorized coordinator.
- **Immutable Structured Audit Logging:** High-integrity actor attribution tracking every planning adjustment, departure override, and status modification.

---

## 6. Role-Based Workflows (RBAC)

The system enforces authoritative separation of duties across three operational roles:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               OPERATIONAL ROLES                                 │
├───────────────────────┬────────────────────────────┬────────────────────────────┤
│   CREATOR             │   CHECKPOINT OPERATOR      │   COORDINATOR              │
│   (Logistics Planner) │   (Field Recon Observer)   │   (Authorizing Commander)  │
├───────────────────────┼────────────────────────────┼────────────────────────────┤
│ • Build convoys       │ • Inspect passing convoys  │ • Review VORAM risks       │
│ • Assign vehicles     │ • Log arrival/departure    │ • Approve ROP recon reports│
│ • Request routes      │ • Submit ROP recon reports │ • Authorize fuel overrides │
│ • Review manifests    │ • Report incident hazards  │ • Authorize dispatch gate  │
│ ✗ Cannot authorize    │ ✗ Cannot plan routes       │ • View full audit trail    │
└───────────────────────┴────────────────────────────┴────────────────────────────┘
```

---

## 7. Technical Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             VAYU ORBIT ARCHITECTURE                              │
└──────────────────────────────────────────────────────────────────────────────────┘

   [ React 19 Frontend (Vite) ]
          │
          ├── Leaflet 1.9 (Cartographic Rendering & Overlay Display)
          ├── TomTom Routing API (Road Network Geometry & Multi-Point Waypoints)
          ├── Firebase Web SDK (Client Authentication & App Check Attestation)
          │
          ▼  HTTP / REST (FastAPI Endpoints)
   [ FastAPI Backend Engine ]
          │
          ├── Auth & RBAC Guard (authoritative role verification & Firebase Admin SDK)
          ├── Tactical Router (NetworkX Dijkstra multi-criteria graph engine)
          ├── VORAM Scoring Engine (Deterministic weighted risk formula)
          ├── Fleet & Manifest Engine (Payload, axle load, and fuel consumption checks)
          └── Audit Service (Structured actor attribution logging)
          │
          ▼  Database Adapter (db_adapter.py)
   [ Database Layer ]
          ├── SQLite (Default isolated demo evaluation database: military_logistics_demo.db)
          └── PostgreSQL / Firebase Data Connect (Cloud SQL compatible enterprise engine)
```

---

## 8. Technology Stack

- **Backend:** Python 3.13, FastAPI 0.142.2, Uvicorn 0.54.0, Pydantic 2.13.5
- **Graph & Algorithms:** NetworkX 3.6.1, Google OR-Tools 9.15
- **Security & Authentication:** Firebase Admin SDK, PyJWT 2.13, Passlib, Bcrypt 4.1.3
- **Frontend:** React 19.3.0, Vite 8.3.3, TailwindCSS 4.0
- **Mapping & Cartography:** Leaflet 1.9 (tile rendering), TomTom Web Routing API (road geometry)
- **Database:** SQLite 3 (WAL mode) / PostgreSQL 15+ via psycopg 3.3.9
- **Testing:** Pytest 9.1, TestClient (Starlette/HTTPX)

---

## 9. VORAM Explanation

The **VAYU ORBIT Risk Assessment Model (VORAM)** is an open, deterministic mathematical heuristic designed to quantify transit corridor vulnerability. It evaluates six weighted parameter scores:

$$\text{VORAM Score} = \sum_{i=1}^{6} (w_i \cdot s_i) \cdot \gamma_{\text{safeguard}}$$

Where:
- $s_1$: **Road Surface & Infrastructure Vulnerability** ($w_1 = 0.25$)
- $s_2$: **Bridge Load Capacity Deficit** ($w_2 = 0.25$) — Enforces mandatory disqualification if axle weight exceeds bridge capacity.
- $s_3$: **Adverse Weather & Visibility Degradation** ($w_3 = 0.15$)
- $s_4$: **Elevation Gradient & High-Altitude Penalties** ($w_4 = 0.15$)
- $s_5$: **Chokepoint Density & Bottleneck Susceptibility** ($w_5 = 0.10$)
- $s_6$: **Intelligence Age & Uncertainty Factor** ($w_6 = 0.10$)
- $\gamma_{\text{safeguard}}$: Safeguard coefficient applied when stale or conflicting field observations exist.

### Risk Categorization Thresholds:
- **0.0 – 24.9:** Low Concern (Green)
- **25.0 – 49.9:** Moderate Concern (Yellow)
- **50.0 – 74.9:** Elevated Concern (Orange)
- **75.0 – 100.0:** Critical / Ineligible (Red)

---

## 10. Repository Structure

```
vayu_orbit_repo/
├── .gitignore                                 # Rigorous secret and database exclusion
├── LICENSE                                    # Proprietary Academic Evaluation Licence
├── README.md                                  # Evaluator overview and setup guide
└── academic/
    └── VAYU_ORBIT_ACADEMIC_RELEASE/
        ├── README.md                          # Comprehensive academic release documentation
        ├── LICENSE                            # Academic Evaluation Licence
        ├── AUTHORIZATION.md                   # Academic project authorization
        ├── AUTHORIZED_USE.md                  # Permitted evaluation use boundaries
        ├── COPYRIGHT.md                       # Intellectual property notice
        ├── THIRD_PARTY_NOTICES.md             # Third-party dependency licenses
        ├── PRD.md                             # Product Requirements Document
        ├── requirements.txt                   # Top-level dependencies
        ├── backend/
        │   ├── api.py                         # FastAPI application and route endpoints
        │   ├── auth.py                        # Authoritative RBAC and token validation
        │   ├── db_adapter.py                  # Dual-engine database abstraction
        │   ├── tactical_router.py             # NetworkX convoy routing engine
        │   ├── voram_service.py               # Deterministic VORAM implementation
        │   ├── fleet_engine.py                # Manifest and payload checking
        │   ├── audit_service.py               # Structured audit logging
        │   ├── prepare_demo_db.py             # Reproducible demo DB generator
        │   ├── military_logistics_demo.db     # Sanitized academic evaluation DB
        │   ├── requirements.txt               # Backend Python package requirements
        │   └── tests/                         # Pytest test suite (80 unit & API tests)
        ├── frontend/
        │   ├── index.html                     # Frontend entrypoint
        │   ├── package.json                   # React 19 dependencies and scripts
        │   ├── .env.example                   # Safe template with placeholders
        │   ├── src/
        │   │   ├── App.jsx                    # Application layout and routing
        │   │   ├── components/                # MapView, RoutePreview, ROP Modal
        │   │   ├── pages/                     # ConvoyBuilder, Overview, Operations
        │   │   └── services/                  # api.js and firebase.js loaders
        │   └── public/                        # Vehicle SVG assets and logo
        └── docs/                              # Architecture, Migration, and Audit Reports
```

---

## 11. Database Architecture & Demo Setup

VAYU ORBIT supports dual database engines via `backend/db_adapter.py`:
1. **SQLite (Local Demo Mode - Default):** Uses `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/military_logistics_demo.db`.
   - **Sanitization Guarantee:** Contains 0 active operational journeys, 0 incident records, 0 audit logs, and 0 personal user accounts.
   - **Included Simulation Accounts:**
     - Creator: `creator@vayu.local` (Password: `DemoCreator@2026`)
     - Checkpoint Operator: `checkpoint@vayu.local` (Password: `DemoCheckpoint@2026`)
     - Coordinator: `coordinator@vayu.local` (Password: `DemoCoordinator@2026`)
2. **PostgreSQL / Firebase SQL Connect:** Production-ready adapter supporting Cloud SQL and PostgreSQL 15+ schemas located in `backend/migrations/schema_postgres.sql`.

To re-initialize or reset the demonstration database at any time:
```powershell
python academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/prepare_demo_db.py --reset
```

---

## 12. Installation & Local Execution Instructions

### Prerequisites
- **Python 3.11+** (Tested on Python 3.13.6)
- **Node.js 18+** & **npm**
- **Git**

### Step 1: Clone Repository
```powershell
git clone https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git
cd Vayu-Orbit/academic/VAYU_ORBIT_ACADEMIC_RELEASE
```

### Step 2: Backend Setup
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### Step 3: Frontend Setup
```powershell
cd ../frontend
npm install
```

### Step 4: Launch Applications
**Terminal 1 (Backend):**
```powershell
cd backend
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 13. Testing & Verification

The academic release contains an automated test suite verifying routing determinism, VORAM formulas, schema integrity, and security fail-safes:

```powershell
# Run full backend test suite (80 tests)
cd academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend
python -m pytest tests/ -v
```

Expected output:
```
======================= 80 passed, 4 warnings in 41.12s =======================
```

---

## 14. Demonstration & Evaluation Credentials

For academic evaluation and live demonstration, the database and authentication service include pre-provisioned role accounts:

| Role | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Convoy Coordinator** | `coordinator@vayu.local` | `DemoCoordinator@2026` | Full command, convoy approvals, and reroute authorizations |
| **Convoy Creator** | `creator@vayu.local` | `DemoCreator@2026` | Route planning, vehicle manifest configuration, and convoy creation |
| **Checkpoint Recon** | `checkpoint@vayu.local` | `DemoCheckpoint@2026` | Checkpoint clearance, transit logging, and field observations |

*Note: The frontend login interface also provides one-click quick-select role buttons to automatically populate these credentials.*

---

## 15. Demonstration & Interface References

The project includes verified demonstration interface captures in `academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend/public/showcase/`:
- `planning_showcase.png`: Multi-vehicle convoy manifest builder and waypoint configuration.
- `route_intelligence_showcase.png`: Leaflet cartographic display showing primary vs. alternate tactical routes with VORAM risk categorizations.
- `operations.png`: Live journey monitoring console with checkpoint event timeline and ROP status overlays.

---

## 16. Academic Scope & Limitations

1. **Simulated Geography:** Corridor waypoints represent synthetic simulation networks based on public geography and do not reflect real military supply depots.
2. **Deterministic Modeling:** Environmental conditions (weather, road damage) are simulated parameters input for evaluation purposes.
3. **Hardware Boundaries:** The system operates as a software decision-support aid and does not interface with physical vehicle CAN buses or tactical radio links.

---

## 17. Future Enhancements

- Multi-convoy collision avoidance and temporal slot scheduling using genetic algorithms.
- Satellite synthetic aperture radar (SAR) flood/landslide imagery integration for automated road condition scoring.
- Offline-first progressive web application (PWA) synchronization for forward operating checkpoints with intermittent bandwidth.

---

## 18. Project Team & Roles

- **Rudra Narayan Mishra** — Project Lead & Lead Developer
  - Copyright Claimant & Primary Author (Registration No: 12515636)
  - System architecture, backend and frontend development, routing algorithms, VORAM heuristics, database schema design, and security implementation.
  - Academic Degree: B.Tech Computer Science & Engineering
  - Primary Contact: mishrarudranarayan797@gmail.com
- **Suryansh Kumar Singh** — Project Documentation Associate
  - Preparation and maintenance of project documentation.
  - Organisation and formatting of project reports and supporting documents.
  - Maintenance of documentation structure and records.
- **Academic Institution:** Lovely Professional University, Punjab, India
- **Course / Context:** CSE276 - Problem Statement PDS-3
- **Mentor:** Hitesh Kumar

---

## 19. Proprietary Licence Summary

This software is governed by the **VAYU ORBIT Proprietary Academic Evaluation Licence** (see [LICENSE](LICENSE)).
- **Permitted:** Non-commercial educational review, coursework examination, academic demonstration, and local experimental testing.
- **Prohibited:** Commercial use, redistribution, public mirroring, sublicensing, or deployment in production military systems without prior written authorization.

Copyright © 2026 Rudra Narayan Mishra. All rights reserved.
