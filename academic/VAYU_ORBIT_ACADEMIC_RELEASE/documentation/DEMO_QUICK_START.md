# VAYU ORBIT — ACADEMIC QUICK START GUIDE

This guide allows an academic evaluator, instructor, or teammate to install, configure, and launch the **VAYU ORBIT** prototype in under five minutes.

---

### Step 1: Open the Academic Project Directory
Open your terminal (PowerShell, Command Prompt, or Linux Terminal) and navigate to the academic release root:

```powershell
cd academic/VAYU_ORBIT_ACADEMIC_RELEASE
```

---

### Step 2: Install Backend Dependencies
Ensure Python 3.11+ is installed on your workstation. Run:

```powershell
cd backend
python -m pip install -r requirements.txt
cd ..
```

---

### Step 3: Install Frontend Dependencies
Ensure Node.js LTS (version 18 or 20+) is installed. Run:

```powershell
cd frontend
npm install
cd ..
```

---

### Step 4: Verify Environment Configuration
A pre-configured environment file `frontend/.env.local` is already present:

```ini
VITE_API_BASE_URL=http://127.0.0.1:8000
```
No edits are required unless you are binding to a custom backend port.

---

### Step 5: Initialise / Reset the Demo Database
To ensure a clean, isolated demo database state with zero external linkages:

**Option A (Windows batch):**
Double-click `RESET_VAYU_ORBIT_DEMO.bat`, OR

**Option B (Command line):**
```powershell
python backend/prepare_demo_db.py
```

*Optional:* To load pre-configured demonstration scenarios, double-click `SEED_DEMO_SCENARIOS.bat`.

---

### Step 6: Start the Application

#### The Recommended Easy Method (One-Click Launcher)
Double-click:
```text
START_VAYU_ORBIT_DEMO.bat
```
This supervisor checks environment health, starts the backend on port 8000, starts the frontend on port 5173, and launches your web browser automatically.

#### The Manual Method (Two Terminals)
**Terminal 1 (Backend):**
```powershell
cd backend
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm run dev
```

---

### Step 7: Access the Web Application
Open your browser and navigate to:

```text
http://localhost:5173
```

---

### Step 8: Log In and Explore
Use one of the pre-configured academic evaluation accounts:

- **Email:** `coordinator@vayu.local`
- **Password:** `VayuOrbit@2026`
- **Role:** `COORDINATOR` (Full access to Convoy Builder, Planning, Operations, and Reports)

Refer to [VAYU_ORBIT_DEMO_SCENARIOS.md](VAYU_ORBIT_DEMO_SCENARIOS.md) for demonstration workflows.
