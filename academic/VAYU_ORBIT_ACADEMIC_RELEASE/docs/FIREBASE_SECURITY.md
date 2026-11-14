# VAYU ORBIT — Firebase Security Architecture & Threat Model
**Document ID:** VAYU-DOC-FBS-003  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Zero-Trust Client Attestation, App Check, CORS & Defence-in-Depth  
**Version:** 1.0.0 (v6.0.0-academic)  

---

## 1. Zero-Trust Security Model

VAYU ORBIT employs a multi-tiered defence-in-depth security model designed to safeguard sensitive military logistics workflows even when deployed onto public cloud infrastructure:

```
+-----------------------------------------------------------------------------------------+
|                                    INCOMING TRAFFIC                                     |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 1: Transport Layer Security (TLS 1.3)                                            |
| - Enforced by Google Cloud Front End (GFE) & Firebase Global CDN                        |
| - Automated SSL/TLS certificate rotation                                                |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 2: Origin Hardening (CORS Policy)                                                 |
| - Strictly restricts browser origins:                                                   |
|   https://vayuorbit-b20b5.web.app                                                       |
|   https://vayuorbit-b20b5.firebaseapp.com                                               |
| - Whitelists headers: Authorization, Content-Type, X-Firebase-AppCheck                  |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 3: Client Device Attestation (Firebase App Check)                                 |
| - Header: X-Firebase-AppCheck                                                           |
| - Validates that the request originates from genuine VAYU ORBIT client code             |
| - Attested via reCAPTCHA v3 / Enterprise / Debug Token Provider                         |
| - Verified on backend via Firebase Admin SDK (firebase_admin.app_check.verify_token)    |
| - Health probes (/healthz, /health) and CORS OPTIONS exempt                             |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 4: User Identity Authentication (Firebase Authentication ID Token)               |
| - Header: Authorization: Bearer <FIREBASE_ID_TOKEN>                                     |
| - Verified cryptographically via Firebase Admin SDK (firebase_admin.auth.verify_id_token)|
| - Validates RS256 signature, expiry (exp), project audience (vayuorbit-b20b5)           |
| - Extracts verified Subject (Firebase UID) and verified Email                           |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 5: Sovereign Authorization & Identity Resolution (Local SQLite Authority)         |
| - Resolves Firebase UID or Email to local VAYU user record in military_logistics.db     |
| - Performs Zero-Downtime Just-In-Time (JIT) UID linking for existing military personnel |
| - Checks user status: rejects DISABLED (403) and PENDING_ROLE (403)                     |
| - Retrieves authoritative local role (CREATOR, CHECKPOINT_OPERATOR, COORDINATOR, ADMIN) |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 6: Operational Authorization & Segregation of Duties (Deterministic RBAC)         |
| - Role verification: require_role(allowed_roles) enforced per FastAPI endpoint          |
| - Fuel departure gate: prevents dispatch when fuel requirements exceed capacity         |
| - Coordinator override: strictly restricted to ROLE_COORDINATOR with rationale audit     |
| - Separation of duties: ROP report authors CANNOT review or approve their own reports    |
| - Immutable audit trail: every security-sensitive action recorded in audit_logs         |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Firebase App Check Architecture

### 2.1 Why App Check?
Traditional API backends face risks from credential stuffing, unauthorized scrapers, and forged HTTP clients using stolen API keys. 

Firebase App Check solves this problem by validating the **client device and application authenticity** before backend endpoints process requests. Even if an adversary intercepts an API URL, they cannot invoke backend endpoints unless their client passes cryptographic attestation.

### 2.2 Client-Side Integration (`frontend/src/services/firebase.js`)
On frontend bootstrap, Firebase App Check initializes using `initializeAppCheck`:
- In development/testing environments, it leverages `CustomProvider` or debug tokens.
- In production, it connects to Google reCAPTCHA v3 or reCAPTCHA Enterprise.
- Tokens are cached automatically and refreshed before expiration.

In `frontend/src/services/api.js`, every outgoing API request injects the attestation header:
```javascript
const appCheckToken = await getAppCheckToken();
if (appCheckToken) {
  headers['X-Firebase-AppCheck'] = appCheckToken;
}
```

### 2.3 Backend Verification Middleware (`backend/api.py`)
Incoming requests pass through an ASGI middleware that handles App Check verification:

```python
# Mode selection via environment variable:
# FIREBASE_APP_CHECK_MODE = "disabled" | "audit" | "enforced"
```

1. **Exemptions:**
   - Pre-flight `OPTIONS` requests (to satisfy standard CORS specifications).
   - Health probes (`/healthz`, `/health`) to allow Google Cloud Run container orchestrators to probe health without credentials.
   - Interactive OpenAPI documentation (`/docs`, `/openapi.json`, `/redoc`).
2. **Verification Logic:**
   - Extracts `X-Firebase-AppCheck` header.
   - Verifies the cryptographic signature using `firebase_admin.app_check.verify_token(token)`.
   - In `audit` mode: logs attestation failures to structured telemetry without interrupting legitimate traffic.
   - In `enforced` mode: returns HTTP 401 Unauthorized if token is missing or invalid.

---

## 3. Firebase Authentication & Sovereign Identity Governance

### 3.1 Zero Client-Side Trust (Strict Authoritative Backend RBAC)
In traditional insecure architectures, client applications include roles inside tokens or claim payloads, or backend endpoints trust roles submitted in HTTP bodies.

**In VAYU ORBIT, client-asserted roles and token claims are NEVER trusted for authorization:**
1. The client presents ONLY the Firebase ID token in `Authorization: Bearer <ID_TOKEN>`.
2. The FastAPI backend verifies the cryptographic signature of the token against Google Identity Platform public keys (RS256).
3. The backend extracts `sub` (Firebase UID) and `email`.
4. The backend queries the sovereign SQLite database (`users` table) using `firebase_uid` (indexed) or `email`.
5. **The role assigned in the local database (`users.role`) is the sole authoritative permission set.** Any custom claim or client attempt to spoof `COORDINATOR` or `ADMIN` has zero effect.
6. If the account status is `DISABLED` or `PENDING_ROLE`, the backend returns HTTP 403 Forbidden with clear, non-leaking diagnostic messaging.

### 3.2 Zero-Downtime Just-In-Time (JIT) UID Linking
To migrate existing personnel without downtime or manual key synchronization:
- When a user logs in via Firebase for the first time, their `users.firebase_uid` may be `NULL`.
- The backend matches their verified Firebase email against `users.email`.
- Upon successful email match, the backend automatically sets `users.firebase_uid = fb_uid` within an ACID transaction and emits an audit record.
- Subsequent requests resolve immediately via the high-speed index `idx_users_firebase_uid`.

### 3.3 Credential Stuffing & Brute Force Defense
- **Firebase Auth Managed Rate-Limiting:** Google Identity Platform automatically blocks brute-force credential stuffing attempts at the edge before requests reach the FastAPI backend.
- **Layered Device Attestation:** When App Check is enabled, automated bot attacks and headless credential stuffers are terminated at the App Check middleware boundary (Layer 3) before password validation can even occur.
- **Transient Session Memory:** Frontend stores Firebase Auth state in `browserSessionPersistence` (cleared automatically when the browser tab closes), preventing token leakage on shared military workstation terminals.

### 3.4 Controlled Legacy JWT Deprecation
To facilitate backwards compatibility during multi-stage migration:
- `backend/auth.py` contains `verify_legacy_jwt()`.
- Legacy JWT validation is guarded by `VAYU_ALLOW_LEGACY_JWT` environment variable.
- In production (`APP_ENV=production`), legacy JWT acceptance is **STRICTLY FORBIDDEN** unless explicitly enabled with administrative audit clearance.

---

## 4. Separation of Public vs Private Credentials

A paramount security principle in VAYU ORBIT is the absolute separation between **Public Client Descriptors** and **Private Administrative Credentials**:

| Credential Class | Examples | Target Location | Security Posture |
| :--- | :--- | :--- | :--- |
| **Public Client Config** | `apiKey`, `projectId: "vayuorbit-b20b5"`, `appId`, `measurementId` | Frontend bundle (`firebase.js`) | **PUBLIC BY DESIGN** — Google Firebase explicitly designs these values to be embedded in public client web applications. They identify the project but grant NO administrative access. |
| **Private Admin Credentials** | Google Cloud Service Account JSON (`client_email`, `private_key`) | Secret Manager / Container IAM | **STRICTLY CONFIDENTIAL** — Grants full administrative rights. Must NEVER be placed in Git repositories, frontend code, or public documentation. |
| **App Check Secret Keys** | reCAPTCHA Secret Key, Debug Attestation Secrets | Secret Manager | Restricted to backend environment. |
| **Application Secrets** | `SECRET_KEY` (JWT signing secret), Database encryption keys | Secret Manager | Restricted to backend runtime. |

---

## 5. Operational Security (OPSEC) for Defence Contexts

When operating in environments subject to defence security directives:

1. **No External Telemetry Leakage:**
   - When running in sovereign air-gapped environments, set `FIREBASE_APP_CHECK_MODE=disabled`.
   - This ensures the application makes zero network calls to external Google or reCAPTCHA endpoints.
2. **Audit Logging:**
   - All App Check rejections in `audit` and `enforced` modes are captured with client IP, timestamp, and path in backend structured logs.
3. **Session Revocation:**
   - Changing `SECRET_KEY` immediately invalidates all active user sessions globally.

---

## 6. Security Checklist Prior to Public Exposure

Before any public deployment:
- [x] Backend Dockerfile configured with unprivileged non-root user (`appuser`).
- [x] CORS origins restricted to approved production domains.
- [x] Health check probes tested and confirmed functional without credentials.
- [x] Zero real military credentials or cleartext passwords stored in source code.
- [x] Demo accounts use clearly designated non-production synthetic passwords.
- [x] Formal rights-holder authorization obtained.
