# VAYU ORBIT v6.0.0 — GitHub Pre-Publication Security, Privacy & Legal Audit
**Document ID:** VAYU-DOC-AUD-010  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Project:** VAYU ORBIT (Academic Problem Statement PDS-3: Military Convoy Movement Planning & Dynamic Route Optimisation)  
**Release Target:** `v6.0.0-academic`  
**Audit Date:** November 15, 2026  
**Auditor:** Senior Application Security & Release Engineering Reviewer  
**Final Verdict:** **BLOCKED — BOTH SECURITY AND AUTHORISATION**

---

## 1. Executive Summary

This forensic pre-publication audit was conducted to evaluate the security, privacy, repository hygiene, and legal readiness of **VAYU ORBIT v6.0.0** before any public or external code publication.

In strict adherence to execution boundaries, **no code was pushed, no GitHub repository visibility was modified, no credentials were rotated, and no cloud resources were provisioned**. All assessments were conducted through local file inspection, git tree traversal, static AST analysis, and cryptographic checksum verification.

### High-Level Audit Findings:
1. **Git Root Discrepancy & Path Confusion:** The active workspace `CMS/programme/` lacks a `.git` root. Running Git commands within `programme/` climbs to `C:\Users\mishr\.git`, an accidental uncommitted Git root capturing the entire user profile. The actual dedicated project repository is located at `C:\Users\mishr\OneDrive\Desktop\CMS\vayu_orbit_repo\.git` (remote: `https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git`).
2. **Historical Database Exposure in Git History:** Commit `43bdf7d3` in `vayu_orbit_repo` committed `military_logistics.db` (3.1 MB, containing 119 historical convoy trajectories and 265 audit logs) and `military_logistics_demo.db` directly into GitHub history.
3. **Local Plaintext API Key:** An active TomTom Maps API key was identified in `CMS/programme/frontend/.env.local`. Although not committed to Git, it resides unencrypted in the parent workspace.
4. **Hardcoded Client Web API Key:** `frontend/src/services/firebase.js` contains a hardcoded fallback Google/Firebase Web API key (`AIzaSy[REDACTED_CLIENT_KEY]`).
5. **Legal & Institutional Authorization Gate:** `AUTHORIZED_USE.md` (Section 3) and `AUTHORIZATION.md` (Section 1) explicitly prohibit public repository hosting and web publication without signed, written authorization from Copyright Owner Rudra Narayan Mishra.

---

## 2. Actual Git Root and Remote Details

| Property | Active Programme Workspace (`programme/`) | Actual Project Git Repository (`vayu_orbit_repo/`) | Accidental Home Root (`C:\Users\mishr`) |
|:---|:---|:---|:---|
| **Directory Path** | `c:\Users\mishr\OneDrive\Desktop\CMS\programme` | `C:\Users\mishr\OneDrive\Desktop\CMS\vayu_orbit_repo` | `C:\Users\mishr` |
| **`.git` Directory** | **ABSENT** (`False`) | **PRESENT** (`True`) | **PRESENT** (`True`) |
| **Effective Git Root** | Resolves to `C:\Users\mishr` (Climbing) | `C:\Users\mishr\OneDrive\Desktop\CMS\vayu_orbit_repo` | `C:\Users\mishr` |
| **Current Branch** | `master` (from home root) | `main` | `master` |
| **Commit Count** | 0 (No commits yet) | 3 commits | 0 (No commits yet) |
| **Remote Origin** | None | `https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git` | None |
| **Credential in URL** | None | Redacted / None (Standard HTTPS) | None |
| **Tracking Status** | Uncommitted (Captures user home directory) | Up to date with `origin/main` | Uncommitted |

> [!CAUTION]
> **CRITICAL EXECUTION WARNING ON GIT COMMANDS:**  
> Running `git add` or `git commit` inside `CMS\programme\` targets `C:\Users\mishr\.git`, which stages sensitive operating system files (e.g. `NTUSER.DAT`, `AppData`, `Documents`). All project Git operations must be explicitly executed with `-C "C:\Users\mishr\OneDrive\Desktop\CMS\vayu_orbit_repo"` or after moving into `vayu_orbit_repo`.

---

## 3. Secret and Credential Audit

A full regex and AST scan was conducted across all tracked and untracked files:

| Finding ID | Finding Description | Location | Category | Severity | Status / Remediation |
|:---|:---|:---|:---|:---|:---|
| **SEC-01** | Active TomTom Maps SDK API Key (`M4LZ3K7Xu0vZFZJrrC703CjtG02e4HLL`) | `programme/frontend/.env.local` | Confirmed Secret | **High** | Untracked in parent workspace. Excluded from `academic/`. Rotate key in TomTom Developer Portal and restrict by domain referrer. |
| **SEC-02** | Google / Firebase Web App API Key (`AIzaSy[REDACTED_CLIENT_KEY]`) | `frontend/src/services/firebase.js:6` | Public Client Configuration | **Medium** | Public Web client identifier. Restrict key to authorized HTTP referrers in Google Cloud Console. Remove hardcoded fallback in source code. |
| **SEC-03** | Default Fallback JWT Secret (`vayu-orbit-auth-token-rot-2026-c7f8a9e2d1b0`) | `backend/auth.py:10` | Placeholder / Fallback Value | **Medium** | Fallback string in source code. Ensure production environments strictly inject `VAYU_JWT_SECRET` via Secret Manager or environment variable. |
| **SEC-04** | Historical JWT Secret (`vayu-orbit-tactical-secret-key-2026-secure-jwt-token`) | `vayu_orbit_repo` Commit `43bdf7d3` (`backend/auth.py`) | Placeholder in Git History | **Low** | Superseded by hardened auth module. Ensure production does not use this key. |
| **SEC-05** | Template Database URL with Placeholder Password | `.env.example:54` & `docs/SQLITE_TO_POSTGRESQL_MIGRATION.md:46` | Placeholder / Demo Value | **Informational** | Clearly marked commented-out placeholder (`SecurePassword`). Safe. |
| **SEC-06** | Intentionally Invalid Test Database URL | `backend/tests/test_database_migration.py:107` | Test Fixture | **Informational** | Synthetic mock URL (`invalid_user:invalid_pass@127.0.0.1`) used for unit testing connection failures. Safe. |
| **SEC-07** | Firebase Private Service Account Key | Codebase scan | **None Found** | **Clean** | 0 service account private key JSON files (`"type": "service_account"`) exist in repository. |
| **SEC-08** | Cloud Provider / CI Secrets | Codebase scan | **None Found** | **Clean** | 0 AWS, GCP, GitHub tokens, or Vercel access tokens found. |

---

## 4. Environment-File Handling Audit

| File Path | Status in Git | Contents Assessment | Risk / Action |
|:---|:---|:---|:---|
| `academic/VAYU_ORBIT_ACADEMIC_RELEASE/.env.example` | Untracked / Staged for release | Safe variable names, documentation, and academic placeholders (`AIzaSyPlaceholder...`). | **SAFE FOR RELEASE** |
| `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/.env.production.example` | Untracked / Staged for release | Safe cloud configuration templates (Render, Railway, Fly.io). No real secrets. | **SAFE FOR RELEASE** |
| `academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend/.env.example` | Untracked / Staged for release | Safe TomTom key placeholder (`YOUR_TOMTOM_API_KEY_HERE`). | **SAFE FOR RELEASE** |
| `academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend/.env.production.example` | Untracked / Staged for release | Safe production frontend environment template. | **SAFE FOR RELEASE** |
| `programme/frontend/.env.local` | Outside academic release | Contains active TomTom API key. Excluded by `.gitignore`. | **DO NOT COPY INTO RELEASE** |
| `academic/.../frontend/vercel.json` | Clean | Client rewrite rules and immutable cache headers only. Zero secrets. | **SAFE FOR RELEASE** |
| `academic/.../render.yaml` | Clean | Blueprint uses `generateValue: true` for JWT secret. Zero secrets. | **SAFE FOR RELEASE** |
| `academic/.../firebase.json` | Clean | Hosting and Data Connect bindings only. Zero secrets. | **SAFE FOR RELEASE** |

---

## 5. Git History & Code-Leak Inspection

A complete scan of all revisions in `C:\Users\mishr\OneDrive\Desktop\CMS\vayu_orbit_repo` was conducted across commits:
- `5633ced`: Initial commit (README only)
- `51c9c3e`: Revise README with project details
- `43bdf7d`: Add VAYU ORBIT academic project files (Nov 4, 2026)

### Historical Commit Findings:
1. **Committed SQLite Databases:**
   - Commit `43bdf7d` added `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/military_logistics.db` (3,166,208 bytes) and `military_logistics_demo.db` (3,055,616 bytes) into the Git tree.
   - Because `military_logistics.db` contains historical simulated convoy records and audit logs, it should not have been committed to GitHub history.
2. **Environment Files in History:**
   - Only `frontend/.env.example` (containing `VITE_API_BASE_URL=http://127.0.0.1:8000`) was ever committed.
   - Zero `.env`, `.env.local`, or `.env.production` files were ever committed.
3. **Secret Scan on Historical Diffs:**
   - Scanned all commit diffs using automated pattern matchers. Found 0 AWS keys, 0 GitHub PATs, 0 private RSA/EC keys, and 0 real database passwords in commit history.

---

## 6. Database Privacy & Data Sanitization Audit

All database files and backups across the project were inspected:

| Database File | File Size | Table Count | Row Summary | Privacy & Classification Assessment |
|:---|:---:|:---:|:---|:---|
| `backend/military_logistics.db` (Active) | 3.16 MB | 19 tables | 122 journeys, 296 audit logs, 197 events, 12 incidents, 8 ROP reports, 3 users | **SENSITIVE SIMULATION DATA.** Contains historical convoy routes, operational timelines, and internal audit logs. **MUST BE EXCLUDED FROM RELEASE.** |
| `backend/military_logistics_demo.db` (Demo Template) | 229 KB | 19 tables | 0 journeys, 0 audit logs, 0 incidents, 0 events, 2 ROP templates, 3 users, 116 military nodes, 116 places, 36 vehicles | **SANITIZED ACADEMIC TEMPLATE.** 0 operational journeys, 0 audit records. Contains only public highway cantonment nodes and synthetic demo users. **SAFE FOR ACADEMIC EVALUATION.** |
| `backend/military_logistics.db.backup_*` (12 files) | ~3.16 MB each | 19 tables | Timestamped migration backups (identical to active DB) | **FORENSIC BACKUP.** Must be preserved locally for disaster recovery, but **STRICTLY EXCLUDED FROM RELEASE.** |
| `vayu_orbit_backups/` | ~528 KB each | 14-15 tables | Pre-implementation baseline snapshots from October 2026 | **LEGACY LOCAL BACKUP.** Outside academic package. **EXCLUDED.** |

### Data Categorization:
- **Personally Identifiable Information (PII):** 0 real user emails or phone numbers. All 3 accounts use synthetic internal addresses (`creator@vayu.local`, `checkpoint@vayu.local`, `coordinator@vayu.local`). Password hashes use salted bcrypt (`$2b$12$...`).
- **Military Operational Security (OPSEC):** All 116 installations (`Agra Cantt`, `Ayodhya Cantt`, `Bareilly Cantt`, etc.) are public civil cantonments and National Highway intersections (`NH-19`, `NH-27`). No real military unit strengths, classified munitions, or active troop coordinates are present.
- **Sanitized Distribution Candidate:** `military_logistics_demo.db` is the clean, unpopulated reference template verified for academic distribution.

---

## 7. Repository Hygiene & Build Output Audit

| Item Category | Discovered Items | Status in Academic Package | Action Required |
|:---|:---|:---|:---|
| **Build Artifacts** | `frontend/dist/` | Not present (Clean) | Excluded by `.gitignore` |
| **Node Dependencies** | `frontend/node_modules/` | Not present (Clean) | Excluded by `.gitignore` |
| **Python Cache** | `__pycache__/` | Cleaned (0 directories) | Excluded by `.gitignore` |
| **Test Caches** | `.pytest_cache/` | Cleaned (0 directories) | Excluded by `.gitignore` |
| **IDE Metadata** | `.vscode/`, `.idea/` | 0 found in academic package | Excluded by `.gitignore` |
| **Database Backups** | 12 `*.backup_*` files | Present in `backend/` | **EXCLUDED** via updated `.gitignore` |
| **SQLite WAL Artifacts** | `*.db-shm`, `*.db-wal` | Transient runtime files | **EXCLUDED** via updated `.gitignore` |

---

## 8. Application Security & Architecture Review

1. **Authentication Architecture:**
   - Primary: Firebase ID token verification using Google Admin SDK JWKS public keys.
   - Sovereign RBAC: User roles (`CREATOR`, `CHECKPOINT_OPERATOR`, `COORDINATOR`) are queried directly from the backend database `users` table. Client claims have zero authority.
   - Account Status Enforcement: Accounts marked `DISABLED` or `PENDING_ROLE` are rejected with HTTP 403 Forbidden.
   - Legacy JWT Fallback: Controlled fallback is strictly disabled in `APP_ENV=production`.
2. **App Check Protection:**
   - Configured with `disabled` (local air-gapped dev), `audit` (monitoring), and `enforced` (production 401 gate) modes.
3. **CORS Security:**
   - Explicit origin whitelist (`localhost:5173`, `vayuorbit-b20b5.web.app`, `vayuorbit-b20b5.firebaseapp.com`).
   - Wildcard `*` is automatically stripped if credentials are enabled.
4. **FastAPI Debug Mode & Error Responses:**
   - `debug=False` by default.
   - 63 of 65 endpoints require explicit authentication dependencies.
   - Minor observation: In `api.py` lines 3090 and 3336, `{str(e)}` is included in HTTP 500 error messages. In production, these should be replaced with generic error descriptions.
5. **Frontend Bundle Secrets:**
   - Production bundle (`dist/assets/index-Br2O94sd.js`) contains 0 TomTom keys, 0 private keys, and 0 database passwords.

---

## 9. Legal and Project-Authorisation Gate

The project governance and distribution status is governed by two authoritative documents:

1. **`AUTHORIZED_USE.md` (Section 3 — Prohibited Uses):**
   > *"The following activities are STRICTLY PROHIBITED without prior, separate written authorization signed by Rudra Narayan Mishra:*  
   > *- Public Repository Hosting: Uploading this codebase (in full or in part) to public GitHub, GitLab, Bitbucket, Gist, Pastebin, or public cloud storage is prohibited."*
2. **`AUTHORIZATION.md` (Section 1 — Critical Release Safeguard):**
   > *"PUBLIC DISTRIBUTION STATUS: NOT AUTHORIZED / PERMISSION PENDING. Neither this software package, its source code, its schemas, its user interface artifacts, nor its documentation may be published publicly, committed to a public repository, mirrored on public cloud storage, or distributed outside the authorized academic examination loop without separate, prior, formal written authorization signed by the Copyright Owner (Rudra Narayan Mishra)."*

### Analysis of Private vs. Public Hosting:
- **Public GitHub Repository:** **STRICTLY PROHIBITED.** The repository visibility must remain private. Public release violates the project's intellectual property and examination licensing agreements.
- **Restricted Private Repository:** Permissible under `AUTHORIZED_USE.md` Section 2 ("Private Collaborative Discussion"), provided that:
  1. Access is limited strictly to authorized evaluators (Rudra Narayan Mishra, Suryansh Kumar Singh, supervisor Hitesh Kumar, and designated institutional examiners).
  2. The active operational database `military_logistics.db` and backup files are excluded.
  3. No credentials or plaintext keys are committed.
  4. Private hosting does not constitute a grant of public distribution rights.

---

## 10. Local Preparation & Proposed File Lists

### 10.1 Recommended `.gitignore` (Updated in Academic Package)
```gitignore
# Byte-compiled / optimized / DLL files
__pycache__/
*.py[cod]
*$py.class
*.pytest_cache/
.coverage
htmlcov/

# Node.js dependencies & build outputs
node_modules/
dist/
dist-ssr/
*.local

# Environment & Secret files
.env
.env.*
!.env.example
!.env.*.example
*.pem
*.key

# SQLite journal, active database & forensic backups
*.db-journal
*.db-wal
*.db-shm
*.sqlite3-journal
*.backup_*
military_logistics.db

# Operating System files
.DS_Store
Thumbs.db
desktop.ini

# IDE & Editor files
.vscode/
.idea/
*.swp
*.swo

# Local Logs & debugging dumps
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

### 10.2 Proposed Release File Inclusion List (209 Files)
- **Sanitized Template Database (1 file):**
  - `backend/military_logistics_demo.db` (Clean 0-journey academic template)
- **Backend Application Core (29 files):**
  - `backend/api.py`, `backend/auth.py`, `backend/db_adapter.py`, `backend/database_engine.py`
  - `backend/tactical_router.py`, `backend/voram_service.py`, `backend/fleet_engine.py`
  - `backend/intelligence_engine.py`, `backend/scenario_engine.py`, `backend/report_service.py`, `backend/report_pdf.py`
  - `backend/audit_service.py`, `backend/revision_service.py`, `backend/demo_launcher.py`, `backend/seed_demo_scenarios.py`
  - `backend/migrations/schema_postgres.sql`, `backend/migrations/sqlite_to_postgres.py`
  - `backend/tests/test_database_migration.py`, `backend/tests/test_journey_fetch_fix.py`, `backend/tests/test_voram_api.py`, `backend/tests/test_voram_core.py`
  - `backend/requirements.txt`, `backend/README.md`, `backend/.env.production.example`
- **Frontend Application (105 files):**
  - `frontend/src/` (All React components, pages, services, navigation, and hooks)
  - `frontend/public/vehicles/` (All 36 tactical vehicle SVG vector silhouettes and PNG assets)
  - `frontend/public/showcase/` (Workflow screenshots)
  - `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`, `frontend/index.html`
  - `frontend/.env.example`, `frontend/.env.production.example`, `frontend/vercel.json`
- **Firebase SQL Connect Configuration (5 files):**
  - `dataconnect/dataconnect.yaml`, `dataconnect/schema/schema.gql`
  - `dataconnect/connector/connector.yaml`, `dataconnect/connector/queries.gql`, `dataconnect/connector/mutations.gql`
- **Project Root & Governance Documentation (69 files):**
  - `README.md`, `LICENSE`, `SECURITY.md`, `AUTHORIZED_USE.md`, `AUTHORIZATION.md`, `PRD.md`
  - `firebase.json`, `.firebaserc`, `.env.example`, `render.yaml`, `requirements.txt`
  - `docs/` (All 20 architectural specifications, security threat models, and verification reports)
  - Batch scripts: `START_VAYU_ORBIT_DEMO.bat`, `RESET_VAYU_ORBIT_DEMO.bat`, `SEED_DEMO_SCENARIOS.bat`

### 10.3 Proposed Release File Exclusion List (15 Files)
1. `backend/military_logistics.db` (Active database containing 122 operational simulation journeys and 296 audit logs)
2. `backend/military_logistics.db.backup_20261115_020231` (Forensic backup)
3. `backend/military_logistics.db.backup_20261115_020231-shm` (Forensic backup artifact)
4. `backend/military_logistics.db.backup_20261115_020231-wal` (Forensic backup artifact)
5. `backend/military_logistics.db.backup_20261115_024500` (Forensic backup)
6. `backend/military_logistics.db.backup_20261115_024500-shm` (Forensic backup artifact)
7. `backend/military_logistics.db.backup_20261115_024500-wal` (Forensic backup artifact)
8. `backend/military_logistics_demo.db.backup_20261115_020231` (Forensic backup)
9. `backend/military_logistics_demo.db.backup_20261115_020231-shm` (Forensic backup artifact)
10. `backend/military_logistics_demo.db.backup_20261115_020231-wal` (Forensic backup artifact)
11. `backend/military_logistics_demo.db.backup_20261115_024500` (Forensic backup)
12. `backend/military_logistics_demo.db.backup_20261115_024500-shm` (Forensic backup artifact)
13. `backend/military_logistics_demo.db.backup_20261115_024500-wal` (Forensic backup artifact)
14. `backend/military_logistics_demo.db-shm` (Transient SQLite shared memory file)
15. `backend/military_logistics_demo.db-wal` (Transient SQLite write-ahead log file)

---

## 11. Required Credential Rotations & Hardening

1. **TomTom Maps SDK API Key:**
   - **Status:** Stored in `CMS/programme/frontend/.env.local`.
   - **Action:** If the parent workspace was ever shared or mirrored, rotate `M4LZ3K7Xu0vZFZJrrC703CjtG02e4HLL` in the TomTom Developer Portal and configure HTTP Referrer domain restrictions.
2. **Google / Firebase Web App Key:**
   - **Status:** Fallback in `frontend/src/services/firebase.js`.
   - **Action:** In the Google Cloud Console, verify that API Key `AIzaSy[REDACTED_CLIENT_KEY]` is restricted to authorized domains (`https://vayuorbit-b20b5.web.app`, `https://vayuorbit-b20b5.firebaseapp.com`, `http://localhost:*`) and that administrative APIs (Cloud SQL, Compute Engine, Secret Manager) are blocked from client key usage. Remove the hardcoded fallback from source code prior to any publication.
3. **JWT Secret Key:**
   - **Status:** Default string in `backend/auth.py`.
   - **Action:** Do not rely on default fallback strings. Ensure cloud environments (Cloud Run, Render) inject a cryptographically random 64-character secret via `VAYU_JWT_SECRET`.

---

## 12. Remaining Blockers

1. **Legal Authorization Gate:** Formal written consent from Lead Author Rudra Narayan Mishra is legally required prior to any public repository publication.
2. **Historical Git Scrubbing in `vayu_orbit_repo`:** Commit `43bdf7d3` in `vayu_orbit_repo` contains `military_logistics.db`. Before making `vayu_orbit_repo` public (if ever authorized), Git history must be purged of `military_logistics.db` using `git-filter-repo` or BFG Repo-Cleaner.
3. **Parent Git Root Isolation:** The parent directory `c:\Users\mishr\OneDrive\Desktop\CMS\programme` must not be initialized with Git, and operations must target the dedicated repository `vayu_orbit_repo` exclusively.
4. **Hardcoded Fallback Removal:** Remove `AIzaSy[REDACTED_CLIENT_KEY]` fallback from `frontend/src/services/firebase.js` so configuration is supplied strictly via environment variables.

---

## 13. Final Publication-Readiness Verdict

### **BLOCKED — BOTH SECURITY AND AUTHORISATION**

**Verdict Rationales:**
1. **Security & Repository Hygiene:** The active operational database (`military_logistics.db`) was previously committed to GitHub history in `vayu_orbit_repo`, local `.env.local` contains an active TomTom API key in the parent workspace, and `frontend/src/services/firebase.js` contains a hardcoded fallback client key.
2. **Legal & Institutional Authorization:** `AUTHORIZED_USE.md` and `AUTHORIZATION.md` explicitly prohibit public repository hosting and web distribution without signed, written authorization.

**Permitted Next Step:** The codebase is ready for **Restricted Private Repository Review** strictly between authorized student authors and academic faculty mentors once repository hygiene and git-root isolation steps are reviewed.

---
*VAYU ORBIT Academic Release Package | Security & Audit Review | November 2026*
