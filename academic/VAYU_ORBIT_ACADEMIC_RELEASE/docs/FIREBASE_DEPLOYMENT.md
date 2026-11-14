# VAYU ORBIT — Firebase Hosting & Cloud Run Deployment Guide
**Document ID:** VAYU-DOC-FBD-002  
**Classification:** RESTRICTED ACADEMIC RELEASE  
**Deployment Status:** BLOCKED BY AUTHORISATION (Ready for execution once authorized)  
**Target Environment:** Firebase Hosting (`vayuorbit-b20b5.web.app`) + Google Cloud Run (`vayu-orbit-backend`)  
**Version:** 1.0.0 (v6.0.0-academic)  

---

## 1. Overview & Architecture

VAYU ORBIT v6.0.0 is architected for modern decoupled cloud deployment combining Google Firebase and Google Cloud Platform (GCP):

```
       +---------------------------------------------------------------------------------+
       |                                 Client Browser                                  |
       |  (React 18 SPA + Vite + TailwindCSS + Firebase Web SDK Auth + App Check)       |
       +---------------------------------------------------------------------------------+
                 |                             |                             |
       (1) Static Assets             (2) Identity Auth             (3) Operational API
           (HTML/JS/CSS)               (Email/Password)               + X-Firebase-AppCheck
                 |                             |                      + Bearer <ID_TOKEN>
                 v                             v                             v
       +--------------------+      +-----------------------+     +-----------------------+
       |  Firebase Hosting  |      | Firebase Auth Service |     |   Google Cloud Run    |
       |  vayuorbit-b20b5   |      | Google Identity Plat. |     |  vayu-orbit-backend   |
       |  .web.app          |      | - Token Minting       |     |  - Admin SDK Verify   |
       |  - Global CDN      |      | - Brute-force Shield  |     |  - Sovereign DB RBAC  |
       |  - SPA Rewrites    |      +-----------------------+     |  - JIT UID Resolution |
       +--------------------+                                    +-----------------------+
                                                                             |
                                                                             v
                                                                 +-----------------------+
                                                                 |  Persistent Storage   |
                                                                 |  military_logistics.db|
                                                                 |  - Authoritative RBAC |
                                                                 |  - Operational Audit  |
                                                                 +-----------------------+
```

---

## 2. Part 1: Frontend Deployment to Firebase Hosting

### 2.1 Configuration Files Verification
The academic release directory contains pre-configured Firebase project descriptors:

1. **`firebase.json`** ([firebase.json](file:///c:/Users/mishr/OneDrive/Desktop/CMS/programme/academic/VAYU_ORBIT_ACADEMIC_RELEASE/firebase.json)):
```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        "source": "/index.html",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache, no-store, must-revalidate"
          }
        ]
      }
    ]
  }
}
```

2. **`.firebaserc`** ([.firebaserc](file:///c:/Users/mishr/OneDrive/Desktop/CMS/programme/academic/VAYU_ORBIT_ACADEMIC_RELEASE/.firebaserc)):
```json
{
  "projects": {
    "default": "vayuorbit-b20b5"
  }
}
```

### 2.2 Building the Frontend for Production
Prior to deployment, compile the React application with production environment variables:

```powershell
# Navigate to frontend directory
cd academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend

# Configure production environment (.env.production)
# Set your Cloud Run backend URL:
echo "VITE_API_BASE=https://vayu-orbit-backend-<hash>.a.run.app" > .env.production
echo "VITE_FIREBASE_APP_CHECK_KEY=<your-recaptcha-site-key>" >> .env.production

# Install dependencies and build
npm ci
npm run build
```

The compiled output will reside in `frontend/dist/`.

### 2.3 Deploying to Firebase Hosting
Once deployment authorization has been obtained:

```powershell
# Navigate to academic release root
cd academic/VAYU_ORBIT_ACADEMIC_RELEASE

# Ensure user is logged into Firebase CLI
firebase login

# Deploy Hosting only (does NOT touch any non-existent databases or functions)
firebase deploy --only hosting
```

Target URLs upon completion:
- `https://vayuorbit-b20b5.web.app`
- `https://vayuorbit-b20b5.firebaseapp.com`

---

## 3. Part 2: Backend Deployment to Google Cloud Run

### 3.1 Container Hardening
The backend `Dockerfile` ([Dockerfile](file:///c:/Users/mishr/OneDrive/Desktop/CMS/programme/academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend/Dockerfile)) has been hardened for containerized cloud deployment:
- Based on `python:3.11-slim`
- Creates unprivileged user `appuser` (UID 1000)
- Binds to dynamic `$PORT` supplied by Cloud Run (default: 8080 or 8000)
- Exposes health probes at `/healthz` and `/health`
- Mounts persistent volume mount point at `/data`

### 3.2 Persistent Data Storage Strategy
Google Cloud Run containers possess ephemeral root filesystems. Changes to SQLite inside the container image are lost upon container shutdown or scale-out.

**Options for SQLite Data Retention on Cloud Run:**
1. **Cloud Run with GCS FUSE Volume (Evaluation / Low Concurrency):**
   - Cloud Run supports mounting a Google Cloud Storage (GCS) bucket as a network filesystem via Cloud Storage FUSE.
   - *Limitation:* Cloud Storage FUSE does not support POSIX advisory file locking, which can cause SQLite WAL lock contention under concurrent writes.
2. **Cloud Run Volume Mount to Cloud Filestore (NFS) (Recommended for SQLite):**
   - Cloud Filestore provides true POSIX-compliant NFS file locking required by SQLite WAL mode.
   - Mount `/data` directly to a Filestore volume.
3. **Database Migration to Cloud SQL PostgreSQL (Enterprise Multi-Instance Production):**
   - If horizontal autoscaling (multiple container replicas) is required, migrate from SQLite to Managed Cloud SQL PostgreSQL as documented in `ARCHITECTURE.md`.

### 3.3 Deploying to Cloud Run via Google Cloud SDK
Ensure `gcloud` CLI is installed and authenticated:

```powershell
# Navigate to backend directory
cd academic/VAYU_ORBIT_ACADEMIC_RELEASE/backend

# Deploy directly from source via Cloud Build
gcloud run deploy vayu-orbit-backend `
  --source . `
  --region asia-south1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "APP_ENV=production,PORT=8080,CMS_DB_PATH=/data/military_logistics.db,FIREBASE_PROJECT_ID=vayuorbit-b20b5,FIREBASE_APP_CHECK_MODE=audit,VAYU_ALLOW_LEGACY_JWT=false,CORS_ORIGINS=https://vayuorbit-b20b5.web.app,https://vayuorbit-b20b5.firebaseapp.com" `
  --set-secrets "SECRET_KEY=vayu-orbit-secret-key:latest"
```

*Note: Unauthenticated invocation is allowed on Cloud Run because zero-trust gatekeeping is performed directly by Firebase App Check middleware and Firebase Authentication ID token RBAC verification within the application layer.*

---

## 4. Part 3: Firebase Authentication Configuration

### 4.1 Firebase Console Setup (`vayuorbit-b20b5`)
1. **Enable Email/Password Provider:**
   - In the Firebase Console, navigate to **Build > Authentication > Sign-in method**.
   - Select **Email/Password** and click **Enable**. Save changes.
2. **Configure Authorized Domains:**
   - Under **Authentication > Settings > Authorized domains**, confirm the following are present:
     - `localhost` (for local development & evaluation)
     - `vayuorbit-b20b5.firebaseapp.com`
     - `vayuorbit-b20b5.web.app`
     - (Any custom domain provisioned for production)
3. **Provisioning Service Account for Firebase Admin SDK:**
   - On Google Cloud Run, default application credentials (ADC) automatically resolve via the runtime Service Account.
   - Ensure the Cloud Run runtime service account has the **Firebase Authentication Viewer** or **Firebase Admin SDK Administrator Service Agent** role.
   - For offline or external hosting environments, provide the service account JSON key path via `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`.

---

## 5. App Check Verification & Rollout Strategy

1. **Phase 1: Disabled (`FIREBASE_APP_CHECK_MODE=disabled`)**
   - Initial sanity verification post-deployment.
   - Verifies end-to-end network connectivity between Firebase Hosting and Cloud Run.

2. **Phase 2: Audit / Monitoring (`FIREBASE_APP_CHECK_MODE=audit`)**
   - Default recommended rollout mode.
   - Validates attestation tokens if present and logs telemetry anomalies.
   - Does not block legitimate clients while telemetry and reCAPTCHA baselines calibrate.

3. **Phase 3: Enforced (`FIREBASE_APP_CHECK_MODE=enforced`)**
   - Production enforcement.
   - Requests lacking a verified `X-Firebase-AppCheck` header receive HTTP 401 Unauthorized.
   - Health probes (`/healthz`, `/health`) remain permanently exempt.

---

## 6. Continuous Deployment (CI/CD) Workflow

Below is a reference GitHub Actions workflow (`.github/workflows/deploy.yml`):

```yaml
name: Deploy VAYU ORBIT

on:
  push:
    branches: [ main ]
    tags: [ 'v*.*.*' ]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Build Frontend
        working-directory: academic/VAYU_ORBIT_ACADEMIC_RELEASE/frontend
        run: |
          npm ci
          npm run build
        env:
          VITE_API_BASE: ${{ secrets.PROD_API_BASE }}
          VITE_FIREBASE_APP_CHECK_KEY: ${{ secrets.RECAPTCHA_SITE_KEY }}
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_VAYUORBIT }}'
          channelId: live
          projectId: vayuorbit-b20b5
```

---

## 7. Authorisation & Legal Disclaimer

> [!IMPORTANT]
> **DEPLOYMENT PERMISSION GATE:**
> Do NOT execute `firebase deploy` or `gcloud run deploy` in production until written approval is granted by the system author and designated academic/defence stakeholders.
> See [PUBLIC_DEPLOYMENT_PERMISSION_REQUEST.md](file:///c:/Users/mishr/OneDrive/Desktop/CMS/programme/academic/VAYU_ORBIT_ACADEMIC_RELEASE/docs/PUBLIC_DEPLOYMENT_PERMISSION_REQUEST.md) for full authorisation protocol.
