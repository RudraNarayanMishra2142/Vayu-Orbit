# VAYU ORBIT — ACADEMIC DEMO TROUBLESHOOTING GUIDE

Common setup challenges, error resolutions, and environmental diagnostics for the **VAYU ORBIT** academic prototype.

---

## 1. PYTHON ENVIRONMENT & DEPENDENCY ISSUES

### Issue: `'python' is not recognized as an internal or external command`
- **Cause:** Python is not added to your system `PATH` environment variable.
- **Resolution:** Re-install Python 3.11+ and ensure the checkbox **"Add Python to PATH"** is checked on the first installation screen.

### Issue: `ModuleNotFoundError: No module named 'fastapi'` or `'networkx'`
- **Cause:** Dependencies were installed in a different Python version or virtual environment.
- **Resolution:** Run:
  ```powershell
  python -m pip install -r backend/requirements.txt
  ```
  If using virtual environments:
  ```powershell
  python -m venv venv
  .\venv\Scripts\activate
  pip install -r backend/requirements.txt
  ```

---

## 2. NODE.JS & NPM ISSUES

### Issue: `'npm' is not recognized`
- **Cause:** Node.js is missing from your system.
- **Resolution:** Download and install Node.js (LTS version 20.x recommended) from [nodejs.org](https://nodejs.org/). Restart your terminal after installation.

### Issue: `npm install` fails with network timeout
- **Cause:** Slow or restricted internet connection during package download.
- **Resolution:** Ensure a stable internet connection. If behind an institutional proxy, configure npm:
  ```powershell
  npm config set proxy http://proxy.institution.edu:8080
  ```

---

## 3. PORT CONFLICTS & BACKEND STARTUP ERRORS

### Issue: `[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000): address already in use`
- **Cause:** Another service or a previous instance of Uvicorn is already occupying port 8000.
- **Resolution:** Identify and terminate the occupying process in PowerShell:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
  ```
  Alternatively, run Uvicorn on port 8001:
  ```powershell
  python -m uvicorn api:app --host 127.0.0.1 --port 8001
  ```
  *(Remember to update `frontend/.env.local` to point to port 8001).*

### Issue: Frontend opens at `http://localhost:5174` instead of `5173`
- **Cause:** Port 5173 is in use by another Vite development server.
- **Resolution:** VAYU ORBIT backend CORS is explicitly pre-configured to accept requests from both `http://localhost:5173` and `http://localhost:5174`, so the application will continue to work seamlessly on port 5174.

---

## 4. DATABASE CONNECTIVITY & SQLITE LOCKS

### Issue: `sqlite3.OperationalError: database is locked`
- **Cause:** An unclosed transaction or concurrent write operation held the SQLite file lock.
- **Resolution:** VAYU ORBIT uses SQLite WAL mode (`PRAGMA journal_mode=WAL`) with a 5000ms busy timeout. If a lock persists due to an interrupted process:
  1. Close all running Uvicorn and Python processes.
  2. If `-wal` or `-shm` temporary lockfiles linger in `backend/`, delete them:
     ```powershell
     Remove-Item backend/*-wal, backend/*-shm -ErrorAction SilentlyContinue
     ```
  3. Restart `backend/demo_launcher.py`.

### Issue: Baseline database integrity hash mismatch in `demo_launcher.py`
- **Cause:** The master reference database `backend/military_logistics.db` was directly edited or corrupted.
- **Resolution:** Restore the pristine demo database using:
  ```powershell
  python backend/prepare_demo_db.py
  ```

---

## 5. MAP DISPLAY & TILE LOADING

### Issue: Leaflet map displays grey background with grid lines
- **Cause:** The workstation lacks an active internet connection to download map tiles from CARTO / OpenStreetMap.
- **Resolution:** Ensure the computer is connected to the internet. If you are operating in an air-gapped or restricted offline network, the routing algorithms, VORAM readiness matrix, convoy calculators, and debrief generators will function 100% normally; only the background satellite/street tile imagery will be unavailable.

---

## 6. PDF EXPORT ISSUES

### Issue: `ReportLab` fails during PDF generation
- **Cause:** Missing `pillow` or `reportlab` library.
- **Resolution:** Verify installation:
  ```powershell
  python -c "import reportlab, PIL; print('PDF engine verified!')"
  ```
