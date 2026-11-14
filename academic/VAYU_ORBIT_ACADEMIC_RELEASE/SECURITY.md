# Security Policy & Deployment Safeguards

```
================================================================================
  PROJECT: VAYU ORBIT (Military Logistics Convoy Decision-Support System)
  VERSION: 6.0.0 (Academic Release) | Problem Statement: PDS-3
  SECURITY LEVEL: Academic Research Prototype | OPSEC Strict Compliance
================================================================================
```

---

## 1. Security Architecture & Threat Model

VAYU ORBIT has been engineered with defensive depth to prevent common web application vulnerabilities, data leakage, and unauthorized operational commands.

### Core Security Controls:
1. **Cryptographic Authentication:**
   - Password hashing utilizes `bcrypt` with unique auto-generated per-user salt. Plaintext passwords are never persisted.
   - Authentication tokens are signed using HMAC-SHA256 (`HS256`) JSON Web Tokens (JWT) with 24-hour expiration.
   - Secret signing key is environment-driven (`VAYU_JWT_SECRET`).
2. **Role-Based Access Control (RBAC):**
   - Fine-grained role enforcement at API endpoint boundaries (`require_role` middleware).
   - Roles include: `commander` (highest privilege, readiness overrides), `coordinator` (journey creation, dispatch, ROP entry), `dispatcher` (vehicle assignment), and `analyst` (read-only telemetry).
3. **Cross-Origin Resource Sharing (CORS):**
   - Explicit HTTPS origin whitelisting via `CORS_ORIGINS`.
   - **Wildcard CORS (`*`) with credentials is explicitly prohibited.**
4. **SQL Injection Immunity:**
   - Relational database queries use parameterized SQL prepared statements (`query(sql, args)` / `c.execute(sql, args)`). Zero string interpolation or unsanitized dynamic SQL.
5. **Path Traversal & Filesystem Hardening:**
   - Database paths are sanitized and resolved using `os.path.abspath`. Diagnostic endpoints expose only cryptographic SHA-256 hashes of canonical paths, never internal directory structures.
6. **No Debug Stack Traces in Production:**
   - Unhandled server exceptions are intercepted by middleware and returned as sanitized JSON error payloads, preventing exposure of internal file paths or stack traces.

---

## 2. Secrets Management & Environment Hygiene

- **Zero Hardcoded Secrets:** No API keys, database credentials, or private cryptographic keys are hardcoded in source code or frontend client bundles.
- **Git Repository Audit:** Git history has been verified. Real secrets are strictly excluded via `.gitignore`.
- **Environment Templates:** Production and local development environments use safe placeholder templates:
  - `frontend/.env.example`
  - `frontend/.env.production.example`
  - `backend/.env.production.example`
- **TomTom Maps API Safeguards:**
  - When utilizing a TomTom Maps API key in public deployments, the key should be restricted in the TomTom Developer Console to the specific HTTP Referer domain (e.g. `https://vayu-orbit.vercel.app/*`).
  - If no TomTom key is provided, the application engages its built-in offline vector canvas with zero loss of features.

---

## 3. Operational Security (OPSEC) & Academic Simulation Boundaries

> [!IMPORTANT]
> **ACADEMIC SIMULATION DISCLAIMER:**
> VAYU ORBIT is strictly an academic prototype for educational evaluation under Problem Statement PDS-3.
> 
> - **NO Classified Military Data:** The system contains **ZERO** classified information, real armed forces operational orders, encrypted military communications, or actual tactical assets.
> - **Synthetic Geographic Nodes:** All 116 military stations, transit camps, and logistics bases are generalized representations derived from public geographical landmarks or synthetic simulation coordinates.
> - **Zero Real GPS Tracking:** The application does not interface with live military transponders or real vehicle GPS units. Convoy movement is simulated mathematically.
> - **NOT an Operational Command System:** This software must never be used for real-world life-critical troop movement or military navigation.

---

## 4. Reporting Security Vulnerabilities

If you discover a potential security vulnerability in the VAYU ORBIT academic release package, please contact the primary author directly:

- **Lead Developer & Rights Holder:** Rudra Narayan Mishra
- **Department:** School of Computer Science & Engineering, Lovely Professional University
- **Repository Reference:** `https://github.com/RudraNarayanMishra2142/Vayu-Orbit.git`

Please do not disclose potential security issues publicly or on public issue trackers until the issue has been reviewed and addressed.
