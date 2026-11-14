# VAYU ORBIT — Installation & Deployment Guide
## Version 6.0.0 | Academic Release | Problem Statement PDS-3

---

## 1. System Requirements & Prerequisites

Before deploying VAYU ORBIT, verify that your environment meets the minimum requirements:

### Hardware Requirements
| Component | Minimum Specification | Recommended Specification |
|---|---|---|
| **CPU** | Dual-core 2.0 GHz (x86_64 or Apple Silicon) | Quad-core 2.5 GHz or higher |
| **RAM** | 4 GB | 8 GB or 16 GB |
| **Disk Space** | 500 MB free space | 1 GB free space |
| **Display** | 1280 × 800 | 1920 × 1080 (Full HD) |

### Software Prerequisites
1. **Python:** Version **3.11.0** to **3.12.x** (Must be accessible via system `PATH`).
2. **Node.js:** Version **v18.0.0 LTS** or **v20.0.0 LTS** (Includes `npm` v9+).
3. **Web Browser:** Google Chrome 110+, Mozilla Firefox 115+, Microsoft Edge 110+, or Safari 16+.
4. **Operating System:** Windows 10/11, Ubuntu 22.04+ LTS (or Debian 12+), macOS 12+ (Monterey, Ventura, Sonoma).

---

## 2. Quick Start: Windows Automated Deployment

For Windows evaluation, three automated batch scripts are provided in the release root:

### 2.1 One-Click Startup
Double-click `START_VAYU_ORBIT_DEMO.bat` or run from PowerShell:
```cmd
START_VAYU_ORBIT_DEMO.bat
```
**What this script does:**
1. Checks for Python and Node.js installation.
2. Checks and initializes the pristine SQLite database (`military_logistics.db`).
3. Launches the FastAPI backend on `http://localhost:8000`.
4. Launches the Vite React frontend on `http://localhost:5173`.
5. Automatically opens your default web browser to the login page.

### 2.2 Seeding Demonstration Scenarios
To inject realistic active convoys, pre-filed ROP recon reports, and sample SITREPs:
```cmd
SEED_DEMO_SCENARIOS.bat
```

### 2.3 Resetting the Database
To restore the pristine baseline evaluation database at any time:
```cmd
RESET_VAYU_ORBIT_DEMO.bat
```

---

## 3. Manual Cross-Platform Installation

If running on Linux, macOS, or if you prefer running services manually on Windows:

### Step 1: Clone or Extract the Release Package
Ensure you are in the root directory of the academic release package:
```bash
cd VAYU_ORBIT_ACADEMIC_RELEASE
```

### Step 2: Configure Python Virtual Environment (Recommended)
Create and activate an isolated Python environment:

**On Linux / macOS:**
```bash
python3.11 -m venv venv
source venv/bin/activate
```

**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 3: Install Backend Dependencies
Install the pinned Python packages:
```bash
pip install -r requirements.txt
```
*Key packages installed: `fastapi`, `uvicorn`, `pydantic`, `sqlalchemy`, `pytest`, `pytest-asyncio`, `python-jose`, `passlib`.*

### Step 4: Verify and Initialize the Database
Run the baseline database preparation utility:
```bash
cd backend
python prepare_demo_db.py
cd ..
```
*This verifies the cryptographic SHA-256 hash of the baseline database and generates `military_logistics.db` if not present.*

### Step 5: Start the Backend Server
```bash
cd backend
python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```
You should see:
```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```
*Verify by opening `http://localhost:8000/docs` in your browser.*

### Step 6: Install Frontend Dependencies
Open a **new terminal** window and navigate to the `frontend` directory:
```bash
cd VAYU_ORBIT_ACADEMIC_RELEASE/frontend
```

Create your local environment file from the template:
```bash
# On Linux / macOS:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

Install npm dependencies:
```bash
npm install
```

### Step 7: Launch the Frontend Development Server
```bash
npm run dev
```
You should see:
```text
  VITE v5.4.14  ready in 250 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open `http://localhost:5173` in your browser to access the VAYU ORBIT login screen.

---

## 4. Environment Variables & Map Configuration

The frontend configuration resides in `frontend/.env`.

```env
# TomTom Map SDK API Key (Optional)
# If left as placeholder or omitted, VAYU ORBIT automatically engages
# its high-performance offline tactical vector map canvas.
VITE_TOMTOM_API_KEY=YOUR_TOMTOM_API_KEY_HERE
```

### Obtaining a Free TomTom API Key (Optional)
1. Visit [developer.tomtom.com](https://developer.tomtom.com/) and create a free developer account.
2. Generate an API Key under the **Keys & Applications** dashboard.
3. Paste the key into `frontend/.env`:
   ```env
   VITE_TOMTOM_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   ```
4. Restart the frontend server (`npm run dev`).

> [!NOTE]
> An API key is **not required** for full functional evaluation. All route calculations, VORAM scores, and tactical node visualizations function identically using the built-in offline vector canvas.

---

## 5. Verification Checklist

After installation, verify that all components are healthy:

1. **Backend Health Check:**
   Open `http://localhost:8000/docs` in your browser. The Swagger UI should display all endpoints.
2. **Database Integrity:**
   Run the automated test suite:
   ```bash
   cd backend
   pytest tests/
   ```
   *Expected output: `60 passed in X.XXs`.*
3. **Frontend Compilation:**
   Verify that the production build succeeds cleanly:
   ```bash
   cd frontend
   npm run build
   ```
   *Expected output: `✓ built in ~800ms`.*
4. **Login Authentication:**
   - URL: `http://localhost:5173/login`
   - Email: `coordinator@vayu.local`
   - Password: `<CONFIGURED_DURING_INITIALIZATION>`
   - Status: Successfully redirects to the Operational Overview dashboard.

---

## 6. Troubleshooting Common Issues

### Issue 1: Port 8000 or 5173 Already in Use
**Symptom:** `[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)`  
**Solution:**
- Identify the process holding the port:
  ```powershell
  # Windows:
  netstat -ano | findstr :8000
  taskkill /PID <PID> /F
  
  # Linux / macOS:
  lsof -i :8000
  kill -9 <PID>
  ```
- Alternatively, start Uvicorn on an alternate port:
  ```bash
  python -m uvicorn api:app --host 127.0.0.1 --port 8005
  ```
  *(Update `frontend/vite.config.js` proxy settings if port 8000 is changed).*

### Issue 2: `python` command not found
**Symptom:** `'python' is not recognized as an internal or external command`  
**Solution:** Ensure Python 3.11 is installed with the **"Add Python to PATH"** checkbox selected during installation, or invoke via `py -3.11`.

### Issue 3: SQLite Database Locked
**Symptom:** `sqlite3.OperationalError: database is locked`  
**Solution:** Ensure only one backend server instance is accessing `military_logistics.db`. Terminate duplicate running Python processes.

### Issue 4: Missing Node Modules
**Symptom:** `Failed to resolve import "lucide-react"`  
**Solution:** Run `npm install` inside the `frontend` directory.

---
*VAYU ORBIT Installation Guide | School of Computer Science & Engineering | LPU 2026*
