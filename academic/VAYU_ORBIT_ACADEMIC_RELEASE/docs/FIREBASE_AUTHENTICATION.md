# VAYU ORBIT — Firebase Authentication Specification
**Document ID:** VAYU-DOC-FBA-004  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Architecture:** Web SDK + Firebase Auth + FastAPI Firebase Admin SDK  
**Target Project:** `vayuorbit-b20b5`  
**Version:** 1.0.0 (v6.0.0-academic)  

---

## 1. Authentication Architecture Overview

VAYU ORBIT v6.0.0 integrates **Google Firebase Authentication** as its primary identity management platform while maintaining **Strict Local Role Governance** within its SQLite operational database:

```
+----------------------------------------------------------------------------------------------------+
|                                         CLIENT BROWSER (SPA)                                       |
+----------------------------------------------------------------------------------------------------+
  1. Operator enters Email & Password into Login.jsx
  2. Firebase Web SDK calls Firebase Auth (signInWithEmailAndPassword)
  3. Firebase returns Cryptographic ID Token (RS256 JWT, signed by Google Private Keys)
  4. Client attaches token to all outbound API calls:
       Authorization: Bearer <FIREBASE_ID_TOKEN>
       X-Firebase-AppCheck: <APP_CHECK_TOKEN>
                                     |
                                     v
+----------------------------------------------------------------------------------------------------+
|                                   FASTAPI APPLICATION BACKEND                                      |
+----------------------------------------------------------------------------------------------------+
  5. ASGI App Check Middleware validates caller/device authenticity (Layer 7 attestation)
  6. get_current_user Dependency intercepts Authorization header:
     a. Verifies Firebase ID Token using Firebase Admin SDK (firebase_admin.auth.verify_id_token)
     b. Validates project audience: aud == "vayuorbit-b20b5"
     c. Extracts external Firebase UID: uid and email
  7. Local Account Resolution (Database as Authoritative Source):
     a. SELECT * FROM users WHERE firebase_uid=? (or auto-links by email)
     b. Evaluates status: Blocks 'DISABLED' or 'PENDING_ROLE' accounts (403 Forbidden)
     c. Loads authoritative application role: CREATOR, CHECKPOINT_OPERATOR, COORDINATOR, ADMIN
  8. Role Dependency Enforcement: require_role(allowed_roles) executes business logic
```

---

## 2. Key Architectural Guarantees

1. **Zero Client-Side Trust:**
   - Role claims in client storage or request bodies are strictly ignored.
   - The SQLite database (`users` table) is the **exclusive, authoritative source** of operational permissions.
2. **Deterministic Role Hierarchy:**
   - `COORDINATOR` / `ADMIN`: Strategic command, convoy approval, fuel overrides, ROP review, audit access.
   - `CREATOR`: Journey planning, route drafting, convoy assembly.
   - `CHECKPOINT_OPERATOR`: Field reconnaissance, checkpoint event logging, ROP submissions.
3. **Deactivated Account Enforcement:**
   - If `status == 'DISABLED'`, all requests are immediately terminated with `HTTP 403 Forbidden`, regardless of whether Firebase has refreshed the client token.
4. **App Check Separation of Concerns:**
   - **Firebase App Check** proves *which client application* is calling the API.
   - **Firebase Authentication** proves *who the operator is*.
   - **FastAPI RBAC** proves *what operations that operator is authorized to perform*.

---

## 3. Client-Side Web SDK Integration

### 3.1 Authentication Service (`frontend/src/services/firebaseAuth.js`)
The client service encapsulates all Firebase Web SDK interactions:
- **Persistence:** Configured to `browserSessionPersistence` (operator session naturally clears when browser window or tab closes, adhering to defence workstation security guidelines).
- **Session Observer:** `subscribeToAuthChanges(callback)` listens via `onAuthStateChanged()`.
- **Token Acquisition:** `getFirebaseIdToken(forceRefresh)` retrieves active JWT; automatically refreshes when expired.
- **Password Recovery:** `resetPassword(email)` triggers secure dispatch via Firebase Auth email templates.

### 3.2 Request Interceptor (`frontend/src/services/api.js`)
All API calls transparently inject the current ID token:
```javascript
const token = await getFirebaseIdToken();
const headers = {
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {})
};
```
If a request returns `HTTP 401 Unauthorized`:
- Automatically triggers a one-time force refresh via `getFirebaseIdToken(true)`.
- If the retried request still returns 401, session is purged and user is redirected to the login interface.

---

## 4. Backend Admin SDK Integration (`backend/api.py` & `backend/auth.py`)

### 4.1 Token Verification Workflow
Incoming tokens are verified by `auth.verify_firebase_id_token(token)`:
```python
decoded = fb_auth.verify_id_token(token, check_revoked=False)
if decoded.get("aud") == "vayuorbit-b20b5":
    return {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
        "sub": decoded["sub"],
        "firebase": True
    }
```

### 4.2 Local Testing & Offline Verification
In non-production environments (`APP_ENV != 'production'`), deterministic offline test tokens signed with `TEST_TOKEN_SECRET` are accepted, enabling fast, isolated regression suites without live Google internet connectivity.

### 4.3 Controlled Legacy JWT Transition
To avoid operational downtime during migration:
- Legacy tokens are **strictly forbidden** in production (`APP_ENV=production`).
- In non-production testing, `verify_legacy_jwt` functions only if `VAYU_ALLOW_LEGACY_JWT='true'` is explicitly configured in the environment.

---

## 5. Administrative Account Governance Endpoints

Administrative personnel (`ROLE_COORDINATOR`) manage account states through dedicated REST endpoints:

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/users` | `GET` | `ROLE_COORDINATOR` | List all accounts, roles, statuses, and Firebase UIDs |
| `/api/auth/users/{user_id}/role` | `PUT` | `ROLE_COORDINATOR` | Promote or reassign operator role (`ROLE_ALL`) |
| `/api/auth/users/{user_id}/status` | `PUT` | `ROLE_COORDINATOR` | Set status to `ACTIVE`, `DISABLED`, or `PENDING_ROLE` |
| `/api/auth/session` | `POST` | Public | Establish session and set cookies from Firebase ID token |

All administrative status and role modifications are recorded in the structured immutable audit log.
