# VAYU ORBIT — Academic Release v6.0.0
## Intelligent Convoy Movement Planning & Dynamic Route Optimisation System

```
================================================================================
  VAYU ORBIT: ADVANCED MILITARY CONVOY LOGISTICS & ROUTE ASSESSMENT SYSTEM
  Academic Research Evaluation Prototype | Release Version: 6.0.0
  Capstone Project | School of Computer Science & Engineering
  Lovely Professional University, Punjab, India | Academic Session 2026–2027
================================================================================
```

---

## 1. Abstract & Executive Summary

**VAYU ORBIT** is a military logistics convoy planning, route assessment, and operational decision-support prototype developed under Academic Problem Statement **PDS-3** (Autonomous / Semi-Autonomous Logistics & Tactical Convoy Scheduling).

- **Project Lead & Lead Developer:** Rudra Narayan Mishra (Author & Copyright Claimant)
- **Project Documentation Associate:** Suryansh Kumar Singh
- **Institution:** Lovely Professional University, Punjab, India
- **Problem Statement:** PDS-3
- **Licence:** Proprietary Academic Evaluation Licence (see `LICENSE`)

Military logistics operations in rugged, high-altitude, and hostile environments demand rapid, multi-criteria decision-making that accounts for vehicle mechanical limitations, strict payload safety margins, tactical threat geography, dynamic weather advisories, and real-time recon intelligence. Traditional civilian route optimization tools do not account for bridge weight classifications, convoy column speed penalties, road opening party (ROP) clearances, or military payload separation rules.

VAYU ORBIT addresses these constraints through a unified, high-integrity decision-support system featuring:
- A **multi-factor cost-weighted routing engine** that incorporates gradient, surface friction, tactical risk, and payload class.
- The **VORAM (Vayu Orbit Risk Assessment Model)** algorithm, providing deterministic risk classification across transit corridors.
- An **operational vehicle manifest validation pipeline** enforcing axle load limits, freight vs. passenger segregation, and tare vs. payload semantics.
- A **Road Opening Party (ROP) reconnaissance integration** allowing forward clearing teams to inject road status, obstacles, and security clearances.
- An **enforced three-tier RBAC architecture** guaranteeing authoritative separation of duties between Logistics Planners (Creators), Field Observers (Checkpoint Operators), and Authorizing Commanders (Coordinators).

---

## 2. System Architecture

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

## 3. Technology Stack

- **Backend:** Python 3.13, FastAPI 0.142.2, Uvicorn 0.54.0, Pydantic 2.13.5
- **Graph & Algorithms:** NetworkX 3.6.1, Google OR-Tools 9.15
- **Security & Authentication:** Firebase Admin SDK, PyJWT 2.13, Passlib, Bcrypt 4.1.3
- **Frontend:** React 19.3.0, Vite 8.3.3, TailwindCSS 4.0
- **Mapping & Cartography:** Leaflet 1.9 (tile rendering), TomTom Web Routing API (road geometry)
- **Database:** SQLite 3 (WAL mode) / PostgreSQL 15+ via psycopg 3.3.9
- **Testing:** Pytest 9.1, TestClient (Starlette/HTTPX)

---

## 4. VORAM Risk Assessment Formula

The **VAYU ORBIT Risk Assessment Model (VORAM)** is an open, deterministic mathematical heuristic designed to quantify transit corridor vulnerability. It evaluates six weighted parameter scores:

$$\text{VORAM Score} = \sum_{i=1}^{6} (w_i \cdot s_i) \cdot \gamma_{\text{safeguard}}$$

Where:
- $s_1$: Road Surface & Infrastructure Vulnerability ($w_1 = 0.25$)
- $s_2$: Bridge Load Capacity Deficit ($w_2 = 0.25$) — Enforces mandatory disqualification if axle weight exceeds bridge capacity.
- $s_3$: Adverse Weather & Visibility Degradation ($w_3 = 0.15$)
- $s_4$: Elevation Gradient & High-Altitude Penalties ($w_4 = 0.15$)
- $s_5$: Chokepoint Density & Bottleneck Susceptibility ($w_5 = 0.10$)
- $s_6$: Intelligence Age & Uncertainty Factor ($w_6 = 0.10$)
- $\gamma_{\text{safeguard}}$: Safeguard coefficient applied when stale or conflicting field observations exist.

### Risk Categorization Thresholds:
- **0.0 – 24.9:** Low Concern (Green)
- **25.0 – 49.9:** Moderate Concern (Yellow)
- **50.0 – 74.9:** Elevated Concern (Orange)
- **75.0 – 100.0:** Critical / Ineligible (Red)

---

## 5. Quick Start for Academic Evaluators

### 1. Backend Setup
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```powershell
cd ../frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 6. Demonstration Credentials (Academic Evaluation DB)

The included evaluation database `backend/military_logistics_demo.db` contains pre-configured demonstration accounts:
- **Logistics Planner (CREATOR):** `creator@vayu.local` / `DemoCreator@2026`
- **Recon Observer (CHECKPOINT):** `checkpoint@vayu.local` / `DemoCheckpoint@2026`
- **Dispatch Commander (COORDINATOR):** `coordinator@vayu.local` / `DemoCoordinator@2026`

All accounts are mock accounts on a `.local` domain. Zero real personal credentials or active journeys exist.

---

## 7. Testing & Verification

Run the automated test suite from the backend directory:
```powershell
pytest tests/ -v
```
All 80 test cases across routing, VORAM formulas, database migration, and security assertions should pass.

---

## 8. Project Team & Roles

- **Rudra Narayan Mishra** — Project Lead & Lead Developer
  - Author & Copyright Claimant (Registration No: 12515636)
  - System architecture, backend and frontend development, routing algorithms, VORAM heuristics, and security implementation.
  - Primary Contact: mishrarudranarayan797@gmail.com
- **Suryansh Kumar Singh** — Project Documentation Associate
  - Preparation and maintenance of project documentation.
  - Organisation and formatting of project reports and supporting documents.
  - Maintenance of documentation structure and records.
- **Academic Institution:** Lovely Professional University, Punjab, India
- **Academic Context:** Capstone Project — Problem Statement PDS-3

---

## 9. Licence & Restrictions

This project is governed by the **VAYU ORBIT Proprietary Academic Evaluation Licence** (see `LICENSE`).  
Commercial use, redistribution, public mirroring, sublicensing, or deployment in production military systems without prior written authorization from Rudra Narayan Mishra is strictly prohibited.

Copyright © 2026 Rudra Narayan Mishra. All rights reserved.
