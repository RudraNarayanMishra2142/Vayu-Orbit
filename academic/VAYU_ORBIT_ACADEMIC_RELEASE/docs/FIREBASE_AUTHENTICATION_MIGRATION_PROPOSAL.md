# VAYU ORBIT — Firebase Authentication Migration Proposal
**Document ID:** VAYU-DOC-FBP-001  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Status:** PROPOSAL / EVALUATION ONLY — IMPLEMENTATION NOT RECOMMENDED AT CURRENT STAGE  
**Version:** 1.0.0 (v6.0.0-academic)  

---

## 1. Executive Summary & Architectural Decision

### 1.1 Current Architecture: Custom JWT & SQLite RBAC
VAYU ORBIT currently utilizes a self-contained, air-gap capable authentication system based on HMAC-SHA256 JSON Web Tokens (PyJWT) and `argon2` / salted SHA-256 password hashing stored locally in SQLite (`users` table). 

Key characteristics of current system:
- **Zero External Dependencies:** Completely functional in offline, tactical, or air-gapped server environments.
- **Role-Based Access Control (RBAC):** Five deterministic operational roles:
  - `COMMANDER` (Strategic command, full override, high-level operational approval)
  - `COORDINATOR` (Planning, dispatch, route approval, roster management)
  - `DRIVER` (Execution telemetry, mobile status reporting, checkpoint check-in)
  - `MONITOR` (Read-only real-time situation map, alerts, asset tracking)
  - `ADMIN` (User administration, system audit logs, maintenance)
- **Local Credential Storage:** User identity, hashed secrets, roles, military designations, and active sessions reside within the local database.

### 1.2 Decision: Retain Existing JWT Authentication
**Recommendation:** **DO NOT MIGRATE TO FIREBASE AUTHENTICATION AT THIS TIME.**  
The current custom JWT authentication system must be preserved intact.

**Rationale:**
1. **Defence Operational Autonomy (Air-Gap Constraint):** External identity providers (Google Identity / Firebase Auth) require constant internet connectivity to Google servers for token issuance, revocation, and JWKS public key rotation. Military logistics systems must maintain operational capability during network isolation or EW (Electronic Warfare) degraded connectivity.
2. **Deterministic Role Governance:** VAYU ORBIT's authorization logic is strictly coupled with domain models (e.g., driver license verification, unit hierarchy, convoy commander delegations). Externalizing user credentials to Firebase adds operational complexity without enhancing local authorization precision.
3. **Synergy with App Check:** Firebase App Check operates at Layer 7 (device and caller attestation) independently of Layer 7 user identity. App Check successfully verifies that API traffic originates from genuine VAYU ORBIT web client instances (`vayuorbit-b20b5.web.app`) without touching or perturbing user authentication.

---

## 2. Technical Comparison Matrix

| Evaluation Dimension | Current VAYU ORBIT JWT | Firebase Authentication |
| :--- | :--- | :--- |
| **Hosting Topology** | Local FastAPI / SQLite | Google Cloud Managed Service |
| **Offline / Air-Gap Capability** | Full (100% offline functional) | None (Requires Google OAuth2 endpoints) |
| **Identity Verification** | Internal argon2/SHA-256 hash | Google Identity / Email / SAML / OIDC |
| **Authorization / RBAC** | SQLite `users.role` + FastAPI Depends | Custom Claims in Firebase ID Token |
| **Session Control** | 60-minute JWT with manual revocation | 60-minute ID token + Refresh Token rotation |
| **Credential Ownership** | Controlled on local sovereign server | Stored in Google Identity Platform |
| **Third-Party Dependency** | None | Google Cloud IAM & Billing |
| **MFA Support** | Software TOTP planned (Phase 2) | Built-in SMS / TOTP / WebAuthn |

---

## 3. Comprehensive Migration Blueprint (For Future Enterprise Cloud Rollout)

Should leadership mandate a migration to Google Cloud Identity Platform / Firebase Auth in a future public cloud release, the following architecture must be followed:

### 3.1 User Migration Strategy
Firebase Auth does not allow bulk import of raw passwords without specific hash algorithms (SCRYPT, BCRYPT, or PBKDF2). Since VAYU ORBIT utilizes local SHA-256 with per-user salt and Argon2, two migration patterns exist:

1. **Lazy / Just-In-Time (JIT) Migration (Zero-Downtime, Recommended):**
   - User logs in via the existing `/api/auth/login` endpoint.
   - FastAPI verifies credentials against local SQLite database.
   - Upon successful verification, backend calls `firebase_admin.auth.create_user()` or `update_user()`, provisioning the user in Firebase with matching email and password.
   - User custom claims (`role`, `military_id`, `unit`) are injected immediately via `auth.set_custom_user_claims(uid, claims)`.
   - SQLite record is flagged `migrated_to_firebase = 1`.
   - Subsequent logins transition to Firebase Client SDK `signInWithEmailAndPassword()`.

2. **Bulk CLI Migration (Requires Password Reset):**
   - Export SQLite `users` table without password hashes.
   - Use Firebase Admin SDK CLI (`firebase auth:import users.json`) to bulk-create accounts.
   - Trigger automated password-reset emails to all personnel.

### 3.2 Role Mapping via Firebase Custom Claims
Firebase ID tokens contain a JSON payload that can include up to 1,000 bytes of custom attributes. Roles would be mapped directly into custom claims:

```json
{
  "uid": "usr_c4f82e1a",
  "email": "coordinator@vayuorbit.mil",
  "role": "COORDINATOR",
  "military_id": "MIL-7741",
  "unit_code": "LOG-CORPS-04",
  "iss": "https://securetoken.google.com/vayuorbit-b20b5",
  "aud": "vayuorbit-b20b5"
}
```

Backend mapping helper:
```python
# Future Firebase Claims Setter
from firebase_admin import auth

def assign_vayu_claims(uid: str, role: str, military_id: str):
    claims = {
        "role": role,
        "military_id": military_id,
        "vayu_version": "6.0.0"
    }
    auth.set_custom_user_claims(uid, claims)
```

### 3.3 Backend API Modifications
FastAPI dependency injection (`get_current_user`) would transition from local JWT decoding to Firebase Admin token verification:

```python
# Target Dependency Implementation (IF MIGRATED)
from firebase_admin import auth
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_current_firebase_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    id_token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        return {
            "uid": decoded_token["uid"],
            "email": decoded_token.get("email"),
            "role": decoded_token.get("role", "MONITOR"),
            "military_id": decoded_token.get("military_id")
        }
    except auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token has been revoked")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase ID token: {str(e)}")
```

### 3.4 Frontend Client SDK Modifications
The React application would replace direct `fetch('/api/auth/login')` calls with the Firebase Auth SDK:

```javascript
// frontend/src/services/auth.js (Target Concept)
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseApp } from "./firebase";

const auth = getAuth(firebaseApp);

export async function loginWithFirebase(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await userCredential.user.getIdToken();
  const idTokenResult = await userCredential.user.getIdTokenResult();
  
  return {
    token: idToken,
    user: {
      email: userCredential.user.email,
      role: idTokenResult.claims.role || 'MONITOR',
      uid: userCredential.user.uid
    }
  };
}
```

---

## 4. Rollback and Disaster Recovery Strategy

If an organization begins migration to Firebase Auth and encounters service degradation, API rate limits, or lost connectivity, the following rollback procedure is defined:

1. **Dual-Token Support During Transition:**
   - The backend `get_current_user` inspects the `iss` (issuer) claim of incoming tokens.
   - If `iss` matches `https://securetoken.google.com/vayuorbit-b20b5`, verify via Firebase Admin SDK.
   - If `iss` matches `vayu-orbit-auth-srv` (local issuer), verify via internal HMAC-SHA256 secret.
2. **Instant Reversion Switch (`AUTH_PROVIDER` Environment Variable):**
   - Setting `AUTH_PROVIDER=LOCAL` in backend container environment bypasses Firebase Auth verification immediately.
   - Frontend falls back to local `/api/auth/login` endpoint without code changes.
3. **Database Audit Synchronization:**
   - Every login event continues to record in SQLite `audit_logs` regardless of authentication provider.

---

## 5. Security & Governance Review

| Risk Factor | Assessment | Mitigation |
| :--- | :--- | :--- |
| **Vendor Lock-In** | High | Abstract auth logic behind `AuthService` interfaces in both frontend and backend. |
| **Compliance with Defence Directives** | Non-compliant for classified deployments | Maintain strict separation between Academic/Unclassified demo instances and sovereign air-gapped instances. |
| **Credential Sniffing** | Negligible | All communications protected by TLS 1.3 + Firebase App Check device attestation. |

---

## 6. Conclusion
Retaining VAYU ORBIT's native JWT authentication while layering Firebase App Check at the perimeter provides the optimal architectural balance:
1. **Device/Client Attestation** via Firebase App Check protects APIs from scrapers, bots, and unauthorized clients.
2. **Zero-Trust User Authorization** via native JWT ensures deterministic role enforcement and complete independence from third-party identity outages.
