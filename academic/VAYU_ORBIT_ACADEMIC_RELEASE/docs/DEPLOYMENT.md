# VAYU ORBIT — Production Cloud Deployment Guide
## Version 6.0.0 | Academic Release | Problem Statement PDS-3

---

## 1. Deployment Architecture Overview

VAYU ORBIT is designed for seamless, cost-effective deployment across modern cloud platforms without requiring expensive enterprise infrastructure.

```text
  [ Client Web Browser / Evaluator ]
                 |
                 | HTTPS (Encrypted TLS 1.3)
                 v
     +-----------------------------------------+
     | FRONTEND HOSTING: Vercel / Cloudflare    |
     | - React 18 Single-Page Application (SPA)|
     | - Global Edge CDN Distribution          |
     | - Static Asset Caching (immutable)      |
     | - vercel.json / _redirects SPA Routing  |
     +--------------------+--------------------+
                          |
                          | REST API Requests (HTTPS)
                          | Authorization: Bearer <JWT>
                          v
     +-----------------------------------------+
     | BACKEND HOSTING: Render / Railway       |
     | - Containerized Python 3.11 Runtime     |
     | - FastAPI Asynchronous Engine           |
     | - Unauthenticated /healthz probe        |
     | - Explicit CORS Origin Whitelist        |
     +--------------------+--------------------+
                          |
                          | Persistent POSIX File Mount
                          v
     +-----------------------------------------+
     | PERSISTENT VOLUME: Render Persistent Disk|
     | - 1 GB Mounted Volume at /data          |
     | - SQLite File: /data/military_logistics.db
     | - Retains State Across Restarts/Deploys |
     +-----------------------------------------+
                          |
                          +---> [ Optional External Services ]
                                - TomTom Maps SDK (Referer-restricted API key)
                                - Automatic fallback to offline vector canvas
```

---

## 2. Database Persistence Architecture & Analysis

### The SQLite Cloud Persistence Problem
In modern cloud container platforms (such as Render, Railway, Heroku, or Fly.io), standard container filesystems are **ephemeral**. When a container is restarted, deployed, or put to sleep due to inactivity, any writes to the local filesystem are discarded.

If a developer naively deploys SQLite inside an ephemeral container, all newly scheduled journeys, user account changes, and ROP reports will vanish upon every redeployment!

### The Two Solutions Evaluated:

| Criteria | Option A: SQLite on Persistent Disk (Recommended) | Option B: PostgreSQL Migration |
|---|---|---|
| **Architecture** | Mount a dedicated POSIX persistent disk (e.g., Render 1GB Disk at `/data`) | Migrate SQLAlchemy / SQL queries to managed PostgreSQL |
| **Code Changes** | **Zero code changes** (Uses existing `CMS_DB_PATH=/data/military_logistics.db`) | Extensive schema and query rewrites (breaking SQLite WAL/prepared statements) |
| **Data Integrity** | Retains 100% cryptographic parity with academic baseline | Requires full database schema migration and data seeding |
| **Cost** | Minimal ($1/month on Render Starter) | Managed database cost ($7–$15/month) |
| **Concurrency** | Ideal for academic evaluation & single-worker demonstrations | Suitable for enterprise multi-worker horizontal scaling |
| **Recommendation** | **SELECTED FOR ACADEMIC RELEASE** | Deferred to future production enterprise roadmap |

### How SQLite Persistence is Configured in VAYU ORBIT:
1. The backend reads `CMS_DB_PATH` from the environment (e.g. `/data/military_logistics.db`).
2. If the persistent disk is mounted fresh and empty, the backend's `ensure_database_file()` automatically copies the baseline database (`military_logistics_demo.db`) into `/data/military_logistics.db`.
3. WAL journal mode (`PRAGMA journal_mode=WAL`) and `busy_timeout=5000` ensure robust transactional concurrency without database locks.

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Deploy Backend to Render

1. Sign in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your repository or point to `render.yaml`.
4. Configure service settings:
   - **Name:** `vayu-orbit-backend`
   - **Runtime:** `Python 3` or `Docker`
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m uvicorn api:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path:** `/healthz`
5. Attach Persistent Disk:
   - Under **Disks**, click **Add Disk**.
   - **Name:** `vayu-storage`
   - **Mount Path:** `/data`
   - **Size:** `1 GB`
6. Configure Environment Variables:
   - `PYTHON_VERSION`: `3.11.9`
   - `CMS_DB_PATH`: `/data/military_logistics.db`
   - `VAYU_JWT_SECRET`: Generate a 64-char hex string (`python -c "import secrets; print(secrets.token_hex(32))"`)
   - `CORS_ORIGINS`: Leave temporary placeholder until frontend URL is known, e.g. `http://localhost:5173`
7. Click **Create Web Service**. Once deployed, copy your backend URL:
   `https://vayu-orbit-backend.onrender.com`

---

### Step 2: Deploy Frontend to Vercel

1. Sign in to [Vercel](https://vercel.com/).
2. Click **Add New...** -> **Project**.
3. Import your repository and set the **Root Directory** to `frontend`.
4. Build & Development Settings:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. Configure Environment Variables:
   - `VITE_API_BASE`: `https://vayu-orbit-backend.onrender.com` (Your Render backend URL from Step 1)
   - `VITE_TOMTOM_API_KEY`: *(Optional)* Your production TomTom key. If omitted, vector fallback engages automatically.
6. Click **Deploy**.
7. Once deployed, copy your frontend domain:
   `https://vayu-orbit.vercel.app`

---

### Step 3: Link CORS Origins

1. Return to your **Render Backend Dashboard**.
2. Navigate to **Environment Variables**.
3. Update `CORS_ORIGINS` to include your new Vercel domain:
   ```env
   CORS_ORIGINS=https://vayu-orbit.vercel.app,https://vayu-orbit-backend.onrender.com
   ```
4. Save and trigger a manual redeploy.

---

## 4. Verification & Health Monitoring

### 1. Verify Unauthenticated Liveness Probe
Open in your browser:
```text
https://vayu-orbit-backend.onrender.com/healthz
```
*Expected JSON:*
```json
{
  "status": "HEALTHY",
  "timestamp": "2026-11-15T...",
  "service": "vayu-orbit-backend",
  "version": "6.0.0"
}
```

### 2. Verify Frontend SPA Routing
Open in your browser:
```text
https://vayu-orbit.vercel.app/
```
Log in using demo credentials (`coordinator@vayu.local` / `<ASSIGNED_EVALUATOR_PASSWORD>`). Navigate to `/journey-operations` and press browser **Refresh (F5)**. The page should reload smoothly without a 404 error (handled by `vercel.json`).

### 3. Verify Database Persistence Across Restart
1. Create a test convoy journey in **Journey Planning**.
2. Note the generated Journey ID (`CMS-20261115-XXXXXX`).
3. In Render Dashboard, click **Manual Deploy -> Restart Service**.
4. Once the service restarts, refresh your frontend. The journey should remain present in the list, confirming data retention on the persistent disk!

---

## 5. Deployment Troubleshooting

| Symptom | Root Cause | Solution |
|---|---|---|
| **CORS Error in Browser Console** | Frontend domain not listed in backend `CORS_ORIGINS` | Add exact frontend HTTPS URL (no trailing slash) to `CORS_ORIGINS` on Render |
| **404 on Refresh in Vercel** | SPA routing rewrite missing | Verify `frontend/vercel.json` contains rewrites to `/index.html` |
| **Data Resets After Sleep/Restart** | Database writing to ephemeral container disk | Verify persistent disk is mounted at `/data` and `CMS_DB_PATH=/data/military_logistics.db` |
| **Container Healthcheck Failing** | Healthcheck hitting authenticated endpoint | Verify healthcheck path is set to `/healthz` (not `/api/health`) |
| **Mixed Content Warning** | Frontend (HTTPS) calling backend via HTTP | Ensure `VITE_API_BASE` uses `https://` |

---
*VAYU ORBIT Production Cloud Deployment Guide | School of Computer Science & Engineering | LPU 2026*
