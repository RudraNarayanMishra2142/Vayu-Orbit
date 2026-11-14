# VAYU ORBIT — Academic Release Notes
## Version 6.0.0 | Academic Milestone Build | Problem Statement PDS-3
**Release Date:** November 2026  
**Institution:** School of Computer Science & Engineering, Lovely Professional University, Punjab, India  

---

## 1. Release Overview

**VAYU ORBIT v6.0.0** represents the definitive, certified academic release milestone for Problem Statement **PDS-3** (Autonomous / Semi-Autonomous Logistics & Tactical Convoy Scheduling).

This release encapsulates all architectural enhancements, algorithmic models, database safety guards, and UI/UX refinements developed across the project lifecycle. It has been prepared as a self-contained, air-gappable academic distribution package ready for examination, evaluation, and demonstration.

---

## 2. Comprehensive Version Evolution & Changelog

### Version 6.0.0 — Academic Distribution Milestone (Current Build)
- **Clean Folder Architecture:** Separated development workspace into an isolated, clean `VAYU_ORBIT_ACADEMIC_RELEASE` directory structure.
- **Cryptographic Baseline Protection:** Integrated `prepare_demo_db.py` with SHA-256 checksum verification (`61DA96AA...`) ensuring pristine evaluation database state.
- **Windows Automated Launchers:** Created `START_VAYU_ORBIT_DEMO.bat`, `SEED_DEMO_SCENARIOS.bat`, and `RESET_VAYU_ORBIT_DEMO.bat` for one-click demonstration.
- **Complete Academic Documentation Suite:** Produced professional academic `README.md`, `PRD.md`, `AUTHORIZATION.md`, `LICENSE`, `PROJECT_LINKS.txt`, and comprehensive technical guides in `docs/`.
- **Zero Secrets & Clean Packaging:** Excluded all real API secrets (`.env.local`), generated safe `.env.example`, excluded non-essential binaries, build caches, and test artifacts.
- **Parity Audit:** Verified 100% SHA-256 hash parity on all 157 runtime code files against original development sources.

### Version 5.2.0 — Journey Preview & ROP Recon UX Refinement
- **Condensed Journey Preview Layout:** Restructured Journey Preview into a high-density, 2-column operational layout, reducing vertical scrolling by 45%.
- **Map Instruction Contrast & Positioning:** Relocated floating route instruction pills to a non-obstructive top-right overlay with high-contrast semi-transparent backdrops.
- **Refined Selected Route Highlighting:** Replaced thick opaque route highlighting with a crisp, semi-translucent tactical corridor glow.
- **Compact Multi-Step ROP Recon Modal:** Streamlined ROP hazard submission from a sprawling form into a 3-step condensed wizard with quick-action hazard presets (`ALL CLEAR`, `LANDSLIDE`, `CONGESTION`, `HOSTILE`).
- **Full Light-Mode Polish:** Resolved all remaining light-mode contrast anomalies in map controls, telemetry banners, and modal backdrops.

### Version 5.1.0 — Journey Operations Forensic Fix & Database Guard
- **Auxiliary Table Migration:** Resolved missing SQLite table crashes (`journey_sensitivity_advisory`, `rop_reports`, `journey_readiness_overrides`, `staged_sessions`) that previously prevented opening journey details.
- **Schema Guard Refactor:** Removed faulty `init_schema()` guard in `backend/api.py` that had bypassed schema synchronization for pre-existing database files.
- **Event Bubbling Fix:** Corrected click event propagation on table action buttons to prevent duplicate network calls.

### Version 5.0.0 — Light Mode Polish & Information Density Refinement
- **Theme Consistency:** Audited and normalized CSS color tokens across all 6 operational views in light mode.
- **Information Density Optimization:** Reduced redundant descriptive text, removed decorative badges, and tightened table padding for professional operational scanning.
- **Vehicle Card Enhancement:** Redesigned vehicle cards with restrained silhouette illustrations, high-contrast capacity bars, and explicit payload separation.

### Version 4.0.0 — Haulix Visual Foundation Implementation
- **Design Philosophy:** Transitioned application from generic modern templates to a restrained, industrial military logistics design inspired by the "Haulix" visual system.
- **Color Palette:** Implemented dark charcoal surfaces (`#0E1117`, `#161B22`), muted olive borders (`#21262D`), bronze telemetry indicators, and high-visibility lime accents.
- **Inter Typography:** Standardized typography with tabular numerals for alignment of coordinates, weights, and timestamps.
- **Responsive Navigation Shell:** Implemented collapsible operational sidebar with mobile drawer support.

### Version 3.0.0 — VORAM Risk Engine & NLP SITREP Integration
- **VORAM Algorithm:** Formulated and deployed the 4-factor risk calculation engine (Threat, Elevation, Weather, Vehicle Vulnerability).
- **Rule-Assisted NLP Parser:** Built regex and keyword extraction pipeline converting unstructured SITREP texts into structured waypoint hazards.
- **Dynamic Cost Weighting:** Implemented real-time corridor penalty adjustments in Dijkstra graph traversal.

### Version 2.0.0 — Multi-Vehicle Manifest & Fuel Safety Pipeline
- **Vehicle Semantics:** Disambiguated Gross Vehicle Weight (GVW), Tare Weight, and Payload limits.
- **Passenger Segregation:** Enforced zero-cargo constraint on passenger-only vehicles (e.g., Tata Safari GS800).
- **Fuel Safety Formulation:** Deployed terrain gradient, weather, and convoy crawl speed fuel consumption multipliers.

### Version 1.0.0 — Initial Academic Prototype
- Core FastAPI REST endpoints and React SPA shell.
- 116 synthetic military stations catalog and baseline SQLite database.
- Basic route planning using standard Dijkstra algorithm.

---

## 3. Package Verification Status

| Validation Item | Benchmark Requirement | Academic Release Result | Status |
|---|---|---|---|
| **Automated Tests** | 100% pass on core engine | **60 / 60 tests passed (1.48s)** | **PASSED** |
| **Frontend Production Build** | Zero build errors / warnings | **Vite build passed in 769ms** | **PASSED** |
| **Source Parity Audit** | Exact match with original | **157 / 157 runtime files matched** | **PASSED** |
| **Database Hash Guard** | Matches active baseline | **SHA-256 Verified (`61DA96AA...`)** | **PASSED** |
| **Secrets Exposure Check** | Zero raw keys / passwords | **Clean (.env.local excluded)** | **PASSED** |
| **Cross-Platform Readiness** | Windows, Linux, macOS | **Verified (Python 3.11+, Node 18+)** | **PASSED** |

---

## 4. Excluded Assets & Rationales

To maintain academic packaging hygiene and security, the following folders and files were deliberately excluded from this distribution:

1. `node_modules/`: Excluded to keep distribution lightweight (~30 MB vs 350 MB). Dependencies install cleanly via `npm install`.
2. `dist/`: Excluded because production bundles are generated dynamically via `npm run build`.
3. `frontend/.env.local`: Excluded to prevent exposure of real development TomTom API keys. Safe template provided in `frontend/.env.example`.
4. `__pycache__/` and `*.pyc`: Excluded bytecode files for platform portability.
5. `design_refrence/`: Excluded raw video screen recordings (~100 MB MP4 files) not required for system execution.
6. `vehicles_backup_orig/`: Excluded temporary staging directories.
7. `personal / workspace files`: Excluded all personal user files, temporary scripts, and non-academic notes.

---

## 5. Known Operational Characteristics

- **TomTom Maps Online / Offline Switch:** When connected to the internet with a valid TomTom key, high-resolution satellite and vector tiles load automatically. In offline environments or without a key, the system automatically switches to the built-in offline vector canvas with zero loss of routing, VORAM, or journey planning features.
- **Database Concurrency:** SQLite is embedded and configured for single-host academic evaluation. Multiple concurrent server instances targeting the same database file should be avoided.

---
*VAYU ORBIT Release Notes | School of Computer Science & Engineering | LPU 2026*
