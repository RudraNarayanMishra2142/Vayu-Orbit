# VAYU ORBIT v6.0.0 — Render Backend Deployment & Vercel Connection Report

**Project:** VAYU ORBIT (Academic Problem Statement: PDS-3)  
**System:** Intelligent Convoy Movement Planning & Tactical Dynamic Route Optimisation  
**GitHub Repository:** `https://github.com/RudraNarayanMishra2142/Vayu-Orbit`  
**Backend Directory:** `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend`  
**Frontend Platform:** Vercel  
**Backend Platform:** Render (`vayu-orbit-api`)  
**Date:** 15 November 2026  
**Final Status:** `BACKEND DEPLOYMENT SPECIFICATION PREPARED — ACTION REQUIRED ON RENDER & VERCEL`

---

## 1. Backend Architecture & Runtime Inspection

The backend structure within `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend` was forensically verified:

| Parameter | Inspected Reality | Configuration Setting |
| :--- | :--- | :--- |
| **FastAPI Entry Point** | `api.py` (`app = FastAPI(...)`) | `api:app` |
| **Runtime & Python Version** | Python 3.11 / 3.13 | Python 3.11.9 (or Python 3) |
| **Dependency File** | `requirements.txt` (FastAPI, Uvicorn, NetworkX, ReportLab, etc.) | `pip install -r requirements.txt` |
| **Production Start Command** | Uvicorn binding to `0.0.0.0:$PORT` | `python -m uvicorn api:app --host 0.0.0.0 --port $PORT` |
| **Unauthenticated Health Check** | `@app.get('/healthz')` and `@app.get('/health')` | `/healthz` (Returns HTTP 200 `{'status': 'HEALTHY'}`) |
| **API Documentation Path** | FastAPI OpenAPI / Swagger | `/docs` and `/redoc` |
| **Database Adapter** | `db_adapter.py` supporting SQLite & PostgreSQL | `CMS_DB_PATH` / `DATABASE_PATH` |
| **Database Auto-Seeding** | `ensure_database_file()` | Idempotently copies `military_logistics_demo.db` to persistent mount on first boot |

---

## 2. Database Persistence Architecture (Critical Decision)

### Risk Analysis of Ephemeral Storage
Render web services run on stateless ephemeral containers. On standard ephemeral instances, any file written to local disk is destroyed upon restart, redeployment, or daily dyno cycling.

### Solution: Render Persistent Disk
- **Mount Path:** `/data`
- **Target File:** `/data/military_logistics.db`
- **Environment Variable:** `CMS_DB_PATH=/data/military_logistics.db`
- **First-Boot Behavior:** When the backend boots on Render for the first time, `ensure_database_file()` detects that `/data/military_logistics.db` does not exist and atomically initializes it from the packaged, sanitized `military_logistics_demo.db`.
- **Integrity Guarantee:** Subsequent writes, convoy creation, and ROP reports persist indefinitely across container restarts.

---

## 3. Render Web Service Deployment Parameters

Create a **New Web Service** on Render ([dashboard.render.com](https://dashboard.render.com)):

| Field | Value | Notes |
| :--- | :--- | :--- |
| **Repository** | `https://github.com/RudraNarayanMishra2142/Vayu-Orbit` | Connect via GitHub |
| **Branch** | `main` | Production branch |
| **Name** | `vayu-orbit-api` | Generates `https://vayu-orbit-api.onrender.com` |
| **Region** | Oregon (US West) or Frankfurt | Match your target preference |
| **Root Directory** | `academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend` | **Mandatory** |
| **Runtime** | `Python` | Native Render Python runtime |
| **Build Command** | `pip install -r requirements.txt` | Installs dependencies |
| **Start Command** | `python -m uvicorn api:app --host 0.0.0.0 --port $PORT` | Binds to dynamic `$PORT` |
| **Instance Type** | Starter (or Free with ephemeral limitation) | *Starter required for Persistent Disk* |

### Persistent Disk Configuration (Render Dashboard → Disks)
- **Disk Name:** `vayu-sqlite-storage`
- **Mount Path:** `/data`
- **Size:** `1 GB`

---

## 4. Production Environment Variables (Render Dashboard)

Add these in Render under **Environment Variables** (never commit secret values to Git):

| Variable Name | Example / Target Value | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | Enforces production security checks |
| `CMS_DB_PATH` | `/data/military_logistics.db` | Points SQLite to persistent disk |
| `DATABASE_PROVIDER` | `sqlite` | Selects SQLite adapter |
| `VAYU_JWT_SECRET` | *(64-character random hex string)* | Cryptographic JWT signing key |
| `CORS_ORIGINS` | `https://your-vercel-domain.vercel.app` | Restricts API access strictly to frontend |
| `FIREBASE_PROJECT_ID`| `vayuorbit-b20b5` | Firebase project identifier |
| `FIREBASE_APP_CHECK_MODE` | `audit` | Evaluates App Check tokens without breaking initial setup |
| `PYTHON_VERSION` | `3.11.9` | Pinned Python release |

---

## 5. Vercel Frontend Connection

In your Vercel project dashboard ([vercel.com](https://vercel.com)) under **Project Settings → Environment Variables**:

1. Set the backend URL variable:
   - **Key:** `VITE_API_BASE`
   - **Value:** `https://vayu-orbit-api.onrender.com` *(Replace with your exact Render HTTPS URL)*
2. In Render, update `CORS_ORIGINS` to include the Vercel production domain:
   ```env
   CORS_ORIGINS=https://vayu-orbit.vercel.app,https://vayu-orbit-git-main-rudranarayanmishra2142s-projects.vercel.app
   ```
3. Trigger a **Redeploy** on Vercel to bake the new `VITE_API_BASE` into the frontend build chunks.

---

## 6. End-to-End Verification Checklist

Once both services are deployed:
1. **Backend Health Check:** Visit `https://vayu-orbit-api.onrender.com/healthz` → Returns HTTP 200 `{"status": "HEALTHY"}`.
2. **API Documentation:** Visit `https://vayu-orbit-api.onrender.com/docs` → FastAPI Swagger interface loads.
3. **Frontend Connection:** Open the Vercel site in browser console:
   - Verify network requests point to `https://vayu-orbit-api.onrender.com/api/...`.
   - Verify CORS headers return `Access-Control-Allow-Origin: https://your-vercel-app.vercel.app`.
4. **Authentication:** Log in using mock demo account:
   - Email: `coordinator@vayu.local`
   - Password: `DemoCoordinator@2026`
5. **Tactical Routing & VORAM:** Build a convoy and generate a route to verify NetworkX Dijkstra and VORAM calculation APIs.
6. **Persistence:** Restart Render web service; verify previously scheduled journeys remain in the database.
