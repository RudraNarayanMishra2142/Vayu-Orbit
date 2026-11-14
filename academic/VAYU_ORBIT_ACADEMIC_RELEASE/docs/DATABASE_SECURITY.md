# VAYU ORBIT v6.0.0 — Database Security Architecture & Threat Model
**Document ID:** VAYU-DOC-SEC-006  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Cloud SQL PostgreSQL Hardening, Least Privilege, Encryption & Zero-Trust Defense  
**Date:** November 15, 2026  
**Target Environment:** Cloud SQL for PostgreSQL / Firebase SQL Connect (`vayuorbit-b20b5`)  

---

## 1. Zero-Trust Relational Security Principles

In transitioning from local SQLite files to networked PostgreSQL on Google Cloud SQL, VAYU ORBIT enforces a defense-in-depth model that protects military convoy decision-support data across all runtime boundaries:

```
+-----------------------------------------------------------------------------------------+
| LAYER 1: Network & Boundary Hardening (Private VPC / Authorized Origins)                |
| - Cloud SQL configured with Private IP within Google Cloud Virtual Private Cloud (VPC)  |
| - Public IP disabled or strictly whitelisted to Cloud Run egress static IPs            |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 2: Transport Layer Security (mTLS / Cloud SQL Connector)                          |
| - 100% of network traffic encrypted via TLS 1.3                                          |
| - Ephemeral client certificates auto-generated and rotated hourly by Cloud SQL Connector|
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 3: Least-Privilege Identity & IAM Access Control                                 |
| - Application connects as unprivileged user: vayu_app_user (DML-only: SELECT, INSERT...) |
| - Cloud Run utilizes Workload Identity / Service Account with Cloud SQL Client role     |
| - Root/admin superuser (postgres) strictly barred from application runtime pools        |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 4: Application Layer Defense & Parameterization                                   |
| - 100% parameterized SQL queries (%s) preventing SQL injection                         |
| - Strict Pydantic v2 input validation sanitizing payloads prior to SQL translation      |
| - Database exceptions masked: internal queries and connection URLs never returned in HTTP|
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
| LAYER 5: Sovereign Authoritative RBAC & Segregation of Duties                           |
| - users.role enforced on backend for every operational route                             |
| - Fuel departure gate permanently blocks unauthorized overrides                         |
| - Separation of duties: ROP report authors strictly barred from reviewing their reports |
| - Dual audit logs: audit_log (operational actions) + audit_events (state change diffs)  |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Threat Modeling & Mitigation Matrix

| Threat Category | Attack Vector | Mitigation in VAYU ORBIT PostgreSQL Architecture |
|---|---|---|
| **SQL Injection** | Adversary inputs malicious SQL in SITREP text, vehicle callsigns, or search terms. | Parameterized query execution (`db_adapter.py` / `psycopg`). Parameters are transmitted separately from query AST. Zero dynamic string concatenation for SQL values. |
| **Credential Theft** | Leaked database passwords via source code, logs, or environment dumping. | Google Cloud Workload Identity eliminates static passwords. Zero credentials in Git repositories. `password_hash` in `users` table uses salted PBKDF2-SHA256 and is never returned in API payloads. |
| **Eavesdropping / Wiretapping** | Man-in-the-middle sniffing of convoy telemetry between Cloud Run and Cloud SQL. | Enforced SSL/TLS 1.3 with mutual certificate verification (mTLS) via Cloud SQL Python Connector. Unencrypted connections rejected at firewall boundary. |
| **Split-Brain Writes** | Accidental concurrent writes to SQLite and PostgreSQL during cutover or rollback. | Strict environment gating via `DATABASE_PROVIDER`. Documented fast-rollback protocol revokes write permissions before switching. |
| **Privilege Escalation** | Client sends modified JWT claim or HTTP body asserting `COORDINATOR` or `ADMIN`. | Sovereign database lookup in `get_current_user`: role is queried directly from authoritative `users` table. Client claims have zero effect. |
| **Information Disclosure** | Database error stack trace leaks schema details, connection strings, or query syntax. | FastAPI global exception handlers catch database errors and return generic, non-leaking HTTP 500 error messages with unique incident tracing UUIDs. |

---

## 3. Data Encryption at Rest & Key Management

- **Cloud SQL Storage Encryption:** Tables, indexes, logs, and automatic backups are encrypted using Google-managed 256-bit AES encryption (`AES-256`) or Customer-Managed Encryption Keys (CMEK) via Google Cloud KMS.
- **SQLite Baseline Backups:** Local forensic backups are stored with restricted POSIX file permissions (`0600`) accessible only by the service owner.

---

## 4. Immutable Audit Architecture

Every operational transaction altering mission state is logged to two specialized relational tables:
1. **`audit_log`:** High-speed operational timeline recording action type (`CREATE_JOURNEY`, `FUEL_OVERRIDE`, `ROP_SUBMIT`, `UPDATE_ROLE`), target entity, timestamp, and authenticated actor.
2. **`audit_events`:** Fine-grained governance audit capturing JSON diffs (`diff_json`), before/after state transitions, and actor identity attributes.

---

## 5. Zero Silent Fallback Policy (Stage 2 Hardening)

A critical security principle established during Stage 2 hardening is the **prohibition of silent SQLite fallback** when PostgreSQL is configured (`DATABASE_PROVIDER=postgresql`):

1. **Split-Brain Write Prevention:** If the backend quietly reverts to local SQLite whenever a PostgreSQL connection drops or times out, new mission transactions (convoy dispatches, fuel overrides, ROP approvals) are written to local disk while the rest of the cluster reads stale records from PostgreSQL.
2. **Fail-Fast Operational Visibility:** All database connection and transaction failures immediately raise `DatabaseConnectionError` or `DatabaseOperationalError` (returning clean HTTP 503 Service Unavailable / HTTP 500 without leaking connection URIs).
3. **Emergency Override Control:** Silent fallback is disabled by default. Fallback can only be enabled explicitly in emergency disaster-recovery runbooks via an intentional environment flag (`DATABASE_ALLOW_FALLBACK=true`).

---

## 6. Firebase SQL Connect Client Security & Defense-in-Depth

Firebase Data Connect (SQL Connect) enables client applications to issue GraphQL queries directly against PostgreSQL. However, in military command-and-control decision support systems, client direct database access presents severe authorization risks:

1. **Elimination of Client-Facing Mutations:**
   - The client-facing mutation `RecordAuditEvent` in `dataconnect/connector/mutations.gql` was **permanently removed**.
   - Allowing client browsers to generate audit log records directly allows adversarial spoofing of timestamps, actor IDs, or operational events.
   - **Enforced Policy:** 100% of database mutations and state transitions (journeys, checkpoints, fuel overrides, ROP submissions, audits) must be mediated by the FastAPI backend, where cryptographic JWT verification, sovereign user lookup, RBAC role checks, and server-side timestamping occur.
2. **Restriction of Client Connectors to Unprivileged Catalogs:**
   - Direct client GraphQL queries in `dataconnect/connector/queries.gql` are strictly restricted to public reference catalogs (`GetMilitaryNodes` and `GetVehicleCatalog`).
   - Sensitive operational datasets—such as active journeys, classified waypoints, ROP recon intelligence, fuel state, and user account directories—are completely barred from client Data Connect queries.
   - Client queries require authenticated identity (`@auth(level: USER)`) and execute with read-only database grants (`SELECT` on `places` and `vehicle_master` only).
