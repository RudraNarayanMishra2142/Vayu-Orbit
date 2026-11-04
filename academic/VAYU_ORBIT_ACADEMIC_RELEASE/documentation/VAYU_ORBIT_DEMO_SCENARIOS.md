# VAYU ORBIT — ACADEMIC DEMONSTRATION SCENARIOS

**Document:** Practical Academic Evaluation Runbook  
**Target Audience:** Academic Instructors, Grading Committees & Student Teammates  
**Application Version:** 6.0.0  
**Context:** Non-Operational Academic Simulation (Synthetic Data & Simulated Topologies)  

---

## SCENARIO 1: PRE-MISSION CONVOY PLANNING & VORAM READINESS GATE

### Objective
Demonstrate constraint-aware convoy construction, dynamic axle-load calculation, corridor route planning, and pre-dispatch evaluation via the VORAM (Vayu Operational Readiness & Assessment Matrix) readiness gate.

### Initial Conditions
- Application running (`http://localhost:5173`).
- Logged in as **Coordinator** (`coordinator@vayu.local` / `VayuOrbit@2026`).
- Demo database seeded or reset via `RESET_VAYU_ORBIT_DEMO.bat`.

### Step-by-Step Actions
1. **Navigate to Convoy Builder (`/convoy`):**
   - Click **Convoy Builder** on the sidebar.
   - Select 4 vehicles:
     - 1x *Tata Safari Storme GS800* (LTV - 3.0T, Lead Vehicle)
     - 2x *Ashok Leyland Stallion 4x4* (MSV - 12.0T each, Cargo)
     - 1x *Scania P410 HET 8x8* (HSV - 35.0T, Heavy Hauler)
   - Observe live aggregated parameters in the **Convoy Telemetry** panel:
     - Total Mass: ~62.0 Tons
     - Maximum Axle Load: ~35.0 Tons
     - Convoy Envelope Length: ~140 Meters
2. **Navigate to Journey Planning (`/planning`):**
   - Click **Journey Planning**.
   - Select **Origin:** *Delhi Military Station (MS-01)*.
   - Select **Destination:** *Ambala Cantonment (CN-01)*.
   - Set **Departure Date & Time:** Future timestamp (e.g., tomorrow at 06:00 IST).
   - Select the newly assembled convoy composition.
3. **Inspect Route Assessment (`/route-assessment`):**
   - Click **Assess Corridors**.
   - Compare Route Option 1 (Primary Highway - NH 44) vs. Route Option 2 (Alternate Tactical Bypass).
   - Verify that bridge axle load constraints and clearance heights are calculated against the Scania HET (35T).
4. **Evaluate VORAM Readiness Panel:**
   - Review the 7 readiness vectors: Speed Limits, Spacing Adherence, Fuel Reserves, Night Movement Advisory, Escort Protocol, Driver Rest Cycles, and Checkpoint Clearances.
   - Click **Commit Mission Manifest**.
   - Confirm state transition: The journey status moves from `DRAFT` to `PLANNED`.

### Expected Output
- System successfully assigns unique Journey ID (e.g., `JRN-xxxxxx`).
- Route polyline is rendered on the interactive Leaflet map.
- Complete mission manifest is logged into the SQLite audit ledger.

---

## SCENARIO 2: LIVE CONVOY TRACKING & INCIDENT DETECTION

### Objective
Demonstrate active journey supervision, simulated telemetry tracking, speed limit alerts, and spacing compliance monitoring.

### Initial Conditions
- Pre-staged demo journey `CMS-DEMO-ACTIVE-01` present (run `SEED_DEMO_SCENARIOS.bat` if required).
- Logged in as **Checkpoint Operator** (`checkpoint@vayu.local` / `VayuOrbit@2026`).

### Step-by-Step Actions
1. **Navigate to Journey Operations (`/operations`):**
   - Locate active journey `CMS-DEMO-ACTIVE-01` in the mission ledger.
   - Click **Monitor Journey**.
2. **Review Real-Time Telemetry Feed:**
   - Observe current simulated GPS coordinates along the corridor.
   - Observe vehicle order: Lead vehicle, Cargo units, and Rear Guard.
3. **Simulate Spacing Violation:**
   - In the operations telemetry panel, adjust the inter-vehicle spacing slider below the minimum allowable limit (e.g., set to 25 meters, where threshold is 40 meters).
   - Observe the alert trigger: **WARNING: CONVOY SPACING VIOLATION DETECTED (< 40m)**.
   - Click **Acknowledge Incident**. Enter corrective notes: *"Radioed convoy commander to enforce 50m tactical spacing"*.
4. **Checkpoint Clearance Logging:**
   - Click **Log Checkpoint Entry** at *Karnal Military Node*.
   - Verify the checkpoint timestamp is recorded in the operational timeline.

### Expected Output
- Incident is logged in the `incidents` table with state `RESOLVED`.
- Live visual badge updates from AMBER to GREEN on acknowledgment.
- All actions are recorded with the operator's user ID in `audit_log`.

---

## SCENARIO 3: REAL-TIME SITREP DISRUPTION, REROUTING & PDF DEBRIEF

### Objective
Demonstrate how real-time SITREP intelligence triggers dynamic rerouting, commander authorization, and one-click PDF debrief generation.

### Initial Conditions
- Logged in as **Creator / Coordinator** (`coordinator@vayu.local` / `VayuOrbit@2026`).

### Step-by-Step Actions
1. **Inject Threat Disruption (SITREP):**
   - In Journey Operations, open the **SITREP Intelligence Feed**.
   - Input simulated SITREP: *"FLASH: Highway NH-44 near Kurukshetra blocked due to major bridge structural defect. Delay multiplier 5.0x."*
   - Click **Parse & Assess Impact**.
2. **Dynamic Route Recalculation:**
   - The NetworkX routing engine recalculates the topological corridor graph.
   - NH-44 is flagged as impassable for heavy vehicles; an alternate western corridor via Kaithal is generated.
   - Review ETA delta: +42 minutes; distance delta: +28 km.
   - Click **Authorize Reroute**.
3. **Complete Mission Lifecycle:**
   - In operations controls, click **Complete Journey**.
   - Journey status updates to `COMPLETED`.
4. **Generate Mission Debrief PDF:**
   - Navigate to **Journey Reports** (`/report`).
   - Select completed journey `CMS-DEMO-COMPLETED-02` (or the newly completed mission).
   - Review on-screen mission debrief metrics: total travel time, fuel consumed, incident count, and route map.
   - Click **Export Official Debrief (PDF)**.
   - Open the downloaded PDF in your viewer.

### Expected Output
- Professional multi-page PDF debrief generated by ReportLab.
- PDF includes official VAYU ORBIT header, mission summary table, waypoint sequence, incident resolution ledger, and author copyright attribution.
