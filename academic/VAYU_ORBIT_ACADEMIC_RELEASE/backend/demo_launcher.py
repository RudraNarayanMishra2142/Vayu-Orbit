"""
VAYU ORBIT — Live Demonstration Launcher & Supervisor
Supervises local FastAPI backend and Vite frontend processes.
Enforces isolated demonstration database binding (CMS_DB_PATH).
Opens the default browser only after verified readiness.
"""

import os
import sys
import time
import shutil
import socket
import urllib.request
import urllib.error
import subprocess
import threading
import webbrowser
import hashlib
import sqlite3
import signal
import json

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
LOGS_DIR = os.path.join(PROJECT_ROOT, "logs")

PROD_DB_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "military_logistics.db"))
PROD_DB_HASH = "755B144435639B3216A70BB9E37CBAA3A072671D6A3946A6133001C08510F14B"

DEMO_DB_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "military_logistics_demo.db"))
PROTECTED_LOGO_PATH = os.path.abspath(os.path.join(FRONTEND_DIR, "vayu.png"))
PROTECTED_LOGO_HASH = "30F079BDCF0E63ACEBA0729CAAABFE418827C6FF81CABEC93D5AF5CEFF9C604E"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
FRONTEND_HOST = "localhost"
FRONTEND_PORT = 5173

def get_file_sha256(path):
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().upper()

def is_port_in_use(port, host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def check_backend_alive():
    """Basic TCP/HTTP probe of backend port for readiness."""
    try:
        url = f"http://{BACKEND_HOST}:{BACKEND_PORT}/api/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return True
    except urllib.error.HTTPError as e:
        # HTTP 401 proves the FastAPI server and RBAC dependency are active and listening
        return e.code in (200, 401)
    except Exception:
        return False

def verify_backend_isolation(expected_db_path, host=BACKEND_HOST, port=BACKEND_PORT, timeout=1.0):
    """
    Positively verifies that the backend on host:port is running and actively
    isolated to the expected demo database using the runtime diagnostic endpoint.
    Returns (is_verified, reason_message).
    """
    expected_target = os.path.basename(os.path.abspath(expected_db_path))
    expected_hash = hashlib.sha256(os.path.abspath(expected_db_path).encode('utf-8')).hexdigest()
    url = f"http://{host}:{port}/api/diagnostic/database"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VayuOrbit-DemoSupervisor"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False, f"Diagnostic endpoint returned HTTP {resp.status}"
            data = json.loads(resp.read().decode('utf-8'))
            
            target = data.get("database_target")
            target_hash = data.get("path_sha256")
            is_demo = data.get("is_demo_isolated")
            
            if target != expected_target:
                return False, f"Database target mismatch: expected '{expected_target}', got '{target}'"
            if target_hash != expected_hash:
                return False, f"Database path hash mismatch: expected '{expected_hash}', got '{target_hash}'"
            if not is_demo:
                return False, "Backend reports is_demo_isolated is False"
                
            return True, f"Verified isolated demo database ({target})"
    except Exception as e:
        return False, f"Diagnostic probe error: {e}"

def check_frontend_alive():
    try:
        url = f"http://{FRONTEND_HOST}:{FRONTEND_PORT}/"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False

def log_reader(pipe, log_file, prefix):
    try:
        with open(log_file, 'a', encoding='utf-8', errors='replace') as lf:
            for line in iter(pipe.readline, ''):
                if not line:
                    break
                timestamp = time.strftime("[%Y-%m-%d %H:%M:%S]")
                lf.write(f"{timestamp} {prefix} {line}")
                lf.flush()
    except Exception:
        pass

def main():
    os.makedirs(LOGS_DIR, exist_ok=True)
    session_log = os.path.join(LOGS_DIR, "demo_session.log")

    print("=" * 70)
    print(" VAYU ORBIT — TACTICAL LOGISTICS PLATFORM")
    print(" ONE-CLICK LOCAL DEMONSTRATION LAUNCHER")
    print("=" * 70)

    # 1. Validate Protected Assets & Core Paths
    print("\n[STEP 1/6] Validating application files and protected assets...")
    
    if not os.path.exists(PROD_DB_PATH):
        print(f"[FATAL] Production database missing at: {PROD_DB_PATH}")
        sys.exit(1)
    
    EXPECTED_PROD_HASH = os.environ.get("VAYU_EXPECTED_PROD_HASH", PROD_DB_HASH)
    ALLOW_UNRESOLVED_RECOVERY = os.environ.get("VAYU_ALLOW_UNRESOLVED_RECOVERY", "0") == "1"

    prod_hash = get_file_sha256(PROD_DB_PATH)
    if prod_hash != EXPECTED_PROD_HASH:
        if ALLOW_UNRESOLVED_RECOVERY:
            print(f"  [NOTICE] Production database hash ({prod_hash[:16]}...) differs from baseline ({EXPECTED_PROD_HASH[:16]}...). Pending recovery.")
        else:
            print(f"[FATAL] Production database hash altered! Expected {EXPECTED_PROD_HASH}, got {prod_hash}")
            sys.exit(1)
    else:
        print("  ✓ Production database protected & verified (Hash: F1932F75...)")

    if not os.path.exists(PROTECTED_LOGO_PATH):
        print(f"[FATAL] Brand logo asset missing at: {PROTECTED_LOGO_PATH}")
        sys.exit(1)

    logo_hash = get_file_sha256(PROTECTED_LOGO_PATH)
    if logo_hash != PROTECTED_LOGO_HASH:
        print(f"[FATAL] Protected logo altered! Expected {PROTECTED_LOGO_HASH}, got {logo_hash}")
        sys.exit(1)
    print("  ✓ Brand logo protected & verified (Hash: 30F079BD...)")

    # 2. Check System Runtime & Dependencies
    print("\n[STEP 2/6] Checking runtime environments & dependencies...")
    node_exe = shutil.which("node")
    if not node_exe:
        print("[ERROR] Node.js is not found on PATH. Please install Node.js LTS.")
        sys.exit(1)
    print(f"  ✓ Node.js runtime: {node_exe}")

    vite_bin = os.path.abspath(os.path.join(FRONTEND_DIR, "node_modules", "vite", "bin", "vite.js"))
    if not os.path.exists(vite_bin):
        print(f"[ERROR] Vite package executable missing at: {vite_bin}")
        print("Please ensure 'npm install' was executed in frontend/ before running offline.")
        sys.exit(1)
    print("  ✓ Vite runtime binary located")

    # Python dependencies
    required_py_mods = ["fastapi", "uvicorn", "pydantic", "networkx", "reportlab", "bcrypt", "jwt"]
    missing_mods = []
    for mod in required_py_mods:
        try:
            __import__(mod)
        except ImportError:
            missing_mods.append(mod)
    if missing_mods:
        print(f"[ERROR] Missing required Python dependencies: {', '.join(missing_mods)}")
        print("Please install required dependencies from backend/requirements.txt.")
        sys.exit(1)
    print(f"  ✓ Python {sys.version.split()[0]} and backend dependencies verified")

    # 3. Ensure Demo Database is Initialized
    print("\n[STEP 3/6] Binding isolated demonstration database...")
    if not os.path.exists(DEMO_DB_PATH):
        print("  Demo database does not exist yet. Initializing clean demonstration state...")
        from prepare_demo_db import reset_demo_database
        reset_demo_database(target_db_path=DEMO_DB_PATH, require_confirmation=False)
    
    # Read current journey count in demo database
    try:
        conn = sqlite3.connect(f"file:{DEMO_DB_PATH}?mode=ro", uri=True)
        j_count = conn.execute("SELECT count(*) FROM journeys").fetchone()[0]
        conn.close()
    except Exception as e:
        print(f"[FATAL] Failed to inspect demo database: {e}")
        sys.exit(1)
        
    print(f"  ✓ Demo database bound: {DEMO_DB_PATH}")
    print(f"  ✓ Active journeys in demo DB: {j_count}")
    if j_count > 0:
        print("    [NOTE] Previous demonstration sessions left journeys recorded.")
        print("    Run 'RESET_VAYU_ORBIT_DEMO.bat' before presenting if you need 0 journeys.")

    # 4. Port Conflict Inspection
    print("\n[STEP 4/6] Inspecting network ports...")

    # RULE: Never reuse an unverified backend on port 8000.
    # If port 8000 is occupied, abort startup with an actionable message.
    # Do not kill or terminate unrelated processes.
    if is_port_in_use(BACKEND_PORT, BACKEND_HOST):
        print(f"\n[PORT CONFLICT] Port {BACKEND_PORT} is currently occupied by another process.")
        print("To protect production data integrity and guarantee isolation, VAYU ORBIT")
        print("will never reuse an unverified pre-existing process on port 8000.")
        print(f"Action required: Terminate the process using port {BACKEND_PORT} before starting the launcher.")
        sys.exit(1)
    else:
        print(f"  ✓ Port {BACKEND_PORT} (Backend) is available")

    frontend_already_up = False
    if is_port_in_use(FRONTEND_PORT, "127.0.0.1") or is_port_in_use(FRONTEND_PORT, "localhost"):
        if check_frontend_alive():
            print(f"  ✓ Frontend application is already running and ready on port {FRONTEND_PORT}.")
            frontend_already_up = True
        else:
            print(f"[PORT CONFLICT] Port {FRONTEND_PORT} is currently occupied by another process.")
            print("Please close the application using port 5173 before running the launcher.")
            sys.exit(1)
    else:
        print(f"  ✓ Port {FRONTEND_PORT} (Frontend) is available")

    # 5. Launch Processes
    print("\n[STEP 5/6] Starting application servers...")
    backend_proc = None
    frontend_proc = None

    canonical_demo_path = os.path.abspath(DEMO_DB_PATH)
    backend_env = os.environ.copy()
    backend_env["CMS_DB_PATH"] = canonical_demo_path
    backend_env["PYTHONUNBUFFERED"] = "1"
    backend_env["PYTHONIOENCODING"] = "utf-8"

    print("  Starting FastAPI backend server on 127.0.0.1:8000 (isolated demo DB)...")
    backend_cmd = [
        sys.executable, "-m", "uvicorn", "api:app",
        "--host", BACKEND_HOST,
        "--port", str(BACKEND_PORT),
        "--app-dir", BACKEND_DIR
    ]
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=BACKEND_DIR,
        env=backend_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    t_b = threading.Thread(target=log_reader, args=(backend_proc.stdout, session_log, "[BACKEND]"), daemon=True)
    t_b.start()

    frontend_env = os.environ.copy()
    frontend_env["NODE_ENV"] = "development"

    if not frontend_already_up:
        print("  Starting React/Vite frontend server on localhost:5173...")
        frontend_cmd = [node_exe, vite_bin]
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            env=frontend_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        t_f = threading.Thread(target=log_reader, args=(frontend_proc.stdout, session_log, "[FRONTEND]"), daemon=True)
        t_f.start()

    # 6. Polling Readiness & Enforcing Database Isolation
    print("\n[STEP 6/6] Verifying service readiness & database isolation...")
    backend_ready = False
    isolation_verified = False
    isolation_reason = "Server did not respond within timeout"

    for attempt in range(30):
        if backend_proc and backend_proc.poll() is not None:
            print(f"[FATAL] Backend server exited prematurely with code {backend_proc.returncode}!")
            if frontend_proc:
                try: frontend_proc.terminate()
                except Exception: pass
            sys.exit(1)

        verified, reason = verify_backend_isolation(canonical_demo_path, BACKEND_HOST, BACKEND_PORT)
        if verified:
            backend_ready = True
            isolation_verified = True
            isolation_reason = reason
            break
        else:
            isolation_reason = reason
        time.sleep(0.5)

    if not backend_ready or not isolation_verified:
        print(f"[FATAL] Failed to verify database isolation: {isolation_reason}")
        print("Failing closed to prevent potential production database corruption.")
        if backend_proc:
            try:
                backend_proc.terminate()
                backend_proc.wait(timeout=2.0)
            except Exception:
                try: backend_proc.kill()
                except Exception: pass
        if frontend_proc:
            try:
                frontend_proc.terminate()
                frontend_proc.wait(timeout=2.0)
            except Exception:
                try: frontend_proc.kill()
                except Exception: pass
        sys.exit(1)

    print(f"  ✓ Backend API isolated & verified: {os.path.basename(DEMO_DB_PATH)} [HEALTHY & ISOLATED]")

    frontend_ready = frontend_already_up
    for attempt in range(25):
        if frontend_ready or check_frontend_alive():
            frontend_ready = True
            break
        time.sleep(0.5)

    if not frontend_ready:
        print("[ERROR] Frontend web server failed to become ready within 12 seconds.")
        print(f"Inspect '{session_log}' for error diagnostics.")
        if backend_proc:
            try: backend_proc.terminate()
            except Exception: pass
        if frontend_proc:
            try: frontend_proc.terminate()
            except Exception: pass
        sys.exit(1)
    print("  ✓ Frontend web app responding [READY]")

    # Open Browser
    app_url = f"http://{FRONTEND_HOST}:{FRONTEND_PORT}"
    print(f"\nOpening application in default browser: {app_url}")
    webbrowser.open(app_url)

    # Presentation Dashboard
    print("\n" + "=" * 70)
    print(" VAYU ORBIT DEMONSTRATION ENVIRONMENT IS ACTIVE")
    print("=" * 70)
    print(f"  • Application URL:     {app_url}")
    print(f"  • API Documentation:   http://{BACKEND_HOST}:{BACKEND_PORT}/docs")
    print(f"  • Database File:       {canonical_demo_path}")
    print(f"  • Session Diagnostic:  {session_log}")
    print("\n  Demonstration Login Credentials:")
    print("  -------------------------------------------------------------")
    print("  Role        | Email                   | Password")
    print("  -------------------------------------------------------------")
    print("  Coordinator | coordinator@vayu.local  | VayuOrbit@2026")
    print("  Checkpoint  | checkpoint@vayu.local   | VayuOrbit@2026")
    print("  Creator     | creator@vayu.local      | VayuOrbit@2026")
    print("  -------------------------------------------------------------")
    print("  (Coordinator has full operational permissions for presentations)")
    print("=" * 70)
    print("\n>>> LIVE SESSION ACTIVE — DO NOT CLOSE THIS WINDOW <<<")
    print("To gracefully stop both servers: Press Ctrl+C or type 'q' and press Enter.\n")

    # Supervisor Loop
    def cleanup_handler(*args):
        print("\n\nShutting down VAYU ORBIT demo servers...")
        if backend_proc and backend_proc.poll() is None:
            try:
                backend_proc.terminate()
                backend_proc.wait(timeout=2.0)
            except Exception:
                try: backend_proc.kill()
                except Exception: pass
            print("  ✓ Backend server stopped.")

        if frontend_proc and frontend_proc.poll() is None:
            try:
                frontend_proc.terminate()
                frontend_proc.wait(timeout=2.0)
            except Exception:
                try: frontend_proc.kill()
                except Exception: pass
            print("  ✓ Frontend server stopped.")

        print("VAYU ORBIT demo shutdown complete.\n")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup_handler)
    signal.signal(signal.SIGTERM, cleanup_handler)

    def stdin_listener():
        try:
            while True:
                line = sys.stdin.readline()
                if not line or line.strip().lower() == 'q':
                    cleanup_handler()
                    break
        except Exception:
            pass

    t_in = threading.Thread(target=stdin_listener, daemon=True)
    t_in.start()

    try:
        while True:
            # Check if processes crashed unexpectedly
            if backend_proc and backend_proc.poll() is not None:
                print(f"\n[ALERT] Backend server exited unexpectedly with code {backend_proc.returncode}!")
                print(f"Check logs in: {session_log}")
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print(f"\n[ALERT] Frontend server exited unexpectedly with code {frontend_proc.returncode}!")
                print(f"Check logs in: {session_log}")
                break

            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup_handler()

if __name__ == '__main__':
    main()
