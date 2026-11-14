# PRODUCT REQUIREMENTS DOCUMENT (PRD)

**System Name:** VAYU ORBIT — Intelligent Convoy Movement Planning & Dynamic Route Optimisation System  
**Academic Release:** Version 6.0.0 (Academic Release Candidate)  
**Problem Statement ID:** PDS-3  
**Institution:** Lovely Professional University, Punjab, India  
**Academic Session:** 2026–2027  
**Lead Author:** Rudra Narayan Mishra (Reg No: 12515636)  
**Co-Author:** Suryansh Kumar Singh (Reg No: 12516274)  
**Supervisor:** Hitesh Kumar  

---

## 1. PRODUCT OVERVIEW

**VAYU ORBIT** is an academic military-logistics decision-support prototype engineered to streamline the planning, constraint validation, real-time rerouting, and operational auditing of military convoy movements across complex geographical transit networks. 

By modeling a multi-tiered road network spanning **116 military installations** (Cantonments, Military Stations, Air Force Stations, Naval Bases, and Forward Outposts), VAYU ORBIT bridges the gap between static spreadsheet planning and dynamic operational execution. It incorporates constraint-weighted graph algorithms, dynamic SITREP natural-language disruption parsing, empirical forward reconnaissance scoring (VORAM heuristic), and deterministic fuel safety gates.

---

## 2. PROBLEM STATEMENT (PDS-3)

Military convoy operations require continuous coordination across competing physical, operational, and environmental constraints:
1. **Physical & Infrastructure Bottlenecks:** Heavy armour transporters (e.g. T-90 Bhishma on BEML HET) face bridge load restrictions and vertical clearance limits that lighter vehicles can bypass.
2. **Volatile Operational Conditions:** Monsoonal flash flooding, landslides, civil blockades, and hostile intelligence events necessitate rapid, verifiable corridor recalculations without stranding units.
3. **Logistics & Fuel Feasibility:** Dispatching convoys without verified intermediate depot refuelling or safety reserves risks vehicle abandonment on strategic highways.
4. **Information Fragmentation:** Field reconnaissance reports from Road Opening Parties (ROPs) are frequently disconnected from the commander's route planning and risk assessment workflows.

PDS-3 calls for a centralized, constraint-aware decision-support platform that synthesizes these factors into an intuitive, high-reliability operational tool.

---

## 3. PRODUCT OBJECTIVES

### 3.1 Academic Objectives
- Demonstrate the application of deterministic graph-theory algorithms (`NetworkX` Dijkstra shortest path) to multi-modal logistics constraints.
- Implement an empirical, non-black-box risk assessment framework (VORAM) combining forward reconnaissance field evidence with routing topology.
- Maintain high software engineering standards, modular separation of concerns, and full automated test coverage (60/60 passing tests).

### 3.2 Technical Objectives
- Build a responsive, restrained, professional industrial user interface adhering to the approved **Haulix-inspired** aesthetic (charcoal, olive, and tactical lime/amber palette).
- Provide robust local offline execution using SQLite in WAL mode with complete transactional consistency.
- Enforce strict role-based access control (RBAC) across five distinct military logistics personas.

---

## 4. STAKEHOLDERS & USER ROLES

The application implements five distinct operational roles with hierarchical permission decorators (`backend/auth.py`):

| Role ID | Role Title | Functional Scope & Permissions |
|---------|------------|--------------------------------|
| `COORDINATOR` | Movement Control Officer | Full operational authority: create journeys, commit staged plans, re-route convoys, verify ROP reconnaissance reports, override fuel/readiness gates, and sign off debriefs. (Example: `coordinator@vayu.local` / Col Sharma) |
| `COMMANDER` | Formation Commander | Tactical oversight: inspect operational dashboards, evaluate corridor risk scores, review audit logs, and inspect debrief summaries. Read-only on operational commitments. (Example: `commander@vayu.local` / Brig Singh) |
| `CONVOY_LEAD` | Convoy Commander | Tactical field transit: advance checkpoints, log transit timestamps, record road events/incidents, submit field SITREPs, and access turn-by-turn navigation. (Example: `convoy_lead@vayu.local` / Maj Verma) |
| `OPERATOR` | Checkpoint / Depot Operator | Transit verification: record convoy check-in/check-out events at intermediate military checkpoints and log local fuel availability. (Example: `operator@vayu.local` / Subedar Yadav) |
| `ADMIN` | System Administrator | Platform maintenance: manage user credentials, inspect system health telemetry, export diagnostic databases, and configure API integrations. (Example: `admin@vayu.local` / IT Admin) |

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Journey Planning Workflow (Implemented)
- **5-Step Wizard Interface:** Sequential flow traversing (1) Endpoint Selection, (2) Convoy Assembly, (3) Route Assessment, (4) Journey Preview, and (5) Operational Commitment.
- **Node Catalog:** Comprehensive Pan-India database of 116 military installations with coordinates, state jurisdiction, command assignment, and strategic highway references.
- **Origin/Destination Safeguard:** Rejects planning requests where origin and destination are identical.

### 5.2 Fleet & Manifest Management (Implemented)
- **Vehicle Master Database:** Catalog of standard Indian Armed Forces transport, combat, and recovery vehicles (Tata Safari GS800, Ashok Leyland Stallion 4x4, Tata 713/1623, BEML HET, T-90 Bhishma, BMP-2, etc.).
- **Authoritative Mass Semantics:**
  - `gvw_tons`: Represents unladen tare weight of the vehicle chassis.
  - `payload`: Freight cargo weight in metric tons.
  - `gross_weight`: Dynamically computed as `gvw_tons + payload`.
  - Strict payload validation: Restricts freight cargo on passenger-only vehicles (e.g. Tata Safari GS800).
  - Physical Unit Serial Allocation: Tracks unique military registration serials (e.g. `BA-482910W`).

### 5.3 Constraint-Aware Route Assessment (Implemented)
- **Multi-Route Evaluation:** Calculates primary fastest highway route, balanced logistics corridor, and tactical detour alternatives.
- **Dynamic Graph Engine:** Utilizes NetworkX Dijkstra algorithm with dynamic edge weights factoring distance, road quality, and infrastructure limits.
- **TomTom Road Network Integration:** Fetches high-fidelity turn-by-turn road geometry and manoeuvre instructions when configured with an active API key; seamlessly falls back to linear military corridor milestones when offline.

### 5.4 Dynamic Disruption Handling & SITREP Parsing (Implemented)
- **Natural-Language SITREP Parsing:** Scans military situation reports for keywords (e.g., "bridge collapse", "waterlogging", "NH-19 closed", "landslide") and maps disruptions to network nodes and edges.
- **Dynamic Rerouting Engine:** Severed or disrupted edges are penalized or excised from the routing graph, generating an immediate alternative corridor.

### 5.5 Fuel Feasibility Gate (Implemented)
- **Safety Equation:** Mandates that limiting usable vehicle range must satisfy `Usable Range >= Route Distance * 1.10` (10% emergency fuel reserve).
- **Depot Detour Detection:** Identifies the nearest intermediate military refuelling depot along the transit corridor and calculates detour distances.
- **Departure Gate Enforcement:** Blocks operational journey commitment if fuel requirements are violated unless an authorized coordinator records an explicit dispatch override.

### 5.6 Road Opening Party (ROP) Recon Telemetry & VORAM Model (Implemented)
- **10 VORAM Parameters:** Evaluates Road Condition, Bridge Load Compatibility, Road Closure/Access, Flooding/Waterlogging, Weather Impact, Terrain Gradient, Road Width/Clearance, Traffic Congestion, Communication Coverage, and Security Vulnerability.
- **Progress Tracking:** Header completion meter displaying documented parameter counts (`X of 10 Parameters Documented`).
- **Sequential Navigation & Compact Presets:** Allows linear parameter progression (`← Prev` / `Next →`) and rapid empirical finding autofill via compact preset pill chips.
- **Pre-Submission Review Summary:** Dedicated summary table providing a unified pre-flight audit of all 10 parameters before coordinator verification.
- **Dynamic VORAM Recalculation:** Updates the journey's operational risk score dynamically upon verification of forward reconnaissance evidence.

### 5.7 Checkpoint Operations & Journey Lifecycle (Implemented)
- **Lifecycle States:** `DRAFT` → `SCHEDULED` → `ACTIVE` → `COMPLETED` / `CANCELLED` / `DISRUPTED`.
- **Chronological Event Ledger:** Records timestamped check-in, check-out, incident, and fuel events in SQLite `journey_events` table.
- **Post-Mission Debrief Generator:** Compiles operational timeline, distance covered, incident log, and VORAM score into printable debrief summaries and downloadable PDF reports.

---

## 6. NON-FUNCTIONAL REQUIREMENTS

- **Usability & Aesthetic:** Industrial Haulix-inspired dark charcoal/olive/lime visual system, complemented by a crisp, high-contrast light mode with WCAG AA compliance across text elements.
- **Reliability:** SQLite Write-Ahead Logging (WAL) mode with busy timeout handling, preventing database locking under concurrent read/write loads.
- **Security:** HTTP-only JWT session cookies, password hashing with PBKDF2-HMAC-SHA256, and parameter ownership isolation (SEC-01).
- **Offline Self-Containment:** Capable of running completely offline without cloud dependencies, using pre-packaged SVG vehicle artwork and tactical linear corridor geometry.

---

## 7. SYSTEM ARCHITECTURE

```text
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND CLIENT                        │
│          React 19 · Vite 8 · Leaflet · TomTom Maps          │
│       Haulix Visual System · Inter & Share Tech Mono        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON REST APIs
                               │ (Cookie Auth / CORS Bound)
┌──────────────────────────────▼──────────────────────────────┐
│                    BACKEND FASTAPI ENGINE                   │
│      Python 3.13.6 · Pydantic v2 · Role Decorator RBAC      │
├──────────────────────────────┬──────────────────────────────┤
│  Routing & Constraints       │  Intelligence & Risk Models  │
│  - NetworkX Dijkstra         │  - VORAM Heuristic Engine    │
│  - Fuel Gate Verifier        │  - SITREP NLP Regex Parser   │
│  - Bridge Load Assessor      │  - ROP Verification Service  │
└──────────────────────────────┬──────────────────────────────┘
                               │ SQLite Transactions (WAL Mode)
┌──────────────────────────────▼──────────────────────────────┐
│                     LOCAL SQLITE DATABASE                   │
│    116 Military Stations · 38 Vehicle Types · Audit Logs    │
│     Auxiliary Tables: ROP Reports, Sensitivity, Overrides   │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. ALGORITHMS & DECISION-SUPPORT LOGIC

1. **NetworkX Dijkstra Shortest Path:**
   - Graph $G = (V, E)$ where nodes $V$ represent military installations and edges $E$ represent national/strategic highways.
   - Cost function $C(e) = \text{Distance}(e) \times \text{RoadFactor} \times \text{DisruptionPenalty}$.
2. **VORAM Heuristic Scoring:**
   - Heuristic risk formulation combining 10 weighted parameters ($\sum w_i = 100\%$).
   - Computes weighted risk: $\text{Score} = \sum_{i=1}^{10} w_i \times \text{Rating}_i$.
   - **Important Note:** VORAM is a transparent mathematical heuristic model designed for operational clarity, not an opaque black-box deep neural network.
3. **Fuel Feasibility Determination:**
   - $\text{RequiredFuelRange} = \text{RouteDistance} \times 1.10$.
   - $\text{Feasible} = \min_{v \in \text{Convoy}}(\text{UsableRange}_v) \ge \text{RequiredFuelRange}$.

---

## 9. ACCEPTANCE CRITERIA MATRIX

| ID | Capability | Acceptance Standard | Status |
|----|------------|---------------------|--------|
| AC-01 | Station Catalog | All 116 military stations load with valid GPS coordinates. | PASS |
| AC-02 | Role Authorization | Unauthenticated API calls return 401; unauthorized roles return 403. | PASS |
| AC-03 | Route Assessment | Multi-modal routes evaluated; distance and waypoints returned. | PASS |
| AC-04 | Fuel Gate | Rejects commitments where convoy usable range < distance + 10%. | PASS |
| AC-05 | SITREP Rerouting | Identifies highway disruptions from SITREP and calculates alternative path. | PASS |
| AC-06 | ROP Workflow | ROP report submission, coordinator review, and VORAM recalculation succeed. | PASS |
| AC-07 | Theme Consistency | Dark mode retains approved Haulix style; light mode provides >10:1 contrast. | PASS |
| AC-08 | Automated Tests | Backend pytest suite passes 60/60 tests with 0 failures. | PASS |

---

## 10. SYSTEM LIMITATIONS & NON-CLAIMS

1. **Academic Decision-Support Prototype:** VAYU ORBIT is developed exclusively for academic evaluation at Lovely Professional University. It is **not** certified, approved, or deployed by the Ministry of Defence, Indian Armed Forces, or any government body.
2. **Synthetic Data:** Node coordinates, road constraints, and axle tolerances are synthetic or publicly derived approximations for simulation purposes.
3. **No Live Telemetry/GPS:** The system simulates checkpoint event logging. It does **not** interface with real-time military satellite constellations, live vehicle GPS transponders, or tactical combat radios.
4. **No Classified Material:** The system contains zero classified operational data or operational security (OPSEC) secrets.

---

## 11. FUTURE SCOPE & RESEARCH EXTENSIONS

- **Multi-Modal Transit Integration:** Expanding NetworkX graph topology to include military rail sidings (Roll-on/Roll-off railheads) and heavy-lift tactical airlift routes (C-17 / IL-76).
- **Offline Mesh Networking:** Integrating LoRaWAN / local packet radio mesh telemetry for peer-to-peer convoy communication in denied environments.
- **Dynamic Convoy Marshalling:** Automating vehicle spacing and marshalling orders based on chemical/ammunition hazardous cargo segregation rules.
