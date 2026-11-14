# VAYU ORBIT — Data Provenance, Data Dictionary & System Limitations
## Version 6.0.0 | Academic Release | Problem Statement PDS-3

---

## 1. Data Provenance & Synthetic Generation Methodology

All datasets packaged with **VAYU ORBIT** are strictly **synthetic, open-source derived, or mathematically simulated**. No classified, sensitive, proprietary, or operational military intelligence was accessed, utilized, or incorporated into this software.

### Synthetic Data Generation Principles
1. **Station Naming & Topology:** Logistics nodes use public geographical references, historical transit landmarks, and generic administrative designations (e.g., Transit Camps, Supply Depots, Ordnance Depots) across Northern, Western, and Central corridors in India.
2. **Vehicle Technical Specifications:** Vehicle dimensions, tare weights, and payload capacities are modeled after published civilian manufacturer brochures (Tata Motors Defence Solutions, Ashok Leyland Defence Systems) and open defense literature.
3. **Terrain & Elevation Profiles:** Elevation benchmarks correspond to open geographical references along major public highways (e.g., NH1, NH1D, NH44, Leh-Manali Highway), with synthetic micro-gradients interpolated for simulation purposes.
4. **Threat Intelligence Scenarios:** All SITREPs (Situation Reports) and ROP hazards represent fictional tactical exercises constructed purely to evaluate algorithmic response under simulated stress.

---

## 2. Complete Data Dictionary

### 2.1 Logistics Stations Catalog (`nodes`)
Contains 116 synthetic military logistics installations.

| Field Name | Type | Constraints | Description / Operational Meaning |
|---|---|---|---|
| `id` | `VARCHAR(16)` | Primary Key | Unique station identifier (e.g., `STN-001`, `AMB-AFS`) |
| `name` | `VARCHAR(128)` | Not Null | Station formal designation (e.g., *Ambala Air Force Station*) |
| `latitude` | `FLOAT` | [-90.0, 90.0] | Geographical latitude in decimal degrees |
| `longitude` | `FLOAT` | [-180.0, 180.0] | Geographical longitude in decimal degrees |
| `elevation_m` | `INTEGER` | $\ge 0$ | Altitude above sea level in meters (affects fuel & VORAM) |
| `station_type` | `VARCHAR(32)` | Enum | Classification: `TC` (Transit Camp), `SD` (Supply Depot), `OD` (Ordnance Depot), `FOB` (Forward Operating Base), `MH` (Military Hospital) |
| `fuel_capacity_kl` | `FLOAT` | $\ge 0.0$ | Reserve diesel capacity in kiloliters |
| `medical_facility` | `BOOLEAN` | True/False | Presence of emergency surgical / stabilization capability |

### 2.2 Network Topology & Corridors (`segments`)
Directed road edges connecting adjacent logistics nodes.

| Field Name | Type | Constraints | Description / Operational Meaning |
|---|---|---|---|
| `id` | `INTEGER` | Primary Key, Auto | Internal segment index |
| `source_node` | `VARCHAR(16)` | Foreign Key | Origin station identifier |
| `target_node` | `VARCHAR(16)` | Foreign Key | Destination station identifier |
| `distance_km` | `FLOAT` | $> 0.0$ | Corridor length in kilometers |
| `surface_type` | `VARCHAR(32)` | Enum | Road surface: `HIGHWAY`, `PAVED_SECONDARY`, `UNPAVED_GRAVEL`, `ALPINE_TRACK` |
| `avg_gradient_pct` | `FLOAT` | [0.0, 30.0] | Average slope percentage |
| `max_gradient_pct` | `FLOAT` | [0.0, 35.0] | Maximum steepness encountered along corridor |
| `bridge_class_tons`| `FLOAT` | $> 0.0$ | Military Load Classification (MLC) bridge weight limit |
| `threat_level` | `FLOAT` | [0.0, 1.0] | Baseline tactical threat index (0.0 = benign, 1.0 = hostile) |

### 2.3 Vehicle Fleet Master (`vehicle_master`)
Technical attributes and payload constraints for convoy vehicles.

| Field Name | Type | Constraints | Description / Operational Meaning |
|---|---|---|---|
| `id` | `VARCHAR(16)` | Primary Key | Canonical vehicle type code (e.g., `SAFARI_GS800`) |
| `model_name` | `VARCHAR(64)` | Not Null | Commercial / Military model name |
| `vehicle_type` | `VARCHAR(32)` | Enum | Role: `SCOUT`, `LOGISTICS_4X4`, `LOGISTICS_6X6`, `MEDIUM_CARRIER`, `HEAVY_TRANSPORTER` |
| `tare_weight_tons` | `FLOAT` | $> 0.0$ | Unladen vehicle curb weight in metric tons |
| `max_payload_tons` | `FLOAT` | $\ge 0.0$ | Maximum permissible freight cargo capacity in metric tons |
| `gvw_tons` | `FLOAT` | $\ge \text{tare}$ | Gross Vehicle Weight rating ($\text{Tare} + \text{Payload}$) |
| `max_passengers` | `INTEGER` | $\ge 1$ | Seated personnel capacity (including driver & co-driver) |
| `is_passenger_only`| `BOOLEAN` | True/False | If `True`, cargo payload must strictly equal $0.0\text{ tons}$ |
| `base_fuel_kmpl` | `FLOAT` | $> 0.0$ | Baseline fuel economy on flat tarmac (km per liter) |

#### Verified Fleet Roster
1. **Tata Safari Storme GS800:**
   - Tare: `2.4 T` | Cargo Limit: `0.0 T` | GVW: `3.0 T` | Pax: `6` | Class: `PASSENGER_ONLY`
2. **Tata LPTA 715 4×4:**
   - Tare: `4.25 T` | Cargo Limit: `3.0 T` | GVW: `7.25 T` | Pax: `2` | Class: `CARGO_TRANSPORT`
3. **Ashok Leyland Stallion 4×4:**
   - Tare: `5.6 T` | Cargo Limit: `5.0 T` | GVW: `10.6 T` | Pax: `2` (Cab) / `18` (Troop configuration)
4. **Ashok Leyland Super Stallion 6×6:**
   - Tare: `9.8 T` | Cargo Limit: `10.0 T` | GVW: `19.8 T` | Pax: `2` | Class: `CARGO_TRANSPORT`
5. **Scania R580 8×8 HET:**
   - Tare: `18.0 T` | Cargo Limit: `40.0 T` | GVW: `58.0 T` | Pax: `2` | Class: `HEAVY_TRANSPORTER`

---

## 3. System Boundaries & Academic Simulation Scope

### What VAYU ORBIT IS:
- **An Academic Prototype:** Developed for university capstone assessment under Problem Statement PDS-3 to evaluate multi-factor optimization algorithms.
- **A Strategic Decision-Support Tool:** Simulates how automated constraint checking, VORAM risk modeling, and ROP recon reports assist convoy logistics coordinators.
- **A High-Integrity Software Demonstration:** Demonstrates robust software engineering principles, Pydantic type validation, SQLite database management, and responsive frontend architectures.

### What VAYU ORBIT IS NOT:
- **NOT an Operational Command and Control (C2) System:** It is not connected to any military network, defense intranet, or armed forces headquarters.
- **NO Real-Time GPS Tracking:** The system does not interface with live military transponders or satellite tracking hardware. Convoys advance via simulated checkpoint state updates.
- **NO Real Classified Coordinates:** All latitude and longitude coordinates correspond to public landmarks or generalized synthetic waypoints.
- **NO Live Weapon System Telemetry:** The platform does not track weapons, ammunition lots, or tactical combat assets.
- **NOT a Field Navigation Device:** The turn-by-turn guidance and route lines are strategic planning estimates and must not be used for actual vehicular navigation in hazardous alpine terrain.

---

## 4. Technical Assumptions & Limitations

1. **Elevation & Gradient Simplification:** Gradients are calculated as average segment slopes. Localized micro-terrain variations (such as individual hairpin switchbacks, dips, or washouts) are modeled via segment surface category multipliers rather than full 3D terrain meshes.
2. **Static Weather Mapping:** Weather advisories are currently assigned per regional sector (e.g., `Sector Northern - High Snow Risk`) rather than continuous real-time Doppler radar feeds.
3. **Single Active Database Instance:** The SQLite database engine is optimized for single-host concurrent access. In an enterprise production deployment, this would be migrated to PostgreSQL with PostGIS spatial extensions.
4. **ROP Recon Synchronization:** Reconnaissance reports update route weights when filed; active journeys in transit currently require dispatcher manual review to trigger re-routing rather than autonomous in-flight vehicle telemetry push.

---
*VAYU ORBIT Data & Limitations Specification | School of Computer Science & Engineering | LPU 2026*
