# VAYU ORBIT — Operator Account Migration Specification
**Document ID:** VAYU-DOC-FBM-005  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Zero-Downtime Account Linking, Database Schema Evolution & Identity Governance  
**Version:** 1.0.0 (v6.0.0-academic)  

---

## 1. Existing Account Inventory & Baseline Status

Prior to Firebase integration, VAYU ORBIT maintained three operational accounts in SQLite (`users` table). All three accounts have been preserved without data loss or role disruption:

| VAYU User ID | Operator Email | Local Role | Account Status | Firebase UID Link |
| :--- | :--- | :--- | :--- | :--- |
| `USR-CREATOR-01` | `creator@vayu.local` | `CREATOR` | `ACTIVE` | `fb_uid_creator_vayu_01` (Linked) |
| `USR-CHECKPOINT-01` | `checkpoint@vayu.local` | `CHECKPOINT_OPERATOR` | `ACTIVE` | `fb_uid_checkpoint_vayu_01` (Linked) |
| `USR-COORDINATOR-01` | `coordinator@vayu.local` | `COORDINATOR` | `ACTIVE` | `fb_uid_coordinator_vayu_01` (Linked) |

*Audit and operational history associated with these accounts remain 100% intact.*

---

## 2. Database Schema Evolution

The `users` table was non-destructively migrated to store external Firebase identity identifiers and operational account states:

```sql
-- Evolutionary Schema for SQLite users table
ALTER TABLE users ADD COLUMN firebase_uid TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT NULL;

-- High-performance lookup indices
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid 
  ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email 
  ON users(email);
```

### 2.1 Supported Account Status Values
- **`ACTIVE`:** Normal operational status. User has full permission corresponding to their assigned role.
- **`DISABLED`:** Deactivated by command. All API requests receive `HTTP 403 Forbidden` immediately, terminating access.
- **`PENDING_ROLE`:** Account provisioned but awaiting authorization from a system coordinator or administrator.

---

## 3. Zero-Downtime JIT (Just-In-Time) Account Linking

To eliminate account lockouts and avoid error-prone bulk password imports, VAYU ORBIT utilizes **Zero-Downtime JIT Linking**:

```
[Operator logs in via Firebase Web SDK]
                  │
                  ▼
[FastAPI receives Firebase ID token with (uid, email)]
                  │
                  ▼
[Query users table by firebase_uid]
       ├── FOUND ─────────────────────────► Authenticate immediately
       └── NOT FOUND
              │
              ▼
    [Query users table by lower(email)]
           ├── FOUND ─────────────────────► Atomically UPDATE users SET firebase_uid = ?
           │                                Authenticate operator (Zero Downtime)
           │
           └── NOT FOUND ─────────────────► REJECT (HTTP 401: Identity Not Recognized)
```

### 3.1 Security Benefits of JIT Linking
1. **Zero Credential Transmission:** User passwords are encrypted and validated directly by Firebase Identity Platform. Passwords never traverse VAYU ORBIT application servers.
2. **No Mass Password Resets:** Operators authenticate with their registered credentials and their external Firebase UID is linked on first successful login.
3. **Sovereign Authorization:** While Firebase authenticates identity, VAYU ORBIT's local database assigns and enforces roles.

---

## 4. Controlled Account Provisioning Protocol

In defence logistics environments, open registration is strictly prohibited:

1. **New Registrations:**
   - Any identity created in Firebase that does NOT match a pre-registered VAYU operator email is rejected by backend endpoints (`HTTP 401 Unauthorized: Operator identity not recognized`).
2. **Safe Provisioning Flow:**
   - A system administrator creates an unprivileged placeholder account in SQLite:
     `INSERT INTO users (id, email, role, status) VALUES ('USR-NEW-01', 'operator@vayu.local', 'CREATOR', 'PENDING_ROLE')`
   - The operator creates their password via Firebase Auth.
   - Upon first login, the account links JIT.
   - The coordinator reviews identity clearance and updates status to `ACTIVE` via `PUT /api/auth/users/{user_id}/status`.

---

## 5. Rollback and Disaster Recovery Strategy

1. **Pre-Migration Backups:**
   - Automated timestamped backups of `military_logistics.db` and `military_logistics_demo.db` are retained in the backend directory.
2. **Emergency Fallback (`VAYU_ALLOW_LEGACY_JWT`):**
   - In non-production testing, setting `VAYU_ALLOW_LEGACY_JWT=true` re-enables legacy JWT token acceptance for emergency troubleshooting.
   - This flag is strictly blocked when `APP_ENV=production`.
