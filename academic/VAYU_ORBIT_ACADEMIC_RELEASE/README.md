# VAYU ORBIT — Academic Release v6.0.0
## Military Logistics Convoy Decision-Support System (PDS-3)

```
================================================================================
  VAYU ORBIT: ADVANCED MILITARY CONVOY LOGISTICS & ROUTE ASSESSMENT SYSTEM
  Academic Research Evaluation Prototype | Release Version: 6.0.0
  Capstone Project | School of Computer Science & Engineering
  Lovely Professional University, Punjab, India | Academic Session 2026–2027
================================================================================
```

---

## 1. Abstract / Executive Summary

**VAYU ORBIT** is a military logistics convoy planning, route assessment, and operational decision-support prototype developed under Academic Problem Statement **PDS-3** (Autonomous / Semi-Autonomous Logistics & Tactical Convoy Scheduling). 

Military logistics operations in rugged, high-altitude, and hostile environments demand rapid, multi-criteria decision-making that accounts for vehicle mechanical limitations, strict payload safety margins, tactical threat geography, dynamic weather advisories, and real-time recon intelligence. Traditional civilian route optimization tools do not account for bridge weight classifications, convoy column speed penalties, road opening party (ROP) clearances, or military payload separation rules.

VAYU ORBIT addresses these constraints through a unified, high-integrity decision-support system featuring:
- A **multi-factor cost-weighted routing engine** that incorporates gradient, surface friction, tactical risk, and payload class.
- The proprietary **VORAM (Vayu Orbit Risk Assessment Model)** algorithm, providing real-time risk classification across transit corridors.
- An **operational vehicle manifest validation pipeline** enforcing axle load limits, freight vs. passenger segregation, and tare vs. payload semantics.
- A **Road Opening Party (ROP) reconnaissance integration** allowing forward clearing teams to inject road status, obstacles, and security clearances.
- A **tactical NLP SITREP (Situation Report) parser** converting unstructured intelligence text into structured waypoint risks.
- A restrained, industrial **Haulix-inspired UI/UX** optimized for low-latency cognitive processing in high-stress operational command posts.

---

## 2. Academic Context & Attribution

This system was conceived, designed, engineered, and evaluated as an academic capstone project at **Lovely Professional University (LPU)**, Phagwara, Punjab, India.

- **Institution:** Lovely Professional University, Punjab, India
- **Department:** School of Computer Science and Engineering
- **Academic Session:** 2026–2027
- **Problem Statement ID:** PDS-3 (Tactical Convoy Scheduling & Military Logistics Decision Support)
- **Primary Author & Lead Developer:** Rudra Narayan Mishra (Registration No: `12515636`)
- **Co-Author & Contributor:** Suryansh Kumar Singh (Registration No: `12516274`)
- **Project Supervisor & Evaluator:** Er. Hitesh Kumar, Assistant Professor
- **Canonical Repository:** `https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git`
- **Release Version:** `6.0.0` (Academic Milestone Build)

All rights, authorship records, and intellectual property attributions are formally recorded in [AUTHORIZATION.md](AUTHORIZATION.md) and protected under the academic evaluation terms in [LICENSE](LICENSE).

---

## 3. Problem Statement & Operational Domain

Under **PDS-3**, logistics planners must deploy military convoys across complex geographical corridors (e.g., Northern / Eastern operational theatres) under strict constraints:

1. **Topographical & Surface Vulnerability:** Severe elevation gradients, hairpin switchbacks, unpaved terrain, and seasonal weather degradation severely degrade heavy vehicle performance, fuel burn rates, and column cohesion.
2. **Tactical Threat Environment:** Convoys traverse zones subject to artillery observation, ambush risks, mine/IED threats, and civilian congestion. Route planning must incorporate real-time threat zones and ROP scout clearance.
3. **Bridge & Axle Classification:** Heavy logistics carriers (e.g., Ashok Leyland Stallion 4×4, 6×6, Scania Tank Transporters) must respect bridge load classes and road width envelopes.
4. **Fuel Safety & Autonomous Margin Planning:** Fuel consumption is non-linear; mountain gradients and slow convoy crawl speeds triple consumption. A strict safety reserve margin must be guaranteed to prevent stranding.
5. **Decentralized Coordination:** Command headquarters, dispatchers, ROP recon parties, and vehicle operators require synchronized visibility without cognitive clutter or decorative UI overhead.

---

## 4. System Architecture Overview

VAYU ORBIT follows a decoupled, client-server micro-architecture engineered for rapid cold start, zero cloud lock-in, and offline operational resilience, augmented with Firebase Authentication and App Check for enterprise-grade edge attestation:

```
+-------------------------------------------------------------------------------+
|                             CLIENT / FRONTEND                                 |
|  React 18 + Vite SPA | Tailwind CSS (Haulix Theme) | Lucide-React             |
|  Firebase Web SDK (Auth + App Check) | Offline Tactical Vector Canvas         |
+---------------------------------------+---------------------------------------+
                                        | HTTPS / REST + X-Firebase-AppCheck
                                        | Authorization: Bearer <ID_TOKEN>
+---------------------------------------v---------------------------------------+
|                             API & ROUTING ENGINE                              |
|  FastAPI (Python 3.11+) | Pydantic v2 Validation Schemas                      |
|  - Firebase Admin SDK Token Verification & JIT Identity Resolution             |
|  - Authoritative Local RBAC (Creator, Checkpoint Operator, Coordinator, Admin)|
|  - Modified Dijkstra Multi-Factor Corridor Router                             |
|  - VORAM v2 Multi-Criteria Risk Assessment Engine                            |
|  - Manifest Validation Pipeline & Fuel Safety Calculator                     |
|  - NLP SITREP Parser & Threat Geography Injector                              |
|  - ROP Reconnaissance State Machine & Route Re-evaluation Engine              |
+---------------------------------------+---------------------------------------+
                                        | SQLite3 Prepared Transactions
+---------------------------------------v---------------------------------------+
|                             PERSISTENCE TIER                                  |
|  Dual-Adapter Architecture (SQLite 3 / Cloud SQL for PostgreSQL)              |
|  Firebase Data Connect / SQL Connect Declarative Schema (18 Tables)            |
|  - User Identity Registry (Firebase UID, Status, Authoritative Roles)         |
|  - Stations Catalog (116 Nodes) | Route Segments & Topography                |
|  - Vehicle Fleet Master (GVW, Payload, Class) | Active Journeys               |
|  - ROP Recon Reports | Threat Advisories | Immutable Audit Logs               |
+-------------------------------------------------------------------------------+
```

Full architecture specifications, data flow diagrams, and sequence models are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 5. Key Innovations & Proprietary Algorithms

### 5.1 Modified Dijkstra Multi-Factor Corridor Routing
Instead of traditional minimum-distance routing, VAYU ORBIT computes optimal convoy transit paths by minimizing an operational cost function $C(e)$ across network edge $e$:
$$C(e) = L(e) \times \left(1 + w_{\text{grad}} \cdot G(e) + w_{\text{surf}} \cdot S(e) + w_{\text{threat}} \cdot T(e) + w_{\text{weather}} \cdot W(e)\right)$$
Where:
- $L(e)$ is physical corridor length in kilometers.
- $G(e)$ is gradient coefficient derived from terrain elevation profiles.
- $S(e)$ is road surface friction penalty (Highway, Primary, Unpaved, Alpine Track).
- $T(e)$ is real-time tactical threat level ($0.0$ to $1.0$) injected via SITREP or command override.
- $W(e)$ is weather severity index (Clear, Rain, Snow, Severe Fog).
- Weights $w$ adapt according to convoy vehicle class and gross vehicle weight.

### 5.2 VORAM (Vayu Orbit Risk Assessment Model)
VORAM scores operational mission risk on a calibrated scale of $0$ to $100$ and stratifies corridors into four tactical risk tiers:
- **LOW (< 30):** Routine logistics movement authorized under standard escort.
- **MODERATE (30–59):** Enhanced scout detachment required; secondary communications active.
- **HIGH (60–79):** Armed escort mandatory; ROP recon verification required prior to dispatch.
- **CRITICAL (>= 80):** Movement suspended or diverted unless cleared by Brigade Command override.

### 5.3 Deterministic Fuel Safety Margin Formulation
Fuel burn accounts for gross vehicle weight, payload tons, gradient crawl factors, and idling contingencies:
$$\text{Fuel}_{\text{req}} = \text{BaseRate} \times \text{Distance} \times (1 + k_{\text{gradient}} + k_{\text{payload}} + k_{\text{weather}}) \times (1 + \text{SafetyMargin}_{\text{reserve}})$$
The system enforces a mandatory $20\%$ minimum reserve margin for plain corridors and $35\%$ for high-altitude mountainous sectors.

### 5.4 Road Opening Party (ROP) Dynamic Integration
Forward ROP scout detachments submit physical road status (Clear, Congested, Damaged, Ambush Threat, IED Suspected). When a critical hazard is confirmed on an active corridor, VAYU ORBIT dynamically flags the journey, restricts clearance, and computes bypass routes.

---

## 6. Technology Stack

| Layer | Component | Version | Purpose / Rationale |
|---|---|---|---|
| **Frontend Framework** | React | 18.2.0 | Reactive component architecture, operational state management |
| **Build Tool** | Vite | 5.1.0+ | Fast hot module replacement and production bundling (< 1s build) |
| **Styling & Theme** | Tailwind CSS | 3.4.1 | Custom Haulix industrial color tokens, high-contrast dark/light modes |
| **Icons** | Lucide React | 0.344.0 | Crisp, restrained tactical iconography |
| **Mapping Engine** | TomTom Web SDK | 6.x | High-resolution satellite/road tiles with automatic vector fallback |
| **Authentication (Client)** | Firebase Web SDK | 10.8.0+ | Client auth state, session persistence, password recovery |
| **Edge Attestation** | Firebase App Check | 10.8.0+ | reCAPTCHA v3 client device verification |
| **Backend Framework** | FastAPI | 0.109.0+ | High-throughput asynchronous REST API, OpenAPI auto-documentation |
| **Auth Verification** | Firebase Admin SDK | 6.5.0+ | RS256 token validation & Google Identity Platform integration |
| **Data Validation** | Pydantic | 2.6.0+ | Strict type enforcement for manifests, coordinates, and requests |
| **Database (Embedded)** | SQLite 3 | Embedded | Zero-dependency, portable, relational ACID data engine |
| **Database (Managed)** | Cloud SQL for PostgreSQL | 15+ | Enterprise relational storage with JSONB & sequence identity |
| **Data Connector** | Firebase SQL Connect | v1beta | Managed GraphQL SDL schema & Cloud SQL bridge |
| **Database Driver** | Psycopg 3 | 3.1.0+ | Non-blocking, connection-pooled PostgreSQL driver |
| **Test Suite** | Pytest & Asyncio | 8.0.0+ | Automated regression testing (unit, route calculation, API) |

---

## 7. Prerequisites & System Requirements

### Hardware Requirements
- **Processor:** Dual-core 2.0 GHz or higher (x86_64 or ARM64)
- **RAM:** Minimum 4 GB (8 GB recommended for simultaneous dev servers)
- **Storage:** 500 MB free disk space for release files and SQLite databases
- **Display:** Recommended minimum resolution 1280 × 800 (Fully responsive from 390px mobile to 4K desktop)

### Software Prerequisites
- **Python:** 3.11.0 or higher (Must be added to system `PATH`)
- **Node.js:** v18.0.0 LTS or v20.0.0 LTS (with `npm` v9+)
- **Operating System:** Windows 10/11, Ubuntu 22.04+ LTS, macOS Monterey 12+

---

## 8. Quick Start Guide

### 8.1 Instant Windows Launch (One-Click Launchers)
For Windows demonstration and evaluation, three automated batch scripts are provided in the release root:

1. **Start System:**
   ```bat
   START_VAYU_ORBIT_DEMO.bat
   ```
   *Launches backend on port 8000, launches frontend on port 5173, and launches default browser.*

2. **Seed Demonstration Scenarios:**
   ```bat
   SEED_DEMO_SCENARIOS.bat
   ```
   *Populates active journeys, pre-configured ROP reports, and realistic tactical SITREPs.*

3. **Reset Database to Pristine Baseline:**
   ```bat
   RESET_VAYU_ORBIT_DEMO.bat
   ```
   *Restores the cryptographic pristine baseline SQLite database.*

---

### 8.2 Cross-Platform Manual Startup

#### Step 1: Install Python Dependencies
```bash
cd backend
pip install -r ../requirements.txt
```

#### Step 2: Initialize Database
```bash
python prepare_demo_db.py
```

#### Step 3: Launch Backend Server
```bash
python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```
*Backend runs at `http://localhost:8000`. Interactive OpenAPI documentation available at `http://localhost:8000/docs`.*

#### Step 4: Install & Launch Frontend
In a separate terminal:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
*Frontend runs at `http://localhost:5173`.*

---

## 9. Configuration & Environment Variables

### Frontend Configuration (`frontend/.env`)
Copy `.env.example` or configure `frontend/.env`:
```env
# Target Backend API URL
VITE_API_BASE=http://localhost:8000

# Firebase Web App Config (vayuorbit-b20b5)
VITE_FIREBASE_API_KEY=AIzaSyPlaceholderClientKeyForAcademicEvaluation
VITE_FIREBASE_AUTH_DOMAIN=vayuorbit-b20b5.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=vayuorbit-b20b5
VITE_FIREBASE_STORAGE_BUCKET=vayuorbit-b20b5.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=914779488934
VITE_FIREBASE_APP_ID=1:914779488934:web:d5affde7412aa559a5aa67

# TomTom Map SDK API Key (Optional — fallback engages offline vector canvas)
VITE_TOMTOM_API_KEY=YOUR_TOMTOM_API_KEY_HERE
```

### Backend Configuration
The backend requires zero mandatory environment variables to run locally. Configuration defaults are loaded from `backend/config.py`:
- `CMS_DB_PATH`: `military_logistics.db`
- `FIREBASE_PROJECT_ID`: `vayuorbit-b20b5`
- `FIREBASE_APP_CHECK_MODE`: `disabled` (in development; zero external network requests)
- `VAYU_ALLOW_LEGACY_JWT`: `false` (enforces Firebase Auth ID tokens)
- `CORS_ORIGINS`: Permissive local development ports (`5173`, `3000`, `8000`)

---

## 10. Demonstration & Evaluation Walkthrough

### 10.1 Academic Role Accounts & Sovereign RBAC
VAYU ORBIT utilizes Firebase Authentication for edge identity verification while enforcing deterministic Role-Based Access Control (RBAC) via its sovereign local SQLite database:

| Role | Email | Sovereign Local Role | Access Privileges |
|---|---|---|---|
| **Convoy Coordinator** | `coordinator@vayu.local` | `COORDINATOR` | Full journey planning, dispatch, ROP entry, fleet ops, fuel override, user governance |
| **Mission Creator** | `creator@vayu.local` | `CREATOR` | Convoy manifest compilation, route assessment, journey drafting |
| **Checkpoint Operator** | `checkpoint@vayu.local` | `CHECKPOINT_OPERATOR` | Checkpoint arrival check-ins, transit timestamping, telemetry logging |
| **System Administrator** | `admin@vayu.local` | `ADMIN` | Account status governance, role adjustment, immutable audit log inspection |

*Note: Passwords are non-functional placeholders in documentation. Actual credentials are set by the system administrator during account provisioning or via the "Forgot password?" self-service recovery flow.*

### 10.2 Recommended Operational Workflow
1. **Login:** Authenticate at `/login` using `coordinator@vayu.local` and your assigned password.
2. **Operational Overview:** Review the live corridor status, active convoys, weather warnings, and readiness scoreboards.
3. **Route Assessment (`/route-assessment`):** Select an origin (e.g., `Ambala Air Force Station`) and destination (e.g., `Leh Military Station`). Configure convoy speed (40 km/h) and gross vehicle tonnage (12 T). Compare Primary vs. Alternate routes and analyze the VORAM risk breakdown.
4. **Journey Planning (`/journey-planning`):** Build a multi-vehicle convoy manifest. Add freight and passenger vehicles. Inspect real-time payload warnings (e.g., cargo assignment prohibited on passenger-only vehicles like Tata Safari GS800).
5. **Journey Operations (`/journey-operations`):** Click on scheduled journeys to open the detailed Operations Cockpit. Review turn-by-turn guidance and checkpoint arrival windows.
6. **Road Opening Party (ROP) Report:** In the Journey Cockpit, click **Submit ROP Report** to file a reconnaissance clearance. Observe real-time readiness status change to **CLEARED FOR DEPARTURE**.
7. **Intelligence SITREP Parsing:** Input a mock SITREP text (e.g., `"Unconfirmed roadblock reported 15km north of Srinagar on NH1D due to landslide"`). Observe automated waypoint risk tagging and route recalculation.

---

## 11. Data Dictionary & Synthetic Datasets

All locations, vehicles, routes, and intelligence items in VAYU ORBIT are strictly **synthetic** and designed exclusively for academic evaluation.

- **116 Military Bases & Logistics Nodes:** Geographically realistic coordinates covering Northern, Western, and Central corridors across India, categorized by station type:
  - Transit Camps (`TC`)
  - Supply Depots (`SD`)
  - Ordnance Depots (`OD`)
  - Forward Operating Bases (`FOB`)
  - Military Hospitals (`MH`)
- **5 Realistic Military Vehicle Classes:**
  1. **Tata Safari Storme GS800:** Passenger / Scout reconnaissance vehicle (Tare: 2.4 T, Payload: 0.0 T Cargo, 6 Pax max).
  2. **Ashok Leyland Stallion 4×4:** Standard general-purpose troop and cargo logistics carrier (Tare: 5.6 T, Payload: 5.0 T, GVW: 10.6 T).
  3. **Ashok Leyland Super Stallion 6×6:** Heavy cargo and artillery tractor (Tare: 9.8 T, Payload: 10.0 T, GVW: 19.8 T).
  4. **Tata LPTA 715 4×4:** Medium light transport (Tare: 4.25 T, Payload: 3.0 T, GVW: 7.25 T).
  5. **Scania R580 8×8 HET:** Heavy equipment / armor transporter (Tare: 18.0 T, Payload: 40.0 T, GVW: 58.0 T).

Detailed database schema definitions and field semantics are available in [docs/DATA_AND_LIMITATIONS.md](docs/DATA_AND_LIMITATIONS.md).

---

## 12. Security, Authentication & Role-Based Access Control (RBAC)

1. **Authentication:** HMAC SHA-256 JWT tokens with 24-hour expiration issued upon verified database authentication.
2. **Access Control:** Fine-grained endpoint guards restrict administrative, dispatch, and override actions based on authenticated user roles.
3. **Audit Trail:** Critical operations (journey scheduling, ROP clearance, overrides) write immutable timestamps and user identifiers to the database audit log.
4. **Cryptographic Baseline Guard:** `prepare_demo_db.py` enforces SHA-256 checksum validation to prevent unauthorized runtime database tampering or corrupted schema migrations.

---

## 13. API Reference Summary

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate user & issue JWT bearer token | No |
| `GET` | `/api/auth/me` | Retrieve authenticated user profile & permissions | Yes |
| `GET` | `/api/places` | Fetch 116 synthetic logistics stations & coordinates | Yes |
| `GET` | `/api/nodes` | Fetch routing node topology & segment attributes | Yes |
| `POST` | `/api/route` | Compute multi-factor weighted route & VORAM score | Yes |
| `GET` | `/api/vehicles` | Retrieve vehicle master catalog and availability | Yes |
| `GET` | `/api/journeys` | List all active, scheduled, and completed journeys | Yes |
| `POST` | `/api/journeys` | Create new journey with strict manifest validation | Yes |
| `GET` | `/api/journeys/{id}` | Retrieve comprehensive journey details & telemetry | Yes |
| `POST` | `/api/rop-reports/{id}` | Submit Road Opening Party recon report | Yes |
| `POST` | `/api/intelligence/sitrep` | Parse unstructured military SITREP text | Yes |

Complete request and response payload schemas are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and live at `/docs`.

---

## 14. Verification & Test Suite Results

The academic release codebase has undergone rigorous automated and forensic validation:

- **Pytest Suite:** **60 / 60 tests passing (100%)**
  - Schema initialization & database integrity: 14 tests
  - Route calculation & multi-factor Dijkstra: 18 tests
  - Manifest validation & payload semantics: 12 tests
  - Auth, RBAC & API endpoint contracts: 16 tests
- **Frontend Build:** **Vite v5.4.14 production build succeeds in < 800ms** with zero errors or unhandled warnings.
- **Hash Parity Audit:** 100% of runtime source files match original canonical development hashes.

For detailed test logs, test execution instructions, and test coverage matrices, refer to [docs/TESTING.md](docs/TESTING.md).

---

## 15. System Boundaries & Academic Disclaimer

> [!IMPORTANT]
> **ACADEMIC EVALUATION DISCLAIMER:**
> VAYU ORBIT is strictly an academic research and software engineering evaluation prototype developed for educational assessment under Problem Statement **PDS-3**.
> 
> - It is **NOT** an operational Command and Control (C2) system.
> - It contains **NO** classified, sensitive, or real-world military logistics data.
> - All military station names, coordinates, vehicle identifiers, and convoy schedules are purely **synthetic approximations**.
> - It does **NOT** interface with live military GPS feeds, transponders, or real-time tactical communications networks.
> - It must **NOT** be deployed for real-world navigation, life-critical missions, or operational tactical logistics.

---

## 16. Project Structure & Directory Tree

```
VAYU_ORBIT_ACADEMIC_RELEASE/
|-- backend/
|   |-- api.py                     # Primary FastAPI application & route endpoints
|   |-- config.py                  # Environment & runtime configuration
|   |-- database.py                # Database connection & session management
|   |-- models.py                  # SQLAlchemy ORM models & entity schemas
|   |-- schemas.py                 # Pydantic v2 request & response schemas
|   |-- router.py                  # Core Dijkstra multi-factor routing engine
|   |-- voram.py                   # VORAM multi-criteria risk model
|   |-- fuel.py                    # Fuel consumption & safety margin calculator
|   |-- manifest.py                # Convoy vehicle manifest validation logic
|   |-- sitrep_parser.py           # NLP intelligence SITREP parsing engine
|   |-- prepare_demo_db.py         # Baseline DB integrity & seed management
|   |-- military_logistics.db      # Active working SQLite database
|   |-- military_logistics_demo.db # Pristine baseline backup SQLite database
|   `-- tests/                     # Automated pytest regression suite (60 tests)
|-- frontend/
|   |-- index.html                 # Single page application entry HTML
|   |-- package.json               # Node.js dependencies & build scripts
|   |-- vite.config.js             # Vite bundler configuration & proxy settings
|   |-- tailwind.config.js         # Tailwind configuration & Haulix palette tokens
|   |-- .env.example               # Safe environment variable template
|   |-- public/                    # Static assets & vehicle showcase artwork
|   `-- src/
|       |-- App.jsx                # Root React component & routing table
|       |-- main.jsx               # React DOM mounting entry point
|       |-- components/            # Reusable UI components (Sidebar, Topbar, etc.)
|       |-- pages/                 # Operational views (Overview, Planning, Ops, etc.)
|       `-- services/              # API clients & state machines
|-- .env.example                   # Unified environment configuration template
|-- dataconnect/                   # Firebase Data Connect / SQL Connect configuration
|   |-- dataconnect.yaml           # Service specification & Cloud SQL binding
|   |-- schema/schema.gql          # Relational GraphQL SDL schema (18 tables)
|   `-- connector/                 # Connector definitions, queries & mutations
|-- docs/                          # Comprehensive technical documentation suite
|   |-- ARCHITECTURE.md            # Detailed system design & sequence diagrams
|   |-- POSTGRESQL_ARCHITECTURE.md # Cloud SQL PostgreSQL 15+ target architecture
|   |-- FIREBASE_SQL_CONNECT.md    # Firebase Data Connect / SQL Connect specification
|   |-- SQLITE_TO_POSTGRESQL_MIGRATION.md # Repeatable migration engine manual
|   |-- DATABASE_MIGRATION_INVENTORY.md # Discovered 18-table SQLite schema audit
|   |-- DATABASE_BACKUP_AND_ROLLBACK.md # Forensic backup manifest & rollback SOP
|   |-- DATABASE_SECURITY.md       # PostgreSQL threat model, mTLS & least-privilege
|   |-- DATABASE_MIGRATION_TEST_REPORT.md # Migration & regression test report
|   |-- FIREBASE_AUTHENTICATION.md # Firebase Auth & FastAPI Admin SDK technical spec
|   |-- ACCOUNT_MIGRATION.md       # Account migration inventory & JIT linking guide
|   |-- FIREBASE_DEPLOYMENT.md     # Firebase Hosting & Cloud Run deployment manual
|   |-- FIREBASE_SECURITY.md       # Firebase Security & App Check threat model
|   |-- INSTALLATION.md            # Cross-platform installation & setup manual
|   |-- TESTING.md                 # Test suite execution & verification report
|   |-- DATA_AND_LIMITATIONS.md    # Data dictionaries, schemas & simulation limits
|   |-- RELEASE_NOTES.md           # Version 6.0.0 release log & changelog
|   `-- VAYU_ORBIT_Target_System_Specification_v1.1.pdf # Formal design spec PDF
|-- AUTHORIZATION.md               # Rights attribution & GitHub release policies
|-- LICENSE                        # Academic research evaluation license
|-- PRD.md                         # Product Requirements Document (PDS-3)
|-- PROJECT_LINKS.txt              # Canonical links, repos & contact references
|-- requirements.txt               # Pinned Python package dependencies
|-- START_VAYU_ORBIT_DEMO.bat      # One-click Windows startup script
|-- SEED_DEMO_SCENARIOS.bat        # Windows demonstration scenario seeder
`-- RESET_VAYU_ORBIT_DEMO.bat      # Windows database reset utility
```

---

## 17. Known Limitations & Future Work

1. **Synthetic Elevation Gradients:** Elevation profiles are derived from pre-compiled segment lookup tables. Future iterations will integrate open-access Digital Elevation Models (DEM / SRTM 30m).
2. **Offline Vector Tiles:** When TomTom API connectivity is unavailable, the fallback map renders schematic vector coordinates. An integrated offline Mapbox vector tile server (MBTiles) is planned for Phase 2.
3. **Dynamic Re-routing in Transit:** ROP reports currently require manual refresh or Cockpit reload to apply suggested diversions; real-time WebSocket push updates will be introduced in the next major build.

---

## 18. Related Documentation Links

- [GitHub Pre-Publication Security, Privacy & Legal Audit](docs/GITHUB_PRE_PUBLICATION_SECURITY_AUDIT.md)
- [System Architecture Specification](docs/ARCHITECTURE.md)
- [PostgreSQL Database Architecture Specification](docs/POSTGRESQL_ARCHITECTURE.md)
- [PostgreSQL Migration Stage 2 Verification Report](docs/POSTGRESQL_MIGRATION_STAGE_2_VERIFICATION_REPORT.md)
- [PostgreSQL & Firebase SQL Connect Implementation Report](docs/POSTGRESQL_MIGRATION_IMPLEMENTATION_REPORT.md)
- [Firebase SQL Connect / Data Connect Manual](docs/FIREBASE_SQL_CONNECT.md)
- [SQLite to PostgreSQL Migration Engine Guide](docs/SQLITE_TO_POSTGRESQL_MIGRATION.md)
- [Database Backup Manifest & Rollback Protocol](docs/DATABASE_BACKUP_AND_ROLLBACK.md)
- [Database Security Architecture & Threat Model](docs/DATABASE_SECURITY.md)
- [Database Migration & Regression Test Report](docs/DATABASE_MIGRATION_TEST_REPORT.md)
- [Forensic Database Migration Inventory](docs/DATABASE_MIGRATION_INVENTORY.md)
- [Firebase Authentication Specification (Web SDK + Admin SDK)](docs/FIREBASE_AUTHENTICATION.md)
- [Account Migration Inventory & JIT Linking Guide](docs/ACCOUNT_MIGRATION.md)
- [Firebase Security Architecture & App Check Threat Model](docs/FIREBASE_SECURITY.md)
- [Firebase Hosting & Cloud Run Deployment Guide](docs/FIREBASE_DEPLOYMENT.md)
- [Firebase Authentication Migration Proposal & Decision](docs/FIREBASE_AUTHENTICATION_MIGRATION_PROPOSAL.md)
- [Public Deployment Authorization Request](docs/PUBLIC_DEPLOYMENT_PERMISSION_REQUEST.md)
- [Complete Installation Guide](docs/INSTALLATION.md)
- [Cloud Deployment Guide](docs/DEPLOYMENT.md)
- [Security Policy & Safeguards](SECURITY.md)
- [Authorized Use Policy](AUTHORIZED_USE.md)
- [Test Suite & Quality Audit](docs/TESTING.md)
- [Data Dictionary & Limitations](docs/DATA_AND_LIMITATIONS.md)
- [Release Notes & Version Log](docs/RELEASE_NOTES.md)
- [Product Requirements Document (PRD)](PRD.md)
- [Authorization & Rights Ownership](AUTHORIZATION.md)

---

## 19. License & Intellectual Property

This software and its documentation are distributed under the **VAYU ORBIT Academic Research Evaluation License**. 
See [LICENSE](LICENSE) for full details. 

**Summary of Terms:**
- **Permitted:** Academic evaluation, research examination, viva-voce demonstration, and educational review by authorized university faculty and examiners.
- **Restricted:** Commercial exploitation, unauthorized public distribution, military deployment, or re-licensing without the explicit written authorization of the copyright holders.
- **Publication Policy:** Public release on external source registries (such as GitHub) is subject to rights-holder clearance as documented in [AUTHORIZATION.md](AUTHORIZATION.md).

---

## 20. Citation & Academic Reference

If referencing or evaluating this system in academic research, please cite as follows:

```bibtex
@misc{mishra2026vayuorbit,
  author       = {Mishra, Rudra Narayan and Singh, Suryansh Kumar},
  title        = {VAYU ORBIT: Autonomous Military Convoy Logistics Planning and Risk Assessment Decision-Support System},
  year         = {2026},
  howpublished = {Capstone Engineering Project, Lovely Professional University},
  note         = {Problem Statement PDS-3, Supervised by Er. Hitesh Kumar},
  address      = {Phagwara, Punjab, India}
}
```

```text
Mishra, R. N., & Singh, S. K. (2026). VAYU ORBIT: Autonomous Military Convoy Logistics Planning
and Risk Assessment Decision-Support System (Academic Evaluation Prototype v6.0.0).
Supervised by Er. Hitesh Kumar. School of Computer Science and Engineering,
Lovely Professional University, Punjab, India.
```

---
*VAYU ORBIT Academic Release Package | Verified & Certified for Evaluation | November 2026*
