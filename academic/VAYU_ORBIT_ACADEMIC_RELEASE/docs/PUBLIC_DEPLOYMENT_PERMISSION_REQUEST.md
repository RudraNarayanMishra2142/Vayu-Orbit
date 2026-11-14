# FORMAL REQUEST FOR PUBLIC DEPLOYMENT & EVALUATION HOSTING AUTHORIZATION

```
================================================================================
  DOCUMENT REFERENCE : VO-PDS3-AUTH-REQ-2026-02 (REVISED)
  PROJECT NAME       : VAYU ORBIT (Military Logistics Convoy Decision-Support)
  ACADEMIC SCOPE     : Problem Statement PDS-3 | Capstone Engineering Evaluation
  INSTITUTION        : Lovely Professional University, Punjab, India
  ACADEMIC SESSION   : 2026–2027
================================================================================
```

---

## 1. Context & Purpose of Request

**VAYU ORBIT** has achieved the certified academic milestone **v6.0.0**. The software has undergone complete folder separation, cryptographic parity validation, 60/60 automated regression testing, security hardening, containerization, and production deployment preparation.

To enable remote viva-voce demonstration, external academic evaluation, educational conference presentation, and evaluator access without requiring evaluators to configure local Python/Node.js runtimes, this document formally requests authorization to deploy a live, publicly accessible demonstration of the application.

Under the binding provisions of [AUTHORIZATION.md](../AUTHORIZATION.md) and [AUTHORIZED_USE.md](../AUTHORIZED_USE.md), public hosting, public repository mirroring, and external service deployment are **STRICTLY PROHIBITED** until explicit, written authorization is executed by the designated legal and academic authorities.

---

## 2. Rigorous Governance & Authority Hierarchy

To ensure absolute compliance with academic integrity, copyright law, and university intellectual property policies, the responsibilities and legal boundaries of all involved entities are strictly demarcated:

| Category | Designated Entity | Identification & Department | Legal & Academic Authority Scope |
|---|---|---|---|
| **Software Lead Author & Primary Developer** | **Rudra Narayan Mishra** | Registration No: `12515636`<br>School of CSE, Lovely Professional University | Primary author of core architecture, algorithms, and models. Creator of original codebase. |
| **Software Co-Author & Contributor** | **Suryansh Kumar Singh** | Registration No: `12516274`<br>School of CSE, Lovely Professional University | Contributor to frontend presentation, UI components, and evaluation testing. |
| **Project Evaluator & Academic Supervisor** | **Er. Hitesh Kumar** | Assistant Professor<br>Department of CSE, Lovely Professional University | Academic evaluation authority. Validates coursework requirements, PDS-3 rubric adherence, and technical rigor. *Does NOT hold unilateral legal authority to waive university IPR or authorize public distribution.* |
| **Institutional Authority & Faculty Governance** | **Head of Department (HOD) / Dean of CSE** | School of Computer Science & Engineering<br>Lovely Professional University | Institutional legal entity governing coursework property, student academic conduct, university affiliation, and public use of institutional name/branding. |
| **Authorised Body for Public Release Approval** | **Joint Clearance Required:**<br>1. Primary Copyright Owner<br>2. Institutional Academic Authority | Student Lead + Head of Department (with Supervisor Concurrence) | **Mandatory Dual Sign-Off:** Unilateral sign-off by students or supervisor alone is legally and academically insufficient for university-affiliated public hosting. |

---

## 3. Mandatory Scope of Approval Required

Before any public deployment or external release may occur, written authorization must explicitly cover all six operational scopes:

### SCOPE 1: Public Frontend Hosting
- **Description:** Deploying compiled React 18 single-page application static assets (`HTML`, `JS`, `CSS`, vector artwork) to a public content delivery network (e.g., Vercel, Cloudflare Pages).
- **Security Control:** No API secrets or passwords embedded in frontend bundles; SPA fallback rewrites strictly enforced.

### SCOPE 2: Public Backend API Hosting
- **Description:** Deploying containerized FastAPI application runtime (Python 3.11) to a managed cloud container platform (e.g., Render, Railway).
- **Security Control:** Container healthchecks routed via unauthenticated `/healthz` probe; operational data endpoints strictly gated by JWT role authentication.

### SCOPE 3: Public Access to Academic Demonstration
- **Description:** Permitting external academic evaluators, grading committee members, and peer researchers to authenticate via demo accounts and execute simulated workflows.
- **Security Control:** Isolated cloud database volume (`/data/military_logistics.db`); production developer database air-gapped on local workstation.

### SCOPE 4: Public Source-Code Distribution
- **Description:** Making the Git repository (`https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git`) publicly visible or publishing a formal GitHub Release tag.
- **Security Control:** Verified clean Git history (zero committed secrets, `.env.local` excluded, `.gitignore` enforced).

### SCOPE 5: Project Branding & Institutional Attribution
- **Description:** Publicly displaying the name "VAYU ORBIT", Problem Statement reference "PDS-3", and attribution to Lovely Professional University.
- **Security Control:** Clear academic disclaimer indicating that the system is an educational simulation prototype, not an operational military command system.

### SCOPE 6: External Hosting & Third-Party API Integration
- **Description:** Connecting to external cloud infrastructure providers (Vercel, Render) and optional map services (TomTom Maps SDK).
- **Security Control:** Strict HTTP Referer restrictions on external map API keys; automatic fallback to internal vector canvas if external keys are disabled.

---

## 4. Operational Security (OPSEC) & Academic Simulation Boundaries

The deployment strictly enforces non-negotiable defence simulation safeguards:
1. **Zero Classified or Real Defence Data:** The application contains **NO** classified coordinates, operational defense data, real-world convoy movement orders, or sensitive military communications.
2. **Purely Synthetic Logistics Nodes:** All 116 military bases and logistics nodes correspond to generalized public highway references or synthetic simulation coordinates.
3. **Zero Real GPS Telemetry:** No interface with real GPS transponders or active vehicle telemetry.
4. **Single-Instance SQLite Persistence:** The backend is configured as a single worker process on a dedicated persistent disk, preventing multi-writer SQLite database corruption.
5. **Strict CORS Whitelist:** Wildcard CORS (`*`) with credentials is prohibited. Only the approved frontend HTTPS origin is permitted.

---

## 5. Formal Approval & Authorization Execution Block

> [!IMPORTANT]
> **LEGAL INSTRUCTION:**  
> Both signatories below must review and complete their respective blocks. Public deployment remains strictly blocked until both approvals are officially executed.

### 5.1 Primary Copyright Owner & Student Lead Approval
- **Name:** Rudra Narayan Mishra (Reg No: 12515636)
- **Decision:** `[  ] APPROVED` &nbsp;&nbsp;&nbsp;&nbsp; `[  ] WITHHELD` &nbsp;&nbsp;&nbsp;&nbsp; `[  ] PENDING MODIFICATIONS`
- **Authorized Scopes Approved:** *(e.g., Scopes 1, 2, 3, 5, 6)*: ___________________________
- **Conditions / Exclusions:** ___________________________________________________________
- **Signature:** ________________________________________________________________________
- **Date Signed:** ______________________________________________________________________

### 5.2 Faculty Project Supervisor Endorsement
- **Name:** Er. Hitesh Kumar (Assistant Professor, Dept of CSE, LPU)
- **Technical Clearance:** `[  ] RECOMMENDED` &nbsp;&nbsp;&nbsp;&nbsp; `[  ] NOT RECOMMENDED`
- **Supervisor Remarks:** ________________________________________________________________
- **Signature:** ________________________________________________________________________
- **Date Signed:** ______________________________________________________________________

### 5.3 Institutional Academic Authority Sign-Off
- **Name & Title:** _____________________________________________________________________
- **Designation:** Head of Department / Dean / Authorized Institutional Representative
- **Institution:** School of Computer Science & Engineering, Lovely Professional University
- **Institutional Decision:** `[  ] FORMALLY AUTHORIZED` &nbsp;&nbsp;&nbsp;&nbsp; `[  ] DENIED`
- **Official Institutional Stamp / Verification:** ________________________________________
- **Date Signed:** ______________________________________________________________________

---

## 6. Current Release Decision Status

```
================================================================================
  CURRENT AUTHORIZATION STATUS : PENDING INSTITUTIONAL & RIGHTS-HOLDER SIGN-OFF
  PUBLIC DEPLOYMENT GATE       : STRICTLY BLOCKED (Section 5 Incomplete)
  CODEBASE DEPLOYMENT STATE    : FULLY AUDITED, OPTIMISED & HARDENED LOCALLY
================================================================================
```

*Until all three blocks in Section 5 are recorded and verified, all public deployment actions, public GitHub pushes, and public domain hosting remain paused under academic release safeguards.*
