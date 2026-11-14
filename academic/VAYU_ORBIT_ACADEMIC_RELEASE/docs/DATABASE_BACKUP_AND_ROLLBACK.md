# VAYU ORBIT v6.0.0 — Database Backup Manifest & Truthful Rollback Protocol
**Document ID:** VAYU-DOC-BKP-005  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Subject:** Forensic Backup Inventory, Restore Verification, Maintenance Window & Truthful Rollback Protocol  
**Date:** November 15, 2026  
**Target Environment:** SQLite & Cloud SQL for PostgreSQL (`vayuorbit-b20b5`)  

---

## 1. Forensic Backup Inventory & Checksums

Prior to executing database migration procedures, complete byte-level forensic backups of the SQLite operational databases were created and verified:

| File Name | File Size | SQLite Integrity | SHA-256 Checksum | Operational Role |
|---|---|:---:|---|---|
| `military_logistics.db` | 3,166,208 B | `ok` | `91c5abe7118e416e788c1c4f...` | Active operational database (18 tables, 1,005 records). |
| `military_logistics.db.backup_20261115_020231` | 3,166,208 B | `ok` | `4b14b27d7fceca650570b5ee...` | Historical pre-Firebase-Auth backup. Preserved untouched. |
| `military_logistics.db.backup_20261115_024500` | 3,166,208 B | `ok` | `91c5abe7118e416e788c1c4f...` | Pre-migration forensic baseline. Byte-verified. |
| `military_logistics_demo.db` | 229,376 B | `ok` | `002f364d3ac6165e3ee4b6fa...` | Clean demonstration seed template (18 tables, 280 records). |
| `military_logistics_demo.db.backup_20261115_020231` | 221,184 B | `ok` | `934ac45b236ec2539f046b0a...` | Historical demo baseline backup. Preserved untouched. |
| `military_logistics_demo.db.backup_20261115_024500` | 229,376 B | `ok` | `002f364d3ac6165e3ee4b6fa...` | Pre-migration demo baseline backup. Byte-verified. |

All backup files were independently verified with SQLite `PRAGMA integrity_check;` and confirmed valid.

---

## 2. Backup Restore Test Evidence

A non-destructive restore test was conducted locally against a separate temporary database file (`scratch/tmp_restore_test.db`), confirming:
- **Source Backup:** `backend/military_logistics.db.backup_20261115_024500`
- **Integrity Check:** `ok`
- **Table Count:** 18 tables recovered
- **Record Count:** 996 baseline records verified
- **Original Files Protected:** Zero writes or file locks occurred on `military_logistics.db` during restore verification.

---

## 3. Production Cutover & Maintenance Window Protocol

A production migration from SQLite to Cloud SQL PostgreSQL cannot occur safely while live convoy dispatches or checkpoint events are active. The following phased protocol must be followed:

```
[Phase A: Write Freeze] ---> [Phase B: Snapshot] ---> [Phase C: Migration] ---> [Phase D: Verify Gate]
          |                                                                           |
          v                                                                           v
[Phase E: Cutover] ---------> [Phase F: Post-Cutover Snapshot] ------------> [Normal Operation]
          |
          v (If failure occurs post-cutover)
[Phase G: Rollback Protocol (Scenario A or Scenario B)]
```

### Phase A: Maintenance Window & Write Freeze
1. Declare a scheduled maintenance window (recommended duration: 30 minutes).
2. Set the application to read-only maintenance mode or temporarily stop user traffic.
3. Confirm that all in-flight convoy planning sessions and ROP reports have finalized.

### Phase B: Final Pre-Cutover SQLite Snapshot
Create an immutable snapshot immediately prior to data export:
```powershell
Copy-Item backend/military_logistics.db backend/military_logistics_cutover_frozen.db
```

### Phase C: Data Migration & Sequence Synchronization
Run the migration engine in live mode against target PostgreSQL:
```powershell
python backend/migrations/sqlite_to_postgres.py --source backend/military_logistics.db --target $env:DATABASE_URL
```

### Phase D: Verification Gate
Execute the automated reconciliation check. Confirm:
- Table count matches 18.
- Row counts match 100%.
- Sequences synchronized.

### Phase E: Traffic Cutover
Set `DATABASE_PROVIDER=postgresql` in the backend environment and restart the FastAPI service.

---

## 4. Truthful Rollback Protocol & Data Loss Scenarios

> [!WARNING]
> **CRITICAL RECOVERY POINT NOTICE:**
> Simply setting `DATABASE_PROVIDER=sqlite` reverts application routing to the local SQLite database. It does **NOT** automatically synchronize writes executed against PostgreSQL back into SQLite. Rollback procedures must distinguish between pre-write and post-write failure scenarios.

### Scenario A: Rollback BEFORE PostgreSQL Accepts Operational Writes
*(Applicable if PostgreSQL fails health checks immediately post-cutover before user traffic begins)*
1. Set `DATABASE_PROVIDER=sqlite` in backend configuration.
2. Restart FastAPI backend.
3. **Recovery Point Objective (RPO):** 0 seconds (zero data loss; SQLite database is 100% current).
4. **Recovery Time Objective (RTO):** < 2 minutes.

### Scenario B: Rollback AFTER PostgreSQL Has Accepted Operational Writes
*(Applicable if PostgreSQL experiences severe corruption, latency, or network partitioning hours after cutover, during which new journeys, checkpoints, or ROP reports were saved)*
1. **Declare Write Freeze:** Immediately terminate incoming API traffic to prevent split-brain writes.
2. **Assess Data Drift:** Identify all records created or modified in PostgreSQL since cutover timestamp $T_{\text{cutover}}$:
   ```sql
   SELECT journey_id, status, created_at FROM journeys WHERE updated_at > '2026-11-15T02:45:00Z';
   SELECT id, event_type, created_at FROM journey_events WHERE created_at > '2026-11-15T02:45:00Z';
   SELECT report_id, status, created_at FROM rop_reports WHERE updated_at > '2026-11-15T02:45:00Z';
   SELECT id, action, created_at FROM audit_log WHERE created_at > '2026-11-15T02:45:00Z';
   ```
3. **Execute Delta Reconciliation:**
   - Export delta records to a structured JSON file.
   - Run an ingestion script inserting delta records into `military_logistics.db` inside an atomic SQLite transaction.
4. **Catastrophic Cloud Failure (Delta Unrecoverable):**
   - If Cloud SQL suffered catastrophic data loss and delta records cannot be extracted, the system MUST restore to the pre-cutover SQLite snapshot (`military_logistics.db.backup_20261115_024500`).
   - **Data Loss Window:** All journeys, checkpoint check-ins, and ROP reports created between $T_{\text{cutover}}$ and the rollback decision are permanently lost.
   - **RPO:** Elapsed time since cutover ($T_{\text{now}} - T_{\text{cutover}}$).
   - Command operators must re-enter missing convoy manifests manually.

---

## 5. Summary of Rollback Guarantees

| Metric / Attribute | Pre-Write Failure (Scenario A) | Post-Write Failure with Delta Sync | Post-Write Catastrophic (Scenario B) |
|---|:---:|:---:|:---:|
| **Zero-Downtime?** | No (Brief service restart) | No (Requires maintenance window) | No (Requires maintenance window) |
| **Lossless?** | **YES (100% Lossless)** | **YES (Post delta ingestion)** | **NO (Data loss = post-cutover window)** |
| **Estimated RPO** | 0 seconds | 0 seconds | Hours elapsed since cutover |
| **Estimated RTO** | < 2 minutes | 15–30 minutes | 10–20 minutes |
