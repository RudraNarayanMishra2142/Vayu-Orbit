# VAYU ORBIT — System Architecture & Technical Specification
## Version 6.0.0 | Academic Release | Problem Statement PDS-3

---

## 1. System Overview & Design Principles

**VAYU ORBIT** is engineered as a decoupled, low-latency, and high-reliability decision-support architecture for military convoy logistics planning. The design adheres to five core system principles:

1. **Air-Gapped / Cold-Start Resilience:** Zero mandatory external cloud dependencies. If internet connectivity or third-party mapping APIs (e.g., TomTom) are severed, the entire application continues operating via local fallback engines and local vector cartography.
2. **Deterministic Computations:** Routing, fuel safety reserves, and VORAM risk indices produce repeatable, mathematically provable outputs for any given set of physical and tactical constraints.
3. **Strict Domain-Enforced Schemas:** All domain entities (vehicles, manifests, journeys, recon reports) are validated at API boundaries via Pydantic v2 schemas to eliminate invalid operational configurations.
4. **Low Cognitive Load UI/UX:** Built on the "Haulix" visual design philosophy—high-contrast muted dark/light surfaces, condensed data density, zero decorative animation overhead, and instant visual hierarchy for high-stress command environments.
5. **Role-Based Operational Segregation (RBAC):** Distinct functional tiers enforce separation between high-level operational commanders, convoy planners, and recon scout detachments.

---

## 2. Layered Architecture

```
+=============================================================================+
|                           PRESENTATION LAYER (SPA)                          |
|  React 18.2 | Vite 5 | Tailwind CSS | Lucide React | Context State          |
|  - Auth & Session Context (JWT Bearer state, role management)                |
|  - Theme Context (Dark / Light mode CSS variable token switching)           |
|  - Interactive TomTom SDK v6 Canvas / Offline Tactical Canvas               |
|  - Real-time Form Validation & Multi-Vehicle Manifest Builder                |
+======================================+======================================+
                                       | HTTPS / HTTP 1.1 REST
                                       | Bearer JWT Authorization
+======================================v======================================+
|                         APPLICATION & API SERVICE LAYER                      |
|  FastAPI Framework | Asynchronous Request Pipeline | Starlette CORS         |
|  +--------------------+---------------------+--------------------+          |
|  | Authentication &   | Corridor Routing &  | Manifest Validation|          |
|  | RBAC Middleware    | Multi-Factor Engine | & Fuel Safety      |          |
|  +--------------------+---------------------+--------------------+          |
|  | VORAM Risk Scoring | ROP Reconnaissance  | SITREP NLP Threat  |          |
|  | Engine v2          | State Machine       | Extraction Engine  |          |
|  +--------------------+---------------------+--------------------+          |
+======================================+======================================+
                                       | SQLite3 Connection Pool / Prepared SQL
+======================================v======================================+
|                              DATA PERSISTENCE TIER                           |
|  SQLite 3 ACID Relational Engine (military_logistics.db)                     |
|  - Stations Catalog (116 Military Bases, Transit Camps, Depots)              |
|  - Tactical Network Topology (Directed Edge Segments, Surface, Slopes)      |
|  - Vehicle Fleet Master (GVW, Tare, Cargo Limits, Passenger Caps)            |
|  - Operational Tables (Journeys, ROP Reports, Advisories, Overrides)         |
|  - SHA-256 Cryptographic Baseline Reference (military_logistics_demo.db)    |
+=============================================================================+
```

---

## 3. Subsystem Specifications

### 3.1 Routing & Corridor Optimization Engine (`router.py`)

The routing subsystem models military transit corridors as a directed, weighted graph $G = (V, E)$, where:
- $V$: Set of logistics nodes (Transit Camps, Ordnance Depots, Supply Depots, Forward Bases).
- $E$: Set of road corridors connecting adjacent logistics nodes.

#### Multi-Factor Cost Function
Instead of civilian shortest-distance routing, the cost $W(e)$ of edge $e = (u, v)$ is calculated as:
$$W(e) = \text{Distance}(e) \times \left(1 + C_{\text{gradient}}(e) + C_{\text{surface}}(e) + C_{\text{threat}}(e) + C_{\text{weather}}(e) + C_{\text{weight\_penalty}}(e)\right)$$

Where:
- **Gradient Cost ($C_{\text{gradient}}$):**
  $$C_{\text{gradient}} = \begin{cases} 
  0.0 & \text{if } \text{slope} \le 3\% \\
  0.15 \times \frac{\text{slope}}{3} & \text{if } 3\% < \text{slope} \le 8\% \\
  0.50 \times \frac{\text{slope}}{8} & \text{if } \text{slope} > 8\% 
  \end{cases}$$
- **Surface Cost ($C_{\text{surface}}$):**
  - Highway (High quality tarmac): $0.0$
  - Primary / Secondary paved: $0.15$
  - Unpaved / Gravel: $0.45$
  - Mountain dirt track / Pass: $1.00$
- **Tactical Threat Cost ($C_{\text{threat}}$):** Scaled dynamically from $0.0$ (benign) to $2.5$ (hostile ambush / active shelling zone) via intelligence SITREPs or ROP reports.
- **Axle / Bridge Load Filter:** Any edge $e$ whose bridge load classification $L_{\text{bridge}}(e) < \text{Convoy}_{\text{max\_gvw}}$ is assigned a weight of $\infty$ (pruned from graph traversal).

---

### 3.2 VORAM (Vayu Orbit Risk Assessment Model) Engine (`voram.py`)

VORAM quantifies operational mission risk into an aggregate scalar $R \in [0, 100]$ composed of four weighted sub-indices:
$$R = w_T \cdot R_{\text{threat}} + w_E \cdot R_{\text{elevation}} + w_W \cdot R_{\text{weather}} + w_V \cdot R_{\text{vulnerability}}$$

Default calibrated weights:
$$w_T = 0.40, \quad w_E = 0.25, \quad w_W = 0.20, \quad w_V = 0.15$$

#### Risk Tier Stratification
```
  0                     30                    60                    80               100
  +---------------------+---------------------+---------------------+----------------+
  |      LOW RISK       |    MODERATE RISK    |      HIGH RISK      | CRITICAL RISK  |
  | Standard Logistics  | Escort Recommended  | Armed Escort Mand.  | Passage Halted |
  | Routine Clearance   | Secondary Comms     | ROP Recon Mand.     | Command Auth.  |
  +---------------------+---------------------+---------------------+----------------+
```

---

### 3.3 Vehicle Semantics & Manifest Validation (`manifest.py`)

To resolve operational military ambiguities between Gross Vehicle Weight (GVW), Tare Weight, and Payload, VAYU ORBIT enforces explicit domain semantics:

$$\text{Total Operating Weight (Gross)} = \text{Tare Weight} + \text{Allocated Freight Payload} + \text{Passenger Mass} + \text{Fixed Equipment}$$

#### Classification Rules
1. **Freight vs. Passenger Segregation:**
   - Class `PASSENGER_ONLY` (e.g., Tata Safari Storme GS800): Permitted cargo payload is strictly $0.0\text{ tons}$. Freight payload $> 0$ triggers validation failure.
   - Class `CARGO_TRANSPORT` (e.g., Ashok Leyland Stallion 4×4): Permitted cargo payload $\le$ vehicle maximum rated capacity ($5.0\text{ tons}$).
2. **Gross Vehicle Weight Constraint:**
   $$\text{Current GVW} = \text{Tare} + \text{Payload} \le \text{Rated GVW}$$
3. **Bridge Envelopes:**
   If $\max(\text{Convoy GVW}) > \min(\text{Bridge Capacity})$ across any segment, the route is flagged as non-negotiable.

---

### 3.4 Fuel Safety Margin Formulation (`fuel.py`)

Military fuel logistics in mountainous sectors cannot rely on civilian highway estimates. The system applies a baseline consumption rate modified by environmental strain:

$$\text{Fuel}_{\text{liters}} = \sum_{e \in \text{Route}} \left[ \text{Length}(e) \times \text{BaseRate}_v \times \left(1 + \mu_{\text{grad}}(e) + \mu_{\text{surf}}(e) + \mu_{\text{crawl}}(e)\right) \right] \times (1 + \text{ReserveMargin})$$

- $\mu_{\text{grad}}$: Up to $+80\%$ penalty for mountain pass ascents.
- $\mu_{\text{crawl}}$: $+25\%$ penalty for convoy column speeds $< 25\text{ km/h}$ (constant low-gear engine torque).
- $\text{ReserveMargin}$: $20\%$ for plain sectors, $35\%$ for high-altitude passes (Zoji La, Khardung La, Chang La).

---

### 3.5 Road Opening Party (ROP) Reconnaissance Model

The ROP module coordinates forward clearance teams who physically patrol corridors before convoy dispatch:

```
  [ PLANNED ] ----> [ AWAITING ROP ] ----> [ ROP RECON REPORT FILED ]
                           |                               |
                           |                               +---> [ HAZARDS DETECTED ] ---> [ RE-ROUTING REQUIRED ]
                           |                               |
                           +-------------------------------+---> [ SECTOR CLEARED ] ----> [ READY FOR DEPARTURE ]
```

- When an ROP report identifies `HEAVY_CONGESTION`, `LANDSLIDE_OBSTACLE`, or `HOSTILE_ACTIVITY`, the active journey's readiness score is reduced and an automatic detour recommendation is flagged.
- When an authorized officer files a clearance override, the action is written to the audit log with credentials and justification.

---

### 3.6 Natural Language SITREP Parser (`sitrep_parser.py`)

A specialized rule-assisted NLP parser extracts tactical threats from free-text military situation reports:
- **Entity Extraction:** Identifies highway designations (`NH1`, `NH1D`, `NH44`), military stations, and kilometer markers.
- **Threat Taxonomy:** Categorizes text into Landslide, Road Damage, Ambush Threat, Drone Activity, or Civilian Demonstration.
- **Corridor Injection:** Matches entities against database routing nodes and applies threat weights directly to topological edges.

---

## 4. Database Schema Architecture

The persistence model is implemented in SQLite 3 with full foreign-key constraints and ACID transaction protection.

```
+--------------------+        +---------------------+        +--------------------+
|   vehicle_master   |        |       nodes         |        |      segments      |
+--------------------+        +---------------------+        +--------------------+
| id (PK)            |        | id (PK)             |        | id (PK)            |
| model_name         |        | name                |        | source_node (FK)   |
| vehicle_type       |        | latitude            |        | target_node (FK)   |
| tare_weight_tons   |        | longitude           |        | distance_km        |
| max_payload_tons   |        | elevation_m         |        | surface_type       |
| gvw_tons           |        | station_type        |        | avg_gradient_pct   |
| max_passengers     |        +----------+----------+        | bridge_class_tons  |
| is_passenger_only  |                   |                   | threat_level       |
+---------+----------+                   |                   +---------+----------+
          |                              |                             |
          |                              +--------------+--------------+
          |                                             |
+---------v----------+        +-------------------------v-------------------------+
|  journey_vehicles  |        |                     journeys                      |
+--------------------+        +---------------------------------------------------+
| id (PK)            |        | id (PK, e.g. CMS-20261115-XXXXXX)                 |
| journey_id (FK)----+------->| origin_id (FK) -> nodes.id                        |
| vehicle_id (FK)    |        | dest_id (FK) -> nodes.id                          |
| position_in_convoy |        | convoy_speed_kmh                                  |
| allocated_payload  |        | departure_time / status                           |
| passenger_count    |        | primary_route_distance / alternate_route_distance  |
+--------------------+        | voram_risk_score / voram_tier                     |
                              | fuel_required_liters / fuel_safety_margin_pct     |
                              +-------------------------+-------------------------+
                                                        |
                              +-------------------------+-------------------------+
                              |                         |                         |
                    +---------v----------+    +---------v----------+    +---------v----------+
                    |    rop_reports     |    | sensitivity_adv    |    | readiness_overrides|
                    +--------------------+    +--------------------+    +--------------------+
                    | id (PK)            |    | id (PK)            |    | id (PK)            |
                    | journey_id (FK)    |    | journey_id (FK)    |    | journey_id (FK)    |
                    | route_status       |    | advisory_code      |    | override_officer   |
                    | verified_at        |    | severity_level     |    | reason_text        |
                    | scout_team_id      |    | advisory_text      |    | created_at         |
                    +--------------------+    +--------------------+    +--------------------+
```

---

## 5. Security & Authentication Architecture

1. **Token Standard:** JSON Web Token (JWT) signed with HMAC-SHA256 (`HS256`).
2. **Token Expiration:** 86,400 seconds (24 hours).
3. **Password Hashing:** PBKDF2 with SHA-256 and unique per-user salt.
4. **Role Hierarchy:**
   - `commander`: Unrestricted read, journey approval, readiness override, audit inspection.
   - `coordinator`: Journey creation, route optimization, vehicle dispatch, ROP entry.
   - `dispatcher`: Vehicle assignment, manifest review, driver briefing.
   - `analyst`: Read-only telemetry, VORAM analytics, historical audit logs.
5. **CORS Configuration:** Explicit origin whitelist restricting client requests to authorized local interfaces (`localhost:5173`, `127.0.0.1:5173`).

---

## 6. Cartographic & Mapping Architecture

VAYU ORBIT implements a dual-mode map architecture:

### Online Mode (TomTom Web SDK v6)
- High-fidelity vector road tiles and satellite overlay.
- Real-time road geometry and waypoint plotting.
- Dynamic route polylines colored according to segment VORAM risk level:
  - Green: Low risk corridor
  - Amber: Moderate risk corridor
  - Crimson: High / Critical risk corridor

### Offline Tactical Vector Canvas (Fallback Mode)
- Automatically engages when `VITE_TOMTOM_API_KEY` is absent or network unreachable.
- Custom HTML5 Canvas / SVG coordinate projection engine.
- Renders 116 logistics nodes, tactical corridors, active convoy icons, and hazard markers with zero network latency.

---
*VAYU ORBIT Technical Architecture | School of Computer Science & Engineering | LPU 2026*
