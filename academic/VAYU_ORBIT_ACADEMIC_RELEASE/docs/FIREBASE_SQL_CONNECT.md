# VAYU ORBIT v6.0.0 — Firebase SQL Connect / Data Connect Specification
**Document ID:** VAYU-DOC-FSC-003  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Firebase Data Connect (SQL Connect) Configuration, GraphQL Schemas & Cloud SQL Integration  
**Date:** November 15, 2026  
**Target Environment:** Firebase Data Connect (`vayu-orbit-service`) + Cloud SQL PostgreSQL (`vayuorbit-b20b5`)  
**Deployment Status:** **PENDING USER AUTHORISATION & BILLING APPROVAL** (Local Configuration Only)  

---

## 1. Overview & Architectural Role

Firebase Data Connect (internally known as **Firebase SQL Connect**) provides a declarative, managed bridge between Google Firebase and Cloud SQL for PostgreSQL. 

In VAYU ORBIT v6.0.0, Firebase SQL Connect is configured to:
1. Model the operational relational database using standard GraphQL SDL schemas (`schema.gql`).
2. Provide managed PostgreSQL schema evolution with `schemaValidation: "COMPATIBLE"`.
3. Expose strongly typed client SDK generation for future web/mobile dashboard telemetry.
4. **Preserve FastAPI as the Central Operational Authority:** Crucially, operational decision-making (VORAM scoring, fuel departure gate verification, coordinator override auditing, ROP review separation of duties) remains strictly mediated by the FastAPI backend. Direct, unmediated client mutations to sensitive operational tables are disallowed.

---

## 2. Local Configuration Structure

All Firebase SQL Connect resources are staged in the `dataconnect/` root directory:

```
academic/VAYU_ORBIT_ACADEMIC_RELEASE/
|-- dataconnect/
|   |-- dataconnect.yaml         # Service specification, region, datasource binding
|   |-- schema/
|   |   `-- schema.gql           # 18-table GraphQL relational schema definitions
|   `-- connector/
|       |-- connector.yaml       # Connector metadata & client SDK generator config
|       |-- queries.gql          # Curated telemetry & catalog query operations
|       `-- mutations.gql        # Controlled administrative mutation operations
|-- firebase.json                # Declares "dataconnect": { "source": "dataconnect" }
`-- .firebaserc                  # Target project: "vayuorbit-b20b5"
```

---

## 3. Service Specification (`dataconnect.yaml`)

```yaml
specVersion: "v1beta"
serviceId: "vayu-orbit-service"
location: "asia-south1"
schema:
  source: "./schema"
  datasource:
    postgresql:
      database: "vayu_orbit_db"
      cloudSql:
        instanceId: "vayu-orbit-sql"
      schemaValidation: "COMPATIBLE"
connectorDirs: ["./connector"]
```

### Key Parameters:
- **`serviceId: "vayu-orbit-service"`:** Unique identifier for the Data Connect service in `vayuorbit-b20b5`.
- **`location: "asia-south1"`:** Deploys in the Mumbai/India region, co-located with Cloud Run for minimal network transit latency.
- **`database: "vayu_orbit_db"`:** Target PostgreSQL database name on the Cloud SQL instance.
- **`instanceId: "vayu-orbit-sql"`:** Cloud SQL instance identifier.
- **`schemaValidation: "COMPATIBLE"`:** Crucial safety configuration. Prevents destructive schema migrations from dropping existing columns or tables if the live database contains additional operational fields.

---

## 4. GraphQL Schema Definition (`schema/schema.gql`)

The GraphQL schema maps all 18 discovered tables using Firebase Data Connect directives:
- **`@table(name: "...", singular: "...", plural: "...")`:** Binds the GraphQL type to the corresponding PostgreSQL table.
- **`@col(name: "...")`:** Maps camelCase GraphQL field names to snake_case PostgreSQL column identifiers.
- **`@unique`:** Enforces uniqueness constraints on `email` and `firebaseUid`.
- **`@default(expr: "...")`:** Sets default values for columns (e.g. `request.time`, `'ACTIVE'`).
- **`Any` Type:** Maps native PostgreSQL `JSONB` fields (`convoyJson`, `routeJson`, `parametersJson`, `diffJson`).

---

## 5. Connector Definition & Access Control (`connector/`) — Stage 2 Hardened

### 5.1 Queries (`connector/queries.gql`)
Client GraphQL queries are strictly limited to unprivileged static/reference catalogs:
- `GetMilitaryNodes`: Retrieves corridor graph nodes (names, coordinates, delay multipliers).
- `GetVehicleCatalog`: Retrieves military vehicle specifications, speed limits, and payload ratings.

**Gating Rationale:** Sensitive operational datasets—such as active convoy trajectories, classified checkpoint locations, reconnaissance assessments, fuel configuration, and user account directories—are deliberately excluded from client GraphQL queries. These datasets require fine-grained RBAC evaluations (`CREATOR`, `COORDINATOR`, `CHECKPOINT_OPERATOR`) that are authoritatively enforced exclusively by FastAPI backend endpoints.

Both reference queries enforce `@auth(level: USER)`, requiring a verified Firebase Authentication token.

### 5.2 Mutations (`connector/mutations.gql`) — Zero Client Mutation Policy
Following Stage 2 security review:
- **Zero Client Mutations:** The client-facing mutation `RecordAuditEvent` was **permanently removed**.
- **Defense Rationale:** Allowing client browsers to generate audit logs creates an audit spoofing vulnerability where malicious actors can forge audit events or tamper with actor IDs and timestamps.
- **Enforced Architecture:** 100% of state modifications, journeys, fuel overrides, ROP clearances, and audit logs MUST be dispatched through FastAPI endpoints with server-side RBAC and cryptographic session verification. No client-facing mutations are defined.

---

## 6. Cloud Deployment Restrictions & Pending Prerequisites

> [!CAUTION]
> **ABSOLUTE PROHIBITION ON UNAPPROVED CLOUD DEPLOYMENTS:**
> The Firebase Data Connect configuration is strictly prepared locally. No cloud provisioning or deployment has occurred.

### Actions Still Requiring User Approval & Billing Setup:
1. **Cloud SQL Instance Creation:** Cloud SQL for PostgreSQL requires an active Google Cloud billing account.
2. **Firebase Blaze Plan:** Firebase Data Connect requires the "Blaze" pay-as-you-go billing plan.
3. **IAM Permissions:** Granting the Firebase Data Connect service agent access to Cloud SQL.
4. **Execution Command:** `firebase deploy --only dataconnect` (STRICTLY BLOCKED until written user authorization is granted).
