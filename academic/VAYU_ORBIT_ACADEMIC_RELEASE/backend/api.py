import os, sqlite3, uuid, json, math, hashlib
from typing import Optional, Any, Dict, List
from datetime import datetime, timezone
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import fleet_engine, tactical_router, intelligence_engine, scenario_engine, voram_service
import networkx as nx
import auth
import audit_service
import revision_service
import report_service
import report_pdf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
def get_db_path(): return os.environ.get('CMS_DB_PATH', os.path.join(BASE_DIR, 'military_logistics.db'))
DB_PATH = get_db_path()

app = FastAPI(title='CMS Simulation API', version='6.0.0')

# Restrict CORS explicitly to authorized frontend origins with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

def now(): return datetime.now(timezone.utc).isoformat()

def _configure_connection(c):
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL;')
    c.execute('PRAGMA busy_timeout=5000;')
    c.execute('PRAGMA synchronous=NORMAL;')
    return c

@contextmanager
def db_transaction():
    c = sqlite3.connect(get_db_path(), timeout=5.0, isolation_level=None)
    _configure_connection(c)
    c.execute('BEGIN IMMEDIATE;')
    try:
        yield c
        c.execute('COMMIT;')
    except Exception:
        c.execute('ROLLBACK;')
        raise
    finally:
        c.close()

def conn():
    c = sqlite3.connect(get_db_path(), timeout=5.0)
    return _configure_connection(c)

def query(sql, args=(), one=False):
    c = conn()
    try:
        rows = c.execute(sql, args).fetchall()
        data = [dict(r) for r in rows]
        return data[0] if one and data else (None if one else data)
    finally:
        c.close()

def execsql(sql, args=()):
    with db_transaction() as c:
        c.execute(sql, args)

def init_schema():
    db_path = get_db_path()
    # Guard: Never modify baseline production database directly
    if os.path.basename(db_path) == 'military_logistics.db':
        return
    c = conn()
    try:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS places (
          place_id TEXT PRIMARY KEY, place_name TEXT NOT NULL, category TEXT NOT NULL,
          region TEXT DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
          access_class TEXT NOT NULL DEFAULT 'SIMULATION', max_vehicle_tons REAL DEFAULT 12,
          clearance_m REAL DEFAULT 4.0, support_services TEXT DEFAULT '', description TEXT DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS journeys (
          journey_id TEXT PRIMARY KEY, origin_id TEXT NOT NULL, dest_id TEXT NOT NULL,
          origin_name TEXT, dest_name TEXT, departure_date TEXT, departure_time TEXT,
          status TEXT NOT NULL DEFAULT 'DRAFT', convoy_json TEXT DEFAULT '[]', route_json TEXT DEFAULT '{}',
          baseline_route_json TEXT DEFAULT '{}', risk REAL, distance_km REAL, eta_hours REAL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS journey_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, journey_id TEXT NOT NULL, event_type TEXT NOT NULL,
          message TEXT NOT NULL, payload_json TEXT DEFAULT '{}', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, object_type TEXT, object_id TEXT,
          details TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vehicle_status (
          vehicle_id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fleet_units (
          unit_id TEXT PRIMARY KEY,
          model_id TEXT NOT NULL,
          callsign TEXT,
          status TEXT NOT NULL DEFAULT 'AVAILABLE',
          registration_no TEXT,
          assigned_base TEXT DEFAULT '',
          is_demo INTEGER NOT NULL DEFAULT 0,
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (model_id) REFERENCES vehicle_master(vehicle_id)
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
          role TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          journey_id TEXT NOT NULL,
          vehicle_id TEXT,
          unit_id TEXT,
          rule_type TEXT NOT NULL,
          violation_type TEXT NOT NULL,
          message TEXT NOT NULL,
          evidence_source TEXT NOT NULL DEFAULT 'MANUAL_REPORT',
          observation_time TEXT NOT NULL,
          last_known_pos TEXT DEFAULT NULL,
          verification_state TEXT NOT NULL DEFAULT 'SUSPECTED',
          handling_state TEXT NOT NULL DEFAULT 'OPEN',
          operator_ack TEXT DEFAULT NULL,
          checkpoint_ack TEXT DEFAULT NULL,
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          resolution_details TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (journey_id) REFERENCES journeys(journey_id)
        );
        CREATE TABLE IF NOT EXISTS journey_spacing_config (
          journey_id TEXT PRIMARY KEY,
          min_spacing_m REAL NOT NULL DEFAULT 40.0,
          max_spacing_m REAL DEFAULT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          reason TEXT DEFAULT '',
          FOREIGN KEY (journey_id) REFERENCES journeys(journey_id)
        );
        CREATE TABLE IF NOT EXISTS journey_fuel_config (
          journey_id TEXT PRIMARY KEY,
          reserve_percent REAL NOT NULL DEFAULT 20.0,
          departure_fuel_mode TEXT NOT NULL DEFAULT 'UNKNOWN',
          vehicle_fuel_levels_json TEXT DEFAULT '{}',
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          notes TEXT DEFAULT '',
          FOREIGN KEY (journey_id) REFERENCES journeys(journey_id)
        );
        CREATE TABLE IF NOT EXISTS journey_fuel_overrides (
          journey_id TEXT PRIMARY KEY,
          override_type TEXT NOT NULL,
          fuel_assessment_status TEXT NOT NULL,
          assessment_hash TEXT NOT NULL,
          reason TEXT NOT NULL,
          authorized_by TEXT NOT NULL,
          authorized_role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (journey_id) REFERENCES journeys(journey_id)
        );
        CREATE TABLE IF NOT EXISTS rop_reports (
          report_id TEXT PRIMARY KEY,
          journey_id TEXT NOT NULL,
          route_version TEXT NOT NULL,
          reporting_user_id TEXT NOT NULL,
          reporting_user_email TEXT NOT NULL,
          reporting_user_role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SUBMITTED',
          observation_period_start TEXT,
          observation_period_end TEXT,
          parameters_json TEXT NOT NULL DEFAULT '{}',
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          review_decision_notes TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS journey_sensitivity_advisory (
          journey_id TEXT PRIMARY KEY,
          sensitivity_level TEXT NOT NULL DEFAULT 'STANDARD',
          escort_requirement_state TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
          policy_reference TEXT NOT NULL DEFAULT 'DEF-LOG-SOP-2026/SEC-04',
          support_notes TEXT DEFAULT '',
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          confirmed_by TEXT DEFAULT NULL,
          confirmed_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS journey_readiness_overrides (
          journey_id TEXT PRIMARY KEY,
          override_type TEXT NOT NULL DEFAULT 'READINESS_ADVISORY_OVERRIDE',
          reason TEXT NOT NULL,
          authorized_by TEXT NOT NULL,
          authorized_role TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS staged_sessions (
          staged_id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ''')

        # Additive vehicle_master fuel specification columns
        vm_cols = [r[1] for r in c.execute("PRAGMA table_info(vehicle_master)").fetchall()]
        if 'fuel_type' not in vm_cols:
            c.execute("ALTER TABLE vehicle_master ADD COLUMN fuel_type TEXT DEFAULT 'DIESEL'")
        if 'tank_capacity_liters' not in vm_cols:
            c.execute("ALTER TABLE vehicle_master ADD COLUMN tank_capacity_liters REAL DEFAULT NULL")
        if 'fuel_consumption_kmpl' not in vm_cols:
            c.execute("ALTER TABLE vehicle_master ADD COLUMN fuel_consumption_kmpl REAL DEFAULT NULL")
        if 'fuel_spec_verified' not in vm_cols:
            c.execute("ALTER TABLE vehicle_master ADD COLUMN fuel_spec_verified INTEGER DEFAULT 1")

        # Seed verified fuel specifications
        known_fuel_specs = {
            'V-LTV-01': ('DIESEL', 63.0, 9.5, 1),
            'V-LTV-01B': ('DIESEL', 65.0, 10.0, 1),
            'V-LTV-02': ('DIESEL', 70.0, 7.1, 1),
            'V-LTV-03': ('PETROL', 40.0, 11.2, 1),
            'V-LTV-03B': ('DIESEL', 63.0, 7.9, 1),
            'V-LTV-04': ('DIESEL', 250.0, 3.2, 1),
            'V-LTV-05': ('DIESEL', 70.0, 7.1, 1),
            'V-LTV-06': ('DIESEL', 180.0, 3.3, 1),
            'V-LTV-07': ('DIESEL', 60.0, 10.8, 1),
            'V-MSV-01': ('DIESEL', 200.0, 2.5, 1),
            'V-MSV-02': ('DIESEL', 160.0, 3.4, 1),
            'V-MSV-03': ('DIESEL', 300.0, 2.0, 1),
            'V-MSV-04': ('DIESEL', 200.0, 2.75, 1),
            'V-MSV-05': ('DIESEL', 90.0, 5.0, 1),
            'V-MSV-06': ('DIESEL', 160.0, 3.4, 1),
            'V-MSV-07': ('DIESEL', 160.0, 3.4, 1),
            'V-HSV-01': ('DIESEL', 400.0, 1.62, 1),
            'V-HSV-02': ('DIESEL', 300.0, 1.67, 1),
            'V-HSV-03': ('DIESEL', 500.0, 1.2, 1),
            'V-HSV-04': ('DIESEL', 350.0, 1.71, 1),
            'V-HSV-05': ('DIESEL', 400.0, 1.25, 1),
            'V-HSV-06': ('DIESEL', 400.0, 1.5, 1),
            'V-HSV-07': ('DIESEL', 400.0, 1.38, 1),
            'V-HSV-08': ('DIESEL', 60.0, 10.0, 1),
            'V-HSV-09': ('DIESEL', 300.0, 1.5, 0),
            'V-ACV-01': ('DIESEL', 462.0, 1.08, 1),
            'V-ACV-02': ('DIESEL', 1600.0, 0.28, 1),
            'V-ACV-02B': ('DIESEL', 1200.0, 0.4, 1),
            'V-ACV-03': ('DIESEL', 1610.0, 0.28, 1),
            'V-ACV-04': ('DIESEL', 350.0, 1.43, 0),
            'V-ACV-05': ('DIESEL', 250.0, 2.0, 0),
            'V-ACV-06': ('DIESEL', 300.0, 1.33, 0),
            'V-HET-01': ('DIESEL', 600.0, 0.83, 1),
            'V-HET-02': ('DIESEL', 500.0, 1.0, 1),
            'V-HET-03': ('DIESEL', 400.0, 1.25, 1),
            'V-HET-04': ('DIESEL', 1000.0, 0.45, 1),
        }
        for vid, (ft, tc, fck, fsv) in known_fuel_specs.items():
            c.execute("UPDATE vehicle_master SET fuel_type=?, tank_capacity_liters=?, fuel_consumption_kmpl=?, fuel_spec_verified=? WHERE vehicle_id=? AND tank_capacity_liters IS NULL",
                      [ft, tc, fck, fsv, vid])
        if c.execute('SELECT COUNT(*) FROM places').fetchone()[0] == 0:
            rows = c.execute('SELECT node_id, installation_name, node_type, state, lat, lon, max_axle_load_tons FROM military_nodes').fetchall()
            for r in rows:
                pid = 'PLC-' + r[0]
                c.execute("""
                    INSERT OR IGNORE INTO places (
                        place_id, place_name, category, region, lat, lon,
                        status, access_class, max_vehicle_tons, clearance_m,
                        support_services, description, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (pid, r[1], r[2], r[3], r[4], r[5], 'ACTIVE', 'SIMULATION', r[6], 4.0, 'Fuel, maintenance', 'Seeded simulation place from project dataset', now(), now()))
        
        # Seed default users if they do not exist
        default_users = [
            ("USR-CREATOR-01", "creator@vayu.local", "VayuOrbit@2026", "CREATOR"),
            ("USR-CHECKPOINT-01", "checkpoint@vayu.local", "VayuOrbit@2026", "CHECKPOINT_OPERATOR"),
            ("USR-COORDINATOR-01", "coordinator@vayu.local", "VayuOrbit@2026", "COORDINATOR")
        ]
        for uid, email, password, role in default_users:
            existing = c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
            if not existing:
                pw_hash = auth.hash_password(password)
                c.execute("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
                          (uid, email, pw_hash, role))
        
        audit_service.migrate_audit_schema(c)
        c.commit()
    finally:
        c.close()
init_schema()

# --- RBAC & Authentication Dependencies ---
def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.cookies.get(auth.COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized: Authentication required.")
    payload = auth.decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid or expired token.")
    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "role": payload.get("role")
    }

def require_role(allowed_roles: list[str]):
    def role_checker(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: Role '{user_role}' is not authorized. Required: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker

ROLE_ALL = ["CREATOR", "CHECKPOINT_OPERATOR", "COORDINATOR", "ADMIN"]
ROLE_PLANNER = ["CREATOR", "COORDINATOR", "ADMIN"]
ROLE_OPS = ["COORDINATOR", "CHECKPOINT_OPERATOR", "ADMIN"]
ROLE_COORDINATOR = ["COORDINATOR", "ADMIN"]

# --- Authentication Routes ---
class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest, response: Response):
    email_clean = req.email.strip().lower()
    user = query("SELECT * FROM users WHERE email=?", [email_clean], one=True)
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = auth.create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key=auth.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=24 * 3600
    )
    return {
        "ok": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"]
        },
        "token": token
    }

@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=auth.COOKIE_NAME,
        httponly=True,
        samesite="lax"
    )
    return {"ok": True, "message": "Successfully logged out."}

@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {"ok": True, "user": current_user}

# --- Core Business Endpoints Wrapped with RBAC ---
def node_map(): return {n['node_id']:n for n in query('SELECT * FROM military_nodes')}

@app.get('/')
def root(_user: dict = Depends(require_role(ROLE_ALL))):
    return {'name':'CMS Simulation','version':'6.0.0','docs':'/docs'}

@app.get('/api/health')
def health(_user: dict = Depends(require_role(ROLE_ALL))):
    return {'status':'ONLINE','phase':6,'routing':'constraint-aware simulation','intelligence':'simulated-sitrep-parser','simulation':'what-if-scenario-engine','version':'6.0.0'}

@app.get('/api/diagnostic/database')
def diagnostic_database():
    """
    Read-only diagnostic endpoint confirming the effective database target.
    Exposes only the database file basename and SHA-256 hash of the canonical path
    to avoid leaking filesystem secrets, system directories, or usernames.
    Cannot be used to modify configuration, run queries, or bypass authentication.
    """
    effective_path = os.path.abspath(get_db_path())
    target_name = os.path.basename(effective_path)
    canonical_hash = hashlib.sha256(effective_path.encode('utf-8')).hexdigest()
    is_demo = target_name == "military_logistics_demo.db"
    return {
        "status": "CONFIGURED",
        "database_target": target_name,
        "path_sha256": canonical_hash,
        "is_demo_isolated": is_demo
    }

@app.get('/api/nodes')
def nodes(_user: dict = Depends(require_role(ROLE_ALL))):
    return node_map()

@app.get('/api/vehicles')
def vehicles(status: str='ALL', _user: dict = Depends(require_role(ROLE_ALL))):
    base = "SELECT vm.*, COALESCE(vs.status, 'AVAILABLE') AS status FROM vehicle_master vm LEFT JOIN vehicle_status vs ON vs.vehicle_id=vm.vehicle_id WHERE vm.is_active = 1"
    rows = query(base)
    unit_stats = query("SELECT model_id, COUNT(*) as total_units, SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END) as available_units FROM fleet_units GROUP BY model_id")
    stats_map = {u['model_id']: u for u in unit_stats}
    for r in rows:
        img = r.get('image_url') or ''
        if img.endswith('.png'):
            r['image_url'] = img[:-4] + '.svg'
        st = stats_map.get(r['vehicle_id'], {'total_units': 0, 'available_units': 0})
        r['total_units'] = int(st['total_units']) if st['total_units'] is not None else 0
        r['available_units'] = int(st['available_units']) if st['available_units'] is not None else 0
    if status != 'ALL': rows = [r for r in rows if r['status'] == status]
    return rows

@app.get('/api/fleet-units')
def fleet_units(status: str='ALL', _user: dict = Depends(require_role(ROLE_ALL))):
    sql = """
    SELECT fu.*, vm.model_name, vm.class_type, vm.maker, vm.role_category, vm.gvw_tons, vm.max_speed_kmh, vm.operational_range_km, vm.is_vip
    FROM fleet_units fu
    JOIN vehicle_master vm ON vm.vehicle_id = fu.model_id
    ORDER BY fu.unit_id
    """
    rows = query(sql)
    if status != 'ALL': rows = [r for r in rows if r['status'] == status]
    return rows

class FleetUnitCreate(BaseModel):
    unit_id: str = Field(min_length=2, max_length=40)
    model_id: str = Field(min_length=2, max_length=40)
    callsign: str = Field(default='', max_length=100)
    status: str = Field(default='AVAILABLE', max_length=30)
    registration_no: str = Field(default='', max_length=50)
    assigned_base: str = Field(default='', max_length=50)
    notes: str = Field(default='', max_length=300)

@app.post('/api/fleet-units')
def create_fleet_unit(fu: FleetUnitCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if query('SELECT 1 FROM fleet_units WHERE unit_id=?', [fu.unit_id], True):
        raise HTTPException(409, 'Fleet Unit ID already exists.')
    if not query('SELECT 1 FROM vehicle_master WHERE vehicle_id=?', [fu.model_id], True):
        raise HTTPException(400, f'Vehicle model {fu.model_id} not found in master catalog.')
    t = now()
    with db_transaction() as c:
        c.execute("""
            INSERT INTO fleet_units (unit_id, model_id, callsign, status, registration_no, assigned_base, is_demo, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        """, (fu.unit_id, fu.model_id, fu.callsign, fu.status, fu.registration_no, fu.assigned_base, fu.notes, t, t))
        after_row = c.execute('SELECT * FROM fleet_units WHERE unit_id=?', [fu.unit_id]).fetchone()
        after_dict = dict(after_row) if after_row else None
        audit_service.record_audit(
            c=c,
            action='CREATE',
            object_type='FLEET_UNIT',
            object_id=fu.unit_id,
            details=f"Registered physical fleet unit '{fu.unit_id}' (Callsign: {fu.callsign or 'N/A'}, Model: {fu.model_id})",
            user=_user,
            after=after_dict,
            timestamp=t
        )
    return after_dict

class FleetUnitStatus(BaseModel):
    status: str

@app.post('/api/fleet-units/{unit_id}/status')
def update_fleet_unit_status(unit_id: str, s: FleetUnitStatus, _user: dict = Depends(require_role(ROLE_PLANNER))):
    allowed = {'AVAILABLE', 'ASSIGNED', 'IN_OPERATION', 'MAINTENANCE', 'RETIRED'}
    if s.status not in allowed: raise HTTPException(400, 'Invalid unit status.')
    t = now()
    with db_transaction() as c:
        before_row = c.execute('SELECT * FROM fleet_units WHERE unit_id=?', [unit_id]).fetchone()
        if not before_row:
            raise HTTPException(404, 'Fleet unit not found.')
        before_dict = dict(before_row)
        c.execute('UPDATE fleet_units SET status=?, updated_at=? WHERE unit_id=?', [s.status, t, unit_id])
        after_row = c.execute('SELECT * FROM fleet_units WHERE unit_id=?', [unit_id]).fetchone()
        after_dict = dict(after_row) if after_row else {'unit_id': unit_id, 'status': s.status}
        audit_service.record_audit(
            c=c,
            action='STATUS_CHANGE',
            object_type='FLEET_UNIT',
            object_id=unit_id,
            details=f"Changed fleet unit '{unit_id}' status from {before_dict.get('status')} to {s.status}",
            user=_user,
            before=before_dict,
            after=after_dict,
            timestamp=t
        )
    return {'unit_id': unit_id, 'status': s.status}

class VehicleCreate(BaseModel):
    vehicle_id: str = Field(min_length=2, max_length=40)
    class_type: str = Field(min_length=1, max_length=50)
    model_name: str = Field(min_length=1, max_length=100)
    maker: str = Field(min_length=1, max_length=100)
    axle_config: str = Field(default='', max_length=30)
    gvw_tons: float = Field(gt=0, le=500)
    operational_range_km: int = Field(gt=0, le=10000)
    max_speed_kmh: int = Field(gt=0, le=200)
    routing_footprint: str = Field(default='Standard clearance', max_length=100)
    role_category: str = Field(default='DUAL', max_length=50)
    is_vip: int = Field(default=0, ge=0, le=1)
    rated_passenger_capacity: Optional[int] = Field(default=None)
    passenger_capacity_verified: int = Field(default=0, ge=0, le=1)
    rated_payload_tons: Optional[float] = Field(default=None)
    payload_capacity_verified: int = Field(default=0, ge=0, le=1)
    capacity_source_note: str = Field(default='', max_length=300)
    image_url: str = Field(default='', max_length=300)
    fuel_type: str = Field(default='DIESEL', max_length=20)
    tank_capacity_liters: Optional[float] = Field(default=None, gt=0, le=5000)
    fuel_consumption_kmpl: Optional[float] = Field(default=None, gt=0, le=100)
    fuel_spec_verified: int = Field(default=1, ge=0, le=1)
    provenance_status: Optional[str] = Field(default=None, max_length=50)
    evidence_source_type: Optional[str] = Field(default=None, max_length=100)
    evidence_reference: Optional[str] = Field(default=None, max_length=255)
    change_summary: Optional[str] = Field(default=None, max_length=500)

class VehicleStatus(BaseModel): status: str

@app.post('/api/vehicles')
def add_vehicle(v: VehicleCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if v.provenance_status == 'VERIFIED_EVIDENCED':
        raise HTTPException(422, "Provenance status 'VERIFIED_EVIDENCED' is not permitted without verified documentary evidence.")
    if query('SELECT 1 FROM vehicle_master WHERE vehicle_id=?', [v.vehicle_id], True):
        raise HTTPException(409, 'Vehicle ID already exists.')
    t = now()
    try:
        with db_transaction() as c:
            c.execute("""
                INSERT INTO vehicle_master (
                    vehicle_id, class_type, model_name, maker, axle_config,
                    gvw_tons, operational_range_km, max_speed_kmh, routing_footprint,
                    role_category, is_vip, rated_passenger_capacity, passenger_capacity_verified,
                    rated_payload_tons, payload_capacity_verified, capacity_source_note,
                    image_url, is_active, fuel_type, tank_capacity_liters,
                    fuel_consumption_kmpl, fuel_spec_verified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            """, (
                v.vehicle_id, v.class_type, v.model_name, v.maker, v.axle_config,
                v.gvw_tons, v.operational_range_km, v.max_speed_kmh, v.routing_footprint,
                v.role_category, v.is_vip, v.rated_passenger_capacity, v.passenger_capacity_verified,
                v.rated_payload_tons, v.payload_capacity_verified, v.capacity_source_note,
                v.image_url, v.fuel_type, v.tank_capacity_liters,
                v.fuel_consumption_kmpl, v.fuel_spec_verified
            ))
            after_row = c.execute('SELECT * FROM vehicle_master WHERE vehicle_id=?', [v.vehicle_id]).fetchone()
            after_dict = dict(after_row) if after_row else None

            # Determine initial revision provenance
            prov_status = v.provenance_status
            prov_note = v.evidence_reference or ""
            if not prov_status:
                prov_status, prov_note = revision_service.classify_baseline_provenance(after_dict)

            rev_id, rev_no, spec_hash = revision_service.record_spec_revision(
                c=c,
                vehicle_id=v.vehicle_id,
                spec_data=after_dict,
                change_source='API_CREATE',
                user=_user,
                change_summary=v.change_summary or f"Initial specification for vehicle model '{v.model_name}' ({v.vehicle_id})",
                provenance_status=prov_status,
                evidence_source_type=v.evidence_source_type or 'CATALOG_SPEC',
                evidence_reference=v.evidence_reference or prov_note or 'Vehicle model creation via API',
                timestamp=t
            )

            audit_service.record_audit(
                c=c,
                action='CREATE',
                object_type='VEHICLE_MODEL',
                object_id=v.vehicle_id,
                details=f"Created vehicle model '{v.model_name}' ({v.vehicle_id}) [Revision #{rev_no}]",
                user=_user,
                after=after_dict,
                timestamp=t
            )
    except sqlite3.IntegrityError:
        raise HTTPException(400, 'Database integrity constraint violated.')
    return after_dict

@app.patch('/api/vehicles/{vehicle_id}')
def edit_vehicle(vehicle_id: str, v: VehicleCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if v.provenance_status == 'VERIFIED_EVIDENCED':
        raise HTTPException(422, "Provenance status 'VERIFIED_EVIDENCED' is not permitted without verified documentary evidence.")
    t = now()
    with db_transaction() as c:
        before_row = c.execute('SELECT * FROM vehicle_master WHERE vehicle_id=?', [vehicle_id]).fetchone()
        if not before_row:
            raise HTTPException(404, 'Vehicle not found.')
        before_dict = dict(before_row)

        # Construct candidate updated dict
        candidate_dict = dict(before_dict)
        candidate_dict.update({
            'class_type': v.class_type,
            'model_name': v.model_name,
            'maker': v.maker,
            'axle_config': v.axle_config,
            'gvw_tons': v.gvw_tons,
            'operational_range_km': v.operational_range_km,
            'max_speed_kmh': v.max_speed_kmh,
            'routing_footprint': v.routing_footprint,
            'role_category': v.role_category,
            'is_vip': v.is_vip,
            'rated_passenger_capacity': v.rated_passenger_capacity,
            'passenger_capacity_verified': v.passenger_capacity_verified,
            'rated_payload_tons': v.rated_payload_tons,
            'payload_capacity_verified': v.payload_capacity_verified,
            'capacity_source_note': v.capacity_source_note,
            'image_url': v.image_url,
            'fuel_type': v.fuel_type,
            'tank_capacity_liters': v.tank_capacity_liters,
            'fuel_consumption_kmpl': v.fuel_consumption_kmpl,
            'fuel_spec_verified': v.fuel_spec_verified
        })

        is_noop, technical_changed, display_only, changed_fields = revision_service.classify_spec_changes(
            before_dict, candidate_dict
        )

        # Case 1: No-op update -> 0 writes, 0 revisions, 0 audits
        if is_noop:
            return before_dict

        # Case 2: Display metadata only -> update master, 1 audit, 0 revisions
        if display_only:
            c.execute("""
                UPDATE vehicle_master SET
                    capacity_source_note=?, image_url=?
                WHERE vehicle_id=?
            """, [v.capacity_source_note, v.image_url, vehicle_id])
            after_row = c.execute('SELECT * FROM vehicle_master WHERE vehicle_id=?', [vehicle_id]).fetchone()
            after_dict = dict(after_row) if after_row else None
            audit_service.record_audit(
                c=c,
                action='UPDATE',
                object_type='VEHICLE_MODEL',
                object_id=vehicle_id,
                details=f"Updated display metadata for vehicle model '{vehicle_id}' ({', '.join(changed_fields)})",
                user=_user,
                before=before_dict,
                after=after_dict,
                timestamp=t
            )
            return after_dict

        # Case 3: Technical or identity spec change -> update master, 1 revision, 1 audit
        c.execute("""
            UPDATE vehicle_master SET
                class_type=?, model_name=?, maker=?, axle_config=?, gvw_tons=?,
                operational_range_km=?, max_speed_kmh=?, routing_footprint=?,
                role_category=?, is_vip=?, rated_passenger_capacity=?, passenger_capacity_verified=?,
                rated_payload_tons=?, payload_capacity_verified=?, capacity_source_note=?, image_url=?,
                fuel_type=?, tank_capacity_liters=?, fuel_consumption_kmpl=?, fuel_spec_verified=?
            WHERE vehicle_id=?
        """, [
            v.class_type, v.model_name, v.maker, v.axle_config, v.gvw_tons,
            v.operational_range_km, v.max_speed_kmh, v.routing_footprint,
            v.role_category, v.is_vip, v.rated_passenger_capacity, v.passenger_capacity_verified,
            v.rated_payload_tons, v.payload_capacity_verified, v.capacity_source_note, v.image_url,
            v.fuel_type, v.tank_capacity_liters, v.fuel_consumption_kmpl, v.fuel_spec_verified,
            vehicle_id
        ])
        after_row = c.execute('SELECT * FROM vehicle_master WHERE vehicle_id=?', [vehicle_id]).fetchone()
        after_dict = dict(after_row) if after_row else None

        prov_status = v.provenance_status
        prov_note = v.evidence_reference or ""
        if not prov_status:
            prov_status, prov_note = revision_service.classify_baseline_provenance(after_dict)

        rev_id, rev_no, spec_hash = revision_service.record_spec_revision(
            c=c,
            vehicle_id=vehicle_id,
            spec_data=after_dict,
            change_source='API_UPDATE',
            user=_user,
            change_summary=v.change_summary or f"Updated specification ({', '.join(changed_fields)})",
            provenance_status=prov_status,
            evidence_source_type=v.evidence_source_type or 'MANUAL_UPDATE',
            evidence_reference=v.evidence_reference or prov_note or f"Updated fields: {', '.join(changed_fields)}",
            timestamp=t
        )

        audit_service.record_audit(
            c=c,
            action='UPDATE',
            object_type='VEHICLE_MODEL',
            object_id=vehicle_id,
            details=f"Updated vehicle model '{vehicle_id}' [Revision #{rev_no}] ({', '.join(changed_fields)})",
            user=_user,
            before=before_dict,
            after=after_dict,
            timestamp=t
        )
        return after_dict

@app.post('/api/vehicles/{vehicle_id}/status')
def vehicle_status(vehicle_id: str, v: VehicleStatus, _user: dict = Depends(require_role(ROLE_PLANNER))):
    allowed = {'AVAILABLE', 'ASSIGNED', 'IN_OPERATION', 'MAINTENANCE', 'RETIRED'}
    if v.status not in allowed: raise HTTPException(400, 'Invalid vehicle status.')
    t = now()
    with db_transaction() as c:
        if not c.execute('SELECT 1 FROM vehicle_master WHERE vehicle_id=?', [vehicle_id]).fetchone():
            raise HTTPException(404, 'Vehicle not found.')
        before_row = c.execute('SELECT status FROM vehicle_status WHERE vehicle_id=?', [vehicle_id]).fetchone()
        before_status = before_row['status'] if before_row else 'AVAILABLE'
        c.execute('INSERT INTO vehicle_status(vehicle_id,status,updated_at) VALUES(?,?,?) ON CONFLICT(vehicle_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at', [vehicle_id, v.status, t])
        audit_service.record_audit(
            c=c,
            action='STATUS_CHANGE',
            object_type='VEHICLE_MODEL',
            object_id=vehicle_id,
            details=f"Changed vehicle model '{vehicle_id}' status to {v.status}",
            user=_user,
            before={'status': before_status},
            after={'status': v.status},
            timestamp=t
        )
    return {'vehicle_id': vehicle_id, 'status': v.status}

@app.get('/api/vehicles/{vehicle_id}/revisions')
def get_vehicle_revisions(vehicle_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    c = conn()
    try:
        if not c.execute('SELECT 1 FROM vehicle_master WHERE vehicle_id=?', [vehicle_id]).fetchone():
            raise HTTPException(404, 'Vehicle not found.')
        return revision_service.get_vehicle_revisions(c, vehicle_id)
    finally:
        c.close()

class PlaceCreate(BaseModel):
    place_name:str=Field(min_length=2,max_length=120)
    category:str=Field(min_length=2,max_length=60)
    region:str=Field(default='',max_length=60)
    lat:float=Field(ge=-90,le=90)
    lon:float=Field(ge=-180,le=180)
    status:str=Field(default='ACTIVE')
    access_class:str=Field(default='SIMULATION',max_length=50)
    max_vehicle_tons:float=Field(gt=0,le=500)
    clearance_m:float=Field(gt=0,le=20)
    support_services:str=Field(default='',max_length=200)
    description:str=Field(default='',max_length=500)

@app.get('/api/places')
def places(status:str='ALL', category:str='ALL', _user: dict = Depends(require_role(ROLE_ALL))):
    rows=query('SELECT * FROM places ORDER BY place_name')
    if status!='ALL': rows=[r for r in rows if r['status']==status]
    if category!='ALL': rows=[r for r in rows if r['category'].lower()==category.lower()]
    return rows

@app.post('/api/places')
def add_place(p: PlaceCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if p.status not in {'ACTIVE', 'INACTIVE'}:
        raise HTTPException(400, "Invalid place status. Must be 'ACTIVE' or 'INACTIVE'.")
    pid = 'PLC-' + uuid.uuid4().hex[:8].upper()
    t = now()
    with db_transaction() as c:
        c.execute("""
            INSERT INTO places (
                place_id, place_name, category, region, lat, lon,
                status, access_class, max_vehicle_tons, clearance_m,
                support_services, description, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, p.place_name, p.category, p.region, p.lat, p.lon,
            p.status, p.access_class, p.max_vehicle_tons, p.clearance_m,
            p.support_services, p.description, t, t
        ))
        after_row = c.execute('SELECT * FROM places WHERE place_id=?', [pid]).fetchone()
        after_dict = dict(after_row) if after_row else None
        audit_service.record_audit(
            c=c,
            action='CREATE',
            object_type='PLACE',
            object_id=pid,
            details=f"Created place '{p.place_name}' ({pid})",
            user=_user,
            after=after_dict,
            timestamp=t
        )
    return after_dict

@app.patch('/api/places/{place_id}')
def edit_place(place_id: str, p: PlaceCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if p.status not in {'ACTIVE', 'INACTIVE'}:
        raise HTTPException(400, "Invalid place status. Must be 'ACTIVE' or 'INACTIVE'.")
    t = now()
    with db_transaction() as c:
        before_row = c.execute('SELECT * FROM places WHERE place_id=?', [place_id]).fetchone()
        if not before_row:
            raise HTTPException(404, 'Place not found.')
        before_dict = dict(before_row)
        c.execute("""
            UPDATE places SET
                place_name=?, category=?, region=?, lat=?, lon=?,
                status=?, access_class=?, max_vehicle_tons=?, clearance_m=?,
                support_services=?, description=?, updated_at=?
            WHERE place_id=?
        """, [
            p.place_name, p.category, p.region, p.lat, p.lon,
            p.status, p.access_class, p.max_vehicle_tons, p.clearance_m,
            p.support_services, p.description, t, place_id
        ])
        after_row = c.execute('SELECT * FROM places WHERE place_id=?', [place_id]).fetchone()
        after_dict = dict(after_row) if after_row else None
        audit_service.record_audit(
            c=c,
            action='UPDATE',
            object_type='PLACE',
            object_id=place_id,
            details=f"Updated place '{place_id}'",
            user=_user,
            before=before_dict,
            after=after_dict,
            timestamp=t
        )
    return after_dict

@app.post('/api/places/{place_id}/status')
def place_status(place_id: str, v: VehicleStatus, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if v.status not in {'ACTIVE', 'INACTIVE'}:
        raise HTTPException(400, 'Invalid place status.')
    t = now()
    with db_transaction() as c:
        before_row = c.execute('SELECT * FROM places WHERE place_id=?', [place_id]).fetchone()
        if not before_row:
            raise HTTPException(404, 'Place not found.')
        before_dict = dict(before_row)
        c.execute('UPDATE places SET status=?, updated_at=? WHERE place_id=?', [v.status, t, place_id])
        after_row = c.execute('SELECT * FROM places WHERE place_id=?', [place_id]).fetchone()
        after_dict = dict(after_row) if after_row else None
        audit_service.record_audit(
            c=c,
            action='STATUS_CHANGE',
            object_type='PLACE',
            object_id=place_id,
            details=f"Changed place '{place_id}' status from {before_dict.get('status')} to {v.status}",
            user=_user,
            before=before_dict,
            after=after_dict,
            timestamp=t
        )
    return after_dict

class RouteRequest(BaseModel):
    origin_id:str=Field(min_length=1,max_length=64)
    dest_id:str=Field(min_length=1,max_length=64)
    convoy_speed_kmh:float=Field(gt=0,le=150)
    max_vehicle_tons:float=Field(default=0,ge=0,le=500)

class SitrepRequest(BaseModel): sitrep:str=Field(min_length=5,max_length=5000)
class DynamicRouteRequest(RouteRequest): sitrep:str=Field(min_length=5,max_length=5000)

def _normalize_node_id(nid: str, graph_nodes) -> str:
    s = nid.strip()
    if s in graph_nodes: return s
    if s.startswith('PLC-') and s[4:] in graph_nodes: return s[4:]
    return s

@app.post('/api/route')
def route_options(req:RouteRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    if req.origin_id.strip() == req.dest_id.strip():
        raise HTTPException(400, 'Origin and destination must be distinct.')
    graph=tactical_router.build_dynamic_graph(get_db_path())
    orig = _normalize_node_id(req.origin_id, graph.nodes)
    dest = _normalize_node_id(req.dest_id, graph.nodes)
    try: routes=tactical_router.calculate_route_options(graph,orig,dest,req.convoy_speed_kmh,req.max_vehicle_tons)
    except ValueError as e: raise HTTPException(400,str(e))
    except Exception as e: return {'status':'ROUTE_UNAVAILABLE','message':str(e),'routes':[]}
    return {
        'status': 'OK',
        'routes': routes,
        'selected_route': routes[0],
        'voram_assessment': routes[0].get('voram_assessment')
    }

@app.post('/api/intelligence/sitrep')
def sitrep(req:SitrepRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    try:return intelligence_engine.parse_sitrep(req.sitrep,node_map())
    except ValueError as e: raise HTTPException(400,str(e))

@app.post('/api/route/recalculate')
def recalc(req:DynamicRouteRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    if req.origin_id.strip() == req.dest_id.strip():
        raise HTTPException(400, 'Origin and destination must be distinct.')
    nodes=node_map()
    try: intel=intelligence_engine.parse_sitrep(req.sitrep,nodes)
    except ValueError as e: raise HTTPException(400,str(e))
    bg=tactical_router.build_dynamic_graph(get_db_path())
    orig = _normalize_node_id(req.origin_id, bg.nodes)
    dest = _normalize_node_id(req.dest_id, bg.nodes)
    try: base=tactical_router.calculate_route_options(bg,orig,dest,req.convoy_speed_kmh,req.max_vehicle_tons)
    except Exception as e:return {'status':'BASELINE_UNAVAILABLE','message':str(e),'intelligence':intel}
    d=dict(intel)
    if d.get('hazard_type')=='BRIDGE_RESTRICTION': d['corridor_from_node']=orig
    ug=tactical_router.build_dynamic_graph(get_db_path(),disruptions=[d])
    try: updated=tactical_router.calculate_route_options(ug,orig,dest,req.convoy_speed_kmh,req.max_vehicle_tons)
    except Exception as e:return {'status':'ROUTE_LOST','message':'No compatible route remains after simulated disruption.','intelligence':intel,'baseline':{'selected_route':base[0],'routes':base},'updated':{'selected_route':None,'routes':[],'error':str(e)}}
    return {'status':'RECALCULATED','message':'Simulated intelligence applied and routes recalculated.','intelligence':intel,'baseline':{'selected_route':base[0],'routes':base},'updated':{'selected_route':updated[0],'routes':updated},'impact':{'route_changed':base[0]['path']!=updated[0]['path'],'distance_delta_km':round(updated[0]['distance_km']-base[0]['distance_km'],2),'eta_delta_hours':round(updated[0]['eta_hours']-base[0]['eta_hours'],2),'risk_delta':round(updated[0]['risk_score']-base[0]['risk_score'],2)}}

class ScenarioCase(BaseModel): name:str=Field(min_length=2,max_length=100); sitrep:str=Field(min_length=5,max_length=5000)
class WhatIfRequest(RouteRequest): scenarios:list[ScenarioCase]=Field(min_length=1,max_length=10)

@app.post('/api/simulation/what-if')
def whatif(req:WhatIfRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    nmap = node_map()
    orig = _normalize_node_id(req.origin_id, nmap)
    dest = _normalize_node_id(req.dest_id, nmap)
    try:return scenario_engine.run_what_if(get_db_path(),nmap,orig,dest,req.convoy_speed_kmh,req.max_vehicle_tons,[s.model_dump() for s in req.scenarios])
    except ValueError as e: raise HTTPException(400,str(e))
    except nx.NetworkXNoPath as e: raise HTTPException(400,str(e))

# ─────────────────────────────────────────────────────────────────
# VORAM v0.1 — Risk Assessment Model Endpoints
# ─────────────────────────────────────────────────────────────────
class VoramAssessRequest(BaseModel):
    parameters: dict = Field(..., description="Map of parameter IDs to numeric scores (0-100) or null")
    safeguard_coefficient: Optional[float] = Field(default=voram_service.DEFAULT_SAFEGUARD_COEFFICIENT, ge=0.0, le=1.0)
    weights: Optional[dict] = Field(default=None)
    evidence_states: Optional[dict] = Field(default=None)
    freshness_seconds: Optional[dict] = Field(default=None)
    constraints: Optional[list] = Field(default=None)
    max_stale_age_seconds: Optional[float] = Field(default=86400.0)

class VoramRouteAssessRequest(BaseModel):
    path: list[str] = Field(min_length=2, max_length=150)
    convoy_speed_kmh: float = Field(default=40.0, gt=0, le=150)
    max_vehicle_tons: float = Field(default=0.0, ge=0, le=500)
    observation_sources: Optional[dict[str, Any]] = None

@app.get('/api/voram/config')
def get_voram_config(_user: dict = Depends(require_role(ROLE_ALL))):
    """Returns the authoritative VORAM v0.1 model configuration."""
    return {
        'model': {
            'name': voram_service.MODEL_NAME,
            'version': voram_service.MODEL_VERSION,
            'config_version': voram_service.CONFIG_VERSION,
        },
        'default_safeguard_coefficient': voram_service.DEFAULT_SAFEGUARD_COEFFICIENT,
        'parameters': voram_service.DEFAULT_PARAMETER_DEFINITIONS,
        'risk_categories': [
            {'category': voram_service.RiskCategory.LOW_CONCERN.value, 'range': '0–24', 'min': 0.0, 'max': 24.99},
            {'category': voram_service.RiskCategory.MODERATE_CONCERN.value, 'range': '25–49', 'min': 25.0, 'max': 49.99},
            {'category': voram_service.RiskCategory.HIGH_CONCERN.value, 'range': '50–74', 'min': 50.0, 'max': 74.99},
            {'category': voram_service.RiskCategory.CRITICAL_CONCERN.value, 'range': '75–100', 'min': 75.0, 'max': 100.0},
        ],
        'assessment_states': [e.value for e in voram_service.AssessmentStatus],
        'evidence_states': [e.value for e in voram_service.EvidenceState],
        'disclaimer': 'VORAM v0.1 is an experimental decision-support model. Mathematical formula: R_VORAM = max(R_mean, 0.8 * P_max). Weights, thresholds, and safeguard coefficient (0.8) are provisional decision-support heuristics and have not been empirically validated.'
    }

@app.post('/api/voram/assess')
def assess_voram_api(req: VoramAssessRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    """Evaluates a parameter set and physical constraints under VORAM v0.1."""
    if not isinstance(req.parameters, dict):
        raise HTTPException(400, 'Parameters must be a dictionary of parameter IDs to values.')
    res = voram_service.assess_parameter_set(
        parameter_scores=req.parameters,
        weights=req.weights,
        safeguard_coefficient=req.safeguard_coefficient if req.safeguard_coefficient is not None else voram_service.DEFAULT_SAFEGUARD_COEFFICIENT,
        evidence_states=req.evidence_states,
        constraints=req.constraints,
        freshness_seconds=req.freshness_seconds,
        max_stale_age_seconds=req.max_stale_age_seconds or 86400.0
    )
    if res.get('assessment_status') == voram_service.AssessmentStatus.MODEL_ERROR.value:
        raise HTTPException(400, detail={
            'code': 'VORAM_MODEL_ERROR',
            'message': res['reasons'][0] if res.get('reasons') else 'VORAM input validation failed.',
            'reasons': res.get('reasons', []),
            'warnings': res.get('warnings', [])
        })
    return res

@app.post('/api/voram/assess-route')
def assess_route_voram_api(req: VoramRouteAssessRequest, _user: dict = Depends(require_role(ROLE_ALL))):
    """Evaluates a multi-segment corridor path under VORAM v0.1."""
    graph = tactical_router.build_dynamic_graph(get_db_path())
    normalized_path = [_normalize_node_id(nid, graph.nodes) for nid in req.path]
    missing = [nid for nid in normalized_path if nid not in graph.nodes]
    if missing:
        raise HTTPException(400, f"The following waypoints are not present in the routing graph: {', '.join(missing)}")
    res = voram_service.assess_route_voram(
        graph,
        normalized_path,
        convoy_speed_kmh=req.convoy_speed_kmh,
        max_vehicle_tons=req.max_vehicle_tons,
        observation_sources=req.observation_sources
    )
    if res.get('assessment_status') == voram_service.AssessmentStatus.MODEL_ERROR.value:
        raise HTTPException(400, detail={
            'code': 'VORAM_ROUTE_ERROR',
            'message': res['reasons'][0] if res.get('reasons') else 'VORAM route assessment failed.',
            'reasons': res.get('reasons', []),
            'warnings': res.get('warnings', [])
        })
    return res

# ─────────────────────────────────────────────────────────────────
# ROP EVIDENCE COLLECTION & VERIFICATION MODELS & ROUTES
# ─────────────────────────────────────────────────────────────────

def is_staged_id(jid: str) -> bool:
    if not jid:
        return False
    return not str(jid).startswith('CMS-')

def get_staged_session_owner(staged_id: str) -> Optional[str]:
    try:
        row = query('SELECT owner_user_id FROM staged_sessions WHERE staged_id=?', [staged_id], True)
        if row and row.get('owner_user_id'):
            return row['owner_user_id']
    except Exception:
        pass
    try:
        row = query('SELECT reporting_user_id FROM rop_reports WHERE journey_id=? LIMIT 1', [staged_id], True)
        if row and row.get('reporting_user_id'):
            return row['reporting_user_id']
    except Exception:
        pass
    return None

def save_staged_session(staged_id: str, owner_id: str):
    db_path = get_db_path()
    if os.path.basename(db_path) == 'military_logistics.db':
        return
    with db_transaction() as c:
        c.execute('''
            CREATE TABLE IF NOT EXISTS staged_sessions (
                staged_id TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        ''')
        c.execute('''
            INSERT INTO staged_sessions (staged_id, owner_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(staged_id) DO UPDATE SET updated_at = excluded.updated_at
        ''', [staged_id, owner_id, now(), now()])

@app.post('/api/staged-sessions')
def create_staged_session_endpoint(user: dict = Depends(require_role(ROLE_ALL))):
    staged_id = 'STAGE-' + uuid.uuid4().hex
    save_staged_session(staged_id, user['id'])
    return {'staged_id': staged_id, 'owner_user_id': user['id']}

class RopObservationItem(BaseModel):
    status: str = Field(default="NOT_OBSERVED")  # OBSERVED, CONFIRMED, NOT_OBSERVED, UNKNOWN, NOT_ASSESSED, CONFLICTING
    description: str = Field(default="")
    rating: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    source: str = Field(default="PATROL_RECON")  # PATROL_RECON, PHYSICAL_INSPECTION, UAV_SURVEILLANCE, GROUND_CREW, CIVIL_NOTICE
    reference: Optional[str] = Field(default=None)
    observation_time: Optional[str] = Field(default=None)
    uncertainty_notes: Optional[str] = Field(default="")
    verified: Optional[bool] = Field(default=False)
    verified_by: Optional[str] = Field(default=None)
    verified_at: Optional[str] = Field(default=None)
    review_notes: Optional[str] = Field(default="")

class RopReportCreate(BaseModel):
    route_version: str = Field(default="primary", max_length=120)
    status: str = Field(default="SUBMITTED")  # DRAFT, SUBMITTED
    observation_period_start: Optional[str] = None
    observation_period_end: Optional[str] = None
    parameters: dict[str, RopObservationItem] = Field(default_factory=dict)
    notes: Optional[str] = Field(default="")

class RopReportReview(BaseModel):
    decision: str = Field(..., pattern="^(VERIFIED|REJECTED|NEEDS_CLARIFICATION)$")
    review_notes: str = Field(..., min_length=3)
    verified_parameters: Optional[list[str]] = None

class SensitivityAdvisoryUpdate(BaseModel):
    sensitivity_level: Optional[str] = Field(default="STANDARD")  # STANDARD, RESTRICTED, HIGH_SENSITIVITY, CRITICAL_CONVOY
    escort_requirement_state: str = Field(..., pattern="^(REVIEW_REQUIRED|REQUIREMENT_RECORDED|SUPPORT_CONFIRMED|NOT_ESTABLISHED|NOT_REQUIRED_UNDER_RECORDED_POLICY)$")
    policy_reference: Optional[str] = Field(default="DEF-LOG-SOP-2026/SEC-04 (Provisional SOP Placeholder)")
    support_notes: Optional[str] = Field(default="")

class ReadinessOverrideRequest(BaseModel):
    reason: str = Field(..., min_length=5)

class StagedReassessRequest(BaseModel):
    path: list[str] = Field(min_length=2, max_length=150)
    convoy_speed_kmh: float = Field(default=40.0, gt=0, le=150)
    max_vehicle_tons: float = Field(default=0.0, ge=0, le=500)
    observation_sources: Optional[dict[str, Any]] = None
    staged_journey_id: Optional[str] = None

@app.get('/api/rop-reports/{journey_id}')
def get_rop_report(journey_id: str, route_version: Optional[str] = None, user: dict = Depends(require_role(ROLE_ALL))):
    """Fetches the latest ROP evidence report for a journey (and optional route version)."""
    if is_staged_id(journey_id):
        owner = get_staged_session_owner(journey_id)
        if owner and owner != user['id'] and user.get('role') not in ROLE_COORDINATOR:
            raise HTTPException(403, "Access denied: Staged ROP report belongs to another user.")
    if route_version:
        row = query('SELECT * FROM rop_reports WHERE journey_id=? AND route_version=? ORDER BY created_at DESC LIMIT 1', [journey_id, route_version], True)
    else:
        row = query('SELECT * FROM rop_reports WHERE journey_id=? ORDER BY created_at DESC LIMIT 1', [journey_id], True)
    if not row:
        return {'report': None}
    row['parameters'] = _safe_json(row.get('parameters_json'), {})
    return {'report': row}

@app.post('/api/rop-reports/{journey_id}')
def submit_rop_report(journey_id: str, req: RopReportCreate, user: dict = Depends(require_role(ROLE_ALL))):
    """Submits or drafts an ROP road-condition and infrastructure evidence report."""
    if is_staged_id(journey_id):
        owner = get_staged_session_owner(journey_id)
        if owner and owner != user['id']:
            raise HTTPException(403, "Access denied: Cannot submit or edit ROP evidence on another user's staged session.")
        save_staged_session(journey_id, user['id'])

    report_id = 'ROP-' + datetime.now().strftime('%Y%m%d') + '-' + uuid.uuid4().hex[:6].upper()
    t = now()
    params_dict = {k: v.model_dump() for k, v in req.parameters.items()}
    status = 'SUBMITTED' if req.status == 'SUBMITTED' else 'DRAFT'
    
    with db_transaction() as c:
        c.execute('''
            INSERT INTO rop_reports (
                report_id, journey_id, route_version, reporting_user_id, reporting_user_email,
                reporting_user_role, status, observation_period_start, observation_period_end,
                parameters_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            report_id, journey_id, req.route_version, user['id'], user['email'],
            user['role'], status, req.observation_period_start or t, req.observation_period_end or t,
            json.dumps(params_dict), t, t
        ])
        c.execute('''
            INSERT INTO audit_log (action, object_type, object_id, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', [
            'SUBMIT_ROP_REPORT' if status == 'SUBMITTED' else 'DRAFT_ROP_REPORT',
            'ROP_REPORT',
            report_id,
            f"ROP report {status} by {user['email']} for journey {journey_id} (route {req.route_version})",
            t
        ])
        
    created = query('SELECT * FROM rop_reports WHERE report_id=?', [report_id], True)
    created['parameters'] = params_dict
    return created

@app.post('/api/rop-reports/{journey_id}/{report_id}/review')
def review_rop_report(journey_id: str, report_id: str, req: RopReportReview, user: dict = Depends(require_role(ROLE_COORDINATOR))):
    """Authorized review decision (VERIFIED, REJECTED, NEEDS_CLARIFICATION) on an ROP report."""
    rep = query('SELECT * FROM rop_reports WHERE report_id=? AND journey_id=?', [report_id, journey_id], True)
    if not rep:
        raise HTTPException(404, f"ROP report '{report_id}' not found for journey '{journey_id}'.")
    
    # Separation of duties: author cannot independently verify their own submission
    if rep['reporting_user_id'] == user['id']:
        raise HTTPException(
            403,
            detail="Separation of duties violation: Report author cannot independently review or verify their own submission. Requires independent authorized coordinator review."
        )
    
    t = now()
    params_dict = _safe_json(rep.get('parameters_json'), {})
    new_status = req.decision
    VALID_PARAM_IDS = {p['id'] for p in voram_service.DEFAULT_PARAMETER_DEFINITIONS}

    if new_status == 'VERIFIED':
        # LOGIC-02: Require explicit, non-empty verified_parameters selection
        if req.verified_parameters is None or not isinstance(req.verified_parameters, list) or len(req.verified_parameters) == 0:
            raise HTTPException(
                400,
                detail="Verification selection required: For a 'VERIFIED' decision, 'verified_parameters' must be an explicit, non-empty list of parameter IDs to verify."
            )
        
        # Check for unknown parameter IDs
        unknown_params = [p for p in req.verified_parameters if p not in VALID_PARAM_IDS]
        if unknown_params:
            raise HTTPException(
                400,
                detail=f"Invalid verification selection: Unknown parameter IDs: {', '.join(unknown_params)}"
            )

        # Validate each selected parameter has a valid rating and eligible observation status
        for p_id in req.verified_parameters:
            if p_id not in params_dict:
                raise HTTPException(
                    400,
                    detail=f"Invalid verification selection: Parameter '{p_id}' was not reported in this ROP report."
                )
            p_val = params_dict[p_id]
            rating = p_val.get('rating')
            if rating is None or not isinstance(rating, (int, float)):
                raise HTTPException(
                    400,
                    detail=f"Invalid verification selection: Parameter '{p_id}' has a null or missing rating and cannot be verified."
                )
            if float(rating) < 0.0 or float(rating) > 100.0:
                raise HTTPException(
                    400,
                    detail=f"Invalid verification selection: Parameter '{p_id}' rating {rating} is out of valid range (0-100)."
                )
            obs_status = p_val.get('status', 'NOT_OBSERVED')
            if obs_status in ('NOT_OBSERVED', 'UNKNOWN', 'NOT_ASSESSED', 'CONFLICTING'):
                raise HTTPException(
                    400,
                    detail=f"Invalid verification selection: Parameter '{p_id}' has ineligible observation status '{obs_status}'. Unobserved or conflicting observations cannot be verified."
                )
            
            p_val['verified'] = True
            p_val['verified_by'] = user['id']
            p_val['verified_at'] = t
            p_val['review_notes'] = req.review_notes

        # Unselected parameters remain unverified
        for p_id in params_dict:
            if p_id not in req.verified_parameters:
                params_dict[p_id]['verified'] = False

    elif new_status == 'REJECTED':
        for p_id in params_dict:
            params_dict[p_id]['verified'] = False
            params_dict[p_id]['review_notes'] = req.review_notes
    elif new_status == 'NEEDS_CLARIFICATION':
        for p_id in params_dict:
            params_dict[p_id]['review_notes'] = req.review_notes

    with db_transaction() as c:
        c.execute('''
            UPDATE rop_reports SET
                status = ?,
                parameters_json = ?,
                reviewed_by = ?,
                reviewed_at = ?,
                review_decision_notes = ?,
                updated_at = ?
            WHERE report_id = ?
        ''', [new_status, json.dumps(params_dict), user['id'], t, req.review_notes, t, report_id])
        
        c.execute('''
            INSERT INTO audit_log (action, object_type, object_id, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', [f"REVIEW_ROP_REPORT_{new_status}", 'ROP_REPORT', report_id, f"Review decision {new_status} by {user['email']}: {req.review_notes}", t])
        
    updated = query('SELECT * FROM rop_reports WHERE report_id=?', [report_id], True)
    updated['parameters'] = params_dict
    return updated

@app.post('/api/journeys/{journey_id}/reassess-voram')
def reassess_journey_voram(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    """Reassesses a committed journey corridor using verified ROP report evidence."""
    j = _fetch_journey(journey_id)
    r = j.get('route') or {}
    path = r.get('path')
    if not path or len(path) < 2:
        raise HTTPException(400, "Journey does not have a valid multi-segment route path to assess.")
    
    # Retrieve latest verified ROP report for this journey
    report = query('''
        SELECT * FROM rop_reports
        WHERE journey_id=? AND status='VERIFIED'
        ORDER BY updated_at DESC LIMIT 1
    ''', [journey_id], True)
    
    obs_sources = {}
    verified_params = {}
    if report:
        params_data = _safe_json(report.get('parameters_json'), {})
        for pid, pval in params_data.items():
            if pval.get('verified') and pval.get('rating') is not None:
                obs_sources[pid] = float(pval['rating'])
                verified_params[pid] = pval
                
    graph = tactical_router.build_dynamic_graph(get_db_path())
    normalized_path = [_normalize_node_id(nid, graph.nodes) for nid in path]
    
    speed = float(j.get('convoy_speed_kmh') or 40.0)
    max_tons = float(r.get('vehicle_limit_tons') or 0.0)
    
    voram_eval = voram_service.assess_route_voram(
        graph,
        normalized_path,
        convoy_speed_kmh=speed,
        max_vehicle_tons=max_tons,
        observation_sources=obs_sources
    )
    
    # Update journey route in database
    r['voram_assessment'] = voram_eval
    t = now()
    with db_transaction() as c:
        c.execute('UPDATE journeys SET route_json=?, updated_at=? WHERE journey_id=?',
                  [json.dumps(r), t, journey_id])
        c.execute('''
            INSERT INTO audit_log (action, object_type, object_id, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', ['VORAM_REASSESSMENT', 'JOURNEY', journey_id, f"VORAM reassessment completed with status {voram_eval.get('assessment_status')} (score: {voram_eval.get('risk_score')})", t])
        
    return {
        'journey_id': journey_id,
        'voram_assessment': voram_eval,
        'verified_evidence_applied': obs_sources,
        'report_id': report.get('report_id') if report else None
    }

@app.post('/api/staged-reassess-voram')
def staged_reassess_voram(req: StagedReassessRequest, user: dict = Depends(require_role(ROLE_ALL))):
    """Reassesses a staged candidate route in Journey Preview prior to commitment."""
    if req.staged_journey_id and is_staged_id(req.staged_journey_id):
        owner = get_staged_session_owner(req.staged_journey_id)
        if owner and owner != user['id'] and user.get('role') not in ROLE_COORDINATOR:
            raise HTTPException(403, "Access denied: Staged session belongs to another user.")
    graph = tactical_router.build_dynamic_graph(get_db_path())
    normalized_path = [_normalize_node_id(nid, graph.nodes) for nid in req.path]
    missing = [nid for nid in normalized_path if nid not in graph.nodes]
    if missing:
        raise HTTPException(400, f"Waypoints not in graph: {', '.join(missing)}")
    
    voram_eval = voram_service.assess_route_voram(
        graph,
        normalized_path,
        convoy_speed_kmh=req.convoy_speed_kmh,
        max_vehicle_tons=req.max_vehicle_tons,
        observation_sources=req.observation_sources
    )
    return {'voram_assessment': voram_eval}

# --- Sensitivity Advisory & Escort/QRT Readiness ---
@app.get('/api/sensitivity-advisory/{journey_id}')
def get_sensitivity_advisory(journey_id: str, user: dict = Depends(require_role(ROLE_ALL))):
    """Retrieves the sensitivity classification and escort/QRT readiness advisory for a journey."""
    if is_staged_id(journey_id):
        owner = get_staged_session_owner(journey_id)
        if owner and owner != user['id'] and user.get('role') not in ROLE_COORDINATOR:
            raise HTTPException(403, "Access denied: Staged sensitivity advisory belongs to another user.")
    adv = query('SELECT * FROM journey_sensitivity_advisory WHERE journey_id=?', [journey_id], True)
    if adv:
        return adv
    
    # Inspect journey convoy if present
    j = query('SELECT * FROM journeys WHERE journey_id=?', [journey_id], True)
    has_vip = False
    if j:
        convoy = _safe_json(j.get('convoy_json'), [])
        for v in convoy:
            if v.get('is_vip') or 'VIP' in str(v.get('role_category', '')).upper() or 'VIP' in str(v.get('model_name', '')).upper():
                has_vip = True
                break
                
    sens_level = 'HIGH_SENSITIVITY' if has_vip else 'STANDARD'
    return {
        'journey_id': journey_id,
        'sensitivity_level': sens_level,
        'escort_requirement_state': 'REVIEW_REQUIRED',
        'policy_reference': 'DEF-LOG-SOP-2026/SEC-04 (Provisional SOP Placeholder)',
        'support_notes': 'VIP escort classification required' if has_vip else 'Standard operational policy applies',
        'reviewed_by': None,
        'reviewed_at': None,
        'confirmed_by': None,
        'confirmed_at': None
    }

@app.post('/api/sensitivity-advisory/{journey_id}')
def update_sensitivity_advisory(journey_id: str, req: SensitivityAdvisoryUpdate, user: dict = Depends(require_role(ROLE_COORDINATOR))):
    """Authorized coordinator records sensitivity review and confirms escort/QRT support."""
    if is_staged_id(journey_id):
        owner = get_staged_session_owner(journey_id)
        if not owner:
            save_staged_session(journey_id, user['id'])
    t = now()
    confirmed_by = user['id'] if req.escort_requirement_state in ('SUPPORT_CONFIRMED', 'NOT_REQUIRED_UNDER_RECORDED_POLICY') else None
    confirmed_at = t if confirmed_by else None
    
    with db_transaction() as c:
        c.execute('''
            INSERT INTO journey_sensitivity_advisory (
                journey_id, sensitivity_level, escort_requirement_state, policy_reference,
                support_notes, reviewed_by, reviewed_at, confirmed_by, confirmed_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                sensitivity_level = excluded.sensitivity_level,
                escort_requirement_state = excluded.escort_requirement_state,
                policy_reference = excluded.policy_reference,
                support_notes = excluded.support_notes,
                reviewed_by = excluded.reviewed_by,
                reviewed_at = excluded.reviewed_at,
                confirmed_by = excluded.confirmed_by,
                confirmed_at = excluded.confirmed_at,
                updated_at = excluded.updated_at
        ''', [
            journey_id, req.sensitivity_level or 'STANDARD', req.escort_requirement_state,
            req.policy_reference or 'DEF-LOG-SOP-2026/SEC-04 (Provisional SOP Placeholder)', req.support_notes or '',
            user['id'], t, confirmed_by, confirmed_at, t, t
        ])
        
        c.execute('''
            INSERT INTO audit_log (action, object_type, object_id, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', ['UPDATE_SENSITIVITY_ADVISORY', 'JOURNEY', journey_id, f"Escort requirement set to {req.escort_requirement_state} (Level: {req.sensitivity_level}) by {user['email']}", t])
        
    return query('SELECT * FROM journey_sensitivity_advisory WHERE journey_id=?', [journey_id], True)

# --- Multi-dimensional Journey Readiness ---
@app.get('/api/journeys/{journey_id}/readiness')
def get_journey_readiness(journey_id: str, user: dict = Depends(require_role(ROLE_ALL))):
    """Evaluates the multi-dimensional operational readiness for a journey."""
    if is_staged_id(journey_id):
        owner = get_staged_session_owner(journey_id)
        if owner and owner != user['id'] and user.get('role') not in ROLE_COORDINATOR:
            raise HTTPException(403, "Access denied: Staged readiness belongs to another user.")
    j = _fetch_journey(journey_id)
    r = j.get('route') or {}
    voram = r.get('voram_assessment') or {}
    
    # 1. Route constraints
    route_status = 'PASSED'
    route_reasons = []
    if voram.get('assessment_status') == 'FAIL' or any(c.get('is_ineligible') for c in voram.get('constraint_findings', [])):
        route_status = 'BLOCKED'
        route_reasons.append("Mandatory physical constraint failure: corridor violates bridge limits or closed sections.")
        
    # 2. VORAM status
    voram_status = voram.get('assessment_status', 'UNKNOWN')
    
    # 3. ROP Evidence status
    rep = query('SELECT * FROM rop_reports WHERE journey_id=? ORDER BY created_at DESC LIMIT 1', [journey_id], True)
    rop_status = rep.get('status', 'NONE') if rep else 'NONE'
    
    # 4. Sensitivity advisory status
    adv = query('SELECT * FROM journey_sensitivity_advisory WHERE journey_id=?', [journey_id], True)
    adv_state = adv.get('escort_requirement_state', 'REVIEW_REQUIRED') if adv else 'REVIEW_REQUIRED'
    
    # 5. Readiness override
    ovr = query('SELECT * FROM journey_readiness_overrides WHERE journey_id=?', [journey_id], True)
    
    # Overall readiness resolution
    if route_status == 'BLOCKED':
        overall = 'BLOCKED_BY_CONSTRAINT'
        headline = 'Movement Blocked: Mandatory Physical Constraint Violated'
    elif adv_state == 'REVIEW_REQUIRED' and not ovr:
        overall = 'REVIEW_REQUIRED'
        headline = 'Readiness Review Required: Escort/QRT Arrangements Pending'
    elif rop_status in ('REJECTED', 'NEEDS_CLARIFICATION'):
        overall = 'REVIEW_REQUIRED'
        headline = 'Evidence Review Required: ROP Report Rejected or Clarification Needed'
    elif adv_state in ('SUPPORT_CONFIRMED', 'NOT_REQUIRED_UNDER_RECORDED_POLICY'):
        if voram_status == 'PASS_WITHIN_TESTED_RULES':
            overall = 'READY'
            headline = 'Convoy Movement Fully Cleared & Ready for Dispatch'
        else:
            overall = 'READY_WITH_ADVISORY'
            headline = 'Convoy Cleared with Unmonitored Telemetry Advisory'
    else:
        overall = 'READY_WITH_ADVISORY' if ovr else 'REVIEW_REQUIRED'
        headline = 'Readiness Overridden by Authorized Coordinator' if ovr else 'Readiness Review Required'
        
    return {
        'journey_id': journey_id,
        'overall_readiness': overall,
        'headline': headline,
        'dimensions': {
            'route_constraints': {'status': route_status, 'reasons': route_reasons},
            'voram_assessment': {'status': voram_status, 'score': voram.get('risk_score'), 'category': voram.get('risk_category')},
            'rop_evidence': {'status': rop_status, 'report_id': rep.get('report_id') if rep else None},
            'sensitivity_advisory': {'status': adv_state, 'level': adv.get('sensitivity_level') if adv else 'STANDARD'},
            'override': ovr
        }
    }

@app.post('/api/journeys/{journey_id}/readiness-override')
def create_readiness_override(journey_id: str, req: ReadinessOverrideRequest, user: dict = Depends(require_role(ROLE_COORDINATOR))):
    """Authorized coordinator records an explicit override to allow commitment with outstanding advisory."""
    t = now()
    with db_transaction() as c:
        c.execute('''
            INSERT INTO journey_readiness_overrides (journey_id, override_type, reason, authorized_by, authorized_role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                reason = excluded.reason,
                authorized_by = excluded.authorized_by,
                authorized_role = excluded.authorized_role,
                created_at = excluded.created_at
        ''', [journey_id, 'READINESS_ADVISORY_OVERRIDE', req.reason, user['id'], user['role'], t])
        c.execute('''
            INSERT INTO audit_log (action, object_type, object_id, details, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', ['READINESS_OVERRIDE', 'JOURNEY', journey_id, f"Readiness override recorded by {user['email']}: {req.reason}", t])
    return query('SELECT * FROM journey_readiness_overrides WHERE journey_id=?', [journey_id], True)

class JourneyCreate(BaseModel):
    origin_id:str=Field(min_length=1,max_length=64)
    dest_id:str=Field(min_length=1,max_length=64)
    origin_name:str=Field(default='',max_length=120)
    dest_name:str=Field(default='',max_length=120)
    departure_date:str=Field(default='',max_length=30)
    departure_time:str=Field(default='',max_length=30)
    convoy:list=Field(default_factory=list)
    route:dict=Field(default_factory=dict)
    readiness_override:Optional[dict]=None
    staged_journey_id:Optional[str]=None

class JourneyStatus(BaseModel):
    status: str
    message: str = ''
    override_reason: Optional[str] = None

class FuelOverrideRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)

class DisruptionRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    payload: dict = Field(default_factory=dict)

class JourneyEventCreate(BaseModel):
    event_type: str = Field(default='INFO', min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=1000)
    payload: dict = Field(default_factory=dict)

class SpacingConfigRequest(BaseModel):
    min_spacing_m: float = Field(default=40.0, gt=0, le=1000)
    max_spacing_m: Optional[float] = Field(default=None, gt=0, le=5000)
    reason: Optional[str] = Field(default='', max_length=500)

class IncidentCreate(BaseModel):
    rule_type: str = Field(min_length=2, max_length=64)
    violation_type: str = Field(min_length=2, max_length=64)
    message: str = Field(min_length=2, max_length=1000)
    vehicle_id: Optional[str] = Field(default=None, max_length=64)
    unit_id: Optional[str] = Field(default=None, max_length=64)
    evidence_source: str = Field(default='MANUAL_REPORT', max_length=64)
    last_known_pos: Optional[str] = Field(default=None, max_length=120)

class IncidentResolve(BaseModel):
    resolution: str = Field(min_length=2, max_length=1000)
    verification_state: str = Field(default='CONFIRMED', max_length=32)

class AckRequest(BaseModel):
    target: Optional[str] = None

class FuelConfigRequest(BaseModel):
    reserve_percent: float = Field(default=20.0, ge=5.0, le=40.0)
    departure_fuel_mode: str = Field(default='UNKNOWN') # 'UNKNOWN', 'ASSUMED_FULL', 'MANUAL_DIP'
    vehicle_fuel_levels: dict = Field(default_factory=dict)
    notes: Optional[str] = Field(default='', max_length=500)

    @field_validator('departure_fuel_mode')
    @classmethod
    def validate_departure_mode(cls, v):
        allowed = {'UNKNOWN', 'ASSUMED_FULL', 'MANUAL_DIP'}
        if v not in allowed:
            raise ValueError(f"departure_fuel_mode must be one of {allowed}")
        return v

    @field_validator('vehicle_fuel_levels')
    @classmethod
    def validate_levels(cls, v):
        if not isinstance(v, dict):
            raise ValueError("vehicle_fuel_levels must be a dictionary")
        cleaned = {}
        for k, val in v.items():
            if val is not None:
                try:
                    fval = float(val)
                    if fval < 0.0 or fval > 100.0:
                        raise ValueError(f"Fuel quantity for vehicle '{k}' ({fval}%) is outside valid 0-100% capacity range.")
                    cleaned[str(k)] = round(fval, 1)
                except (ValueError, TypeError) as ex:
                    raise ValueError(f"Invalid numeric fuel level for vehicle '{k}': {val}") from ex
        return cleaned

class FuelDetourPreviewRequest(BaseModel):
    station_id: str = Field(min_length=1, max_length=64)

def _safe_json(val, fallback):
    if not val: return fallback
    try: return json.loads(val)
    except (json.JSONDecodeError, TypeError): return fallback

TERMINAL_JOURNEY_STATUSES = {'COMPLETED', 'CANCELLED'}

def _assert_journey_non_terminal(c: sqlite3.Cursor, journey_id: str) -> dict:
    """
    Validates that the journey exists and is NOT in a terminal state (COMPLETED or CANCELLED)
    within the active transaction. Raises HTTPException(404) if not found, or HTTPException(409)
    if terminal. Returns the journey row dict.
    """
    row = c.execute("SELECT journey_id, status FROM journeys WHERE journey_id = ?", [journey_id]).fetchone()
    if not row:
        raise HTTPException(404, "Journey not found.")
    status = row["status"] if isinstance(row, sqlite3.Row) else row[1]
    if status in TERMINAL_JOURNEY_STATUSES:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "TERMINAL_JOURNEY_LOCKED",
                "status": status,
                "message": f"Journey '{journey_id}' is in terminal state '{status}' and cannot be modified."
            }
        )
    return dict(row) if isinstance(row, sqlite3.Row) else {"journey_id": row[0], "status": row[1]}

def _fetch_journey(journey_id: str):
    row=query('SELECT * FROM journeys WHERE journey_id=?',[journey_id],True)
    if not row: raise HTTPException(404,'Journey not found.')
    if not row.get('origin_name') and row.get('origin_id'):
        p = query("SELECT place_name FROM places WHERE place_id=? OR place_id=?", [row['origin_id'], 'PLC-' + row['origin_id']], True)
        if p and p.get('place_name'):
            row['origin_name'] = p['place_name']
    if not row.get('dest_name') and row.get('dest_id'):
        p = query("SELECT place_name FROM places WHERE place_id=? OR place_id=?", [row['dest_id'], 'PLC-' + row['dest_id']], True)
        if p and p.get('place_name'):
            row['dest_name'] = p['place_name']
    row['convoy']=_safe_json(row.pop('convoy_json', None), [])
    row['route']=_safe_json(row.pop('route_json', None), {})
    row['baseline_route']=_safe_json(row.pop('baseline_route_json', None), {})
    row['events']=query('SELECT * FROM journey_events WHERE journey_id=? ORDER BY created_at',[journey_id])
    inc_rows = query('SELECT * FROM incidents WHERE journey_id=? ORDER BY created_at DESC', [journey_id])
    for inc in inc_rows:
        inc['operator_ack'] = _safe_json(inc.get('operator_ack'), None)
        inc['checkpoint_ack'] = _safe_json(inc.get('checkpoint_ack'), None)
    row['incidents'] = inc_rows
    spacing = query('SELECT * FROM journey_spacing_config WHERE journey_id=?', [journey_id], True)
    row['spacing_config'] = dict(spacing) if spacing else {'journey_id': journey_id, 'min_spacing_m': 40.0, 'max_spacing_m': None}
    fuel_cfg = query('SELECT * FROM journey_fuel_config WHERE journey_id=?', [journey_id], True)
    if fuel_cfg:
        fuel_cfg['vehicle_fuel_levels'] = _safe_json(fuel_cfg.pop('vehicle_fuel_levels_json', None), {})
        row['fuel_config'] = dict(fuel_cfg)
    else:
        row['fuel_config'] = {
            'journey_id': journey_id,
            'reserve_percent': 20.0,
            'departure_fuel_mode': 'UNKNOWN',
            'vehicle_fuel_levels': {},
            'updated_at': now(),
            'updated_by': 'SYSTEM_DEFAULT',
            'notes': 'Default 20% reserve policy'
        }
    ovr = query('SELECT * FROM journey_fuel_overrides WHERE journey_id=?', [journey_id], True)
    row['fuel_override'] = dict(ovr) if ovr else None

    adv = query('SELECT * FROM journey_sensitivity_advisory WHERE journey_id=?', [journey_id], True)
    row['sensitivity_advisory'] = dict(adv) if adv else None

    rep = query('SELECT * FROM rop_reports WHERE journey_id=? ORDER BY created_at DESC LIMIT 1', [journey_id], True)
    if rep:
        rep['parameters'] = _safe_json(rep.get('parameters_json'), {})
        row['rop_report'] = dict(rep)
    else:
        row['rop_report'] = None

    r_ovr = query('SELECT * FROM journey_readiness_overrides WHERE journey_id=?', [journey_id], True)
    row['readiness_override'] = dict(r_ovr) if r_ovr else None
    return row

@app.post('/api/journeys')
def create_journey(j:JourneyCreate, _user: dict = Depends(require_role(ROLE_PLANNER))):
    if j.origin_id.strip() == j.dest_id.strip():
        raise HTTPException(400, 'Origin and destination cannot be identical.')
    if not j.convoy or len(j.convoy) == 0:
        raise HTTPException(400, 'Convoy manifest cannot be empty. At least one vehicle is required.')

    # 1. Enforce Staged Session Ownership (SEC-01)
    if j.staged_journey_id:
        staged_owner = get_staged_session_owner(j.staged_journey_id)
        if staged_owner and staged_owner != _user['id']:
            raise HTTPException(403, "Access denied: Cannot commit another user's staged session into your journey.")

    # 2. Authoritative Route Topology Validation (SEC-02)
    r = j.route or {}
    path = r.get('path')
    if not path or not isinstance(path, list) or len(path) < 2:
        raise HTTPException(400, "Commit blocked: Journey route path is missing or invalid.")

    graph = tactical_router.build_dynamic_graph(get_db_path())
    normalized_path = [_normalize_node_id(nid, graph.nodes) for nid in path]
    missing_nodes = [nid for nid in normalized_path if nid not in graph.nodes]
    if missing_nodes:
        raise HTTPException(400, f"Commit blocked: Corridor contains unknown waypoints: {', '.join(missing_nodes)}")

    missing_edges = [(u, v) for u, v in zip(normalized_path, normalized_path[1:]) if not graph.has_edge(u, v)]
    if missing_edges:
        missing_str = ", ".join(f"{u} -> {v}" for u, v in missing_edges)
        raise HTTPException(400, f"Commit blocked: Discontinuous corridor route: No navigable edge exists between {missing_str}.")

    # 3. Convoy Manifest Validation & Authoritative Governing Limits
    seen_physical_units = set()
    governing_max_vehicle_tons = 0.0
    governing_speed_ceiling = 60.0

    for idx, v in enumerate(j.convoy):
        v_id = v.get('vehicle_id')
        unit_id = v.get('unit_id')
        pos = idx + 1

        if unit_id:
            if unit_id in seen_physical_units:
                raise HTTPException(400, f'Duplicate physical fleet unit in convoy at position #{pos}: {unit_id}. Each physical vehicle can only be assigned once.')
            seen_physical_units.add(unit_id)

        model = query('SELECT * FROM vehicle_master WHERE vehicle_id=?', [v_id], one=True)
        if not model:
            raise HTTPException(400, f'Vehicle model "{v_id}" at position #{pos} not found in master catalog.')

        m_name = model.get('model_name') or v_id
        role = model.get('role_category', 'DUAL')

        # Parse passenger allocation
        raw_pass = v.get('passengers', v.get('occupants', 0))
        try:
            pass_val = int(raw_pass) if raw_pass is not None and str(raw_pass).strip() != '' else 0
        except (ValueError, TypeError):
            raise HTTPException(400, f'Position #{pos} ({m_name}): Invalid occupant count "{raw_pass}". Must be an integer.')

        # Parse cargo allocation
        raw_cargo = v.get('payload', v.get('cargo_tons', 0))
        try:
            cargo_val = float(raw_cargo) if raw_cargo is not None and str(raw_cargo).strip() != '' else 0.0
        except (ValueError, TypeError):
            raise HTTPException(400, f'Position #{pos} ({m_name}): Invalid cargo weight "{raw_cargo}". Must be a number.')

        if pass_val < 0:
            raise HTTPException(400, f'Position #{pos} ({m_name}): Occupants count cannot be negative.')
        if cargo_val < 0:
            raise HTTPException(400, f'Position #{pos} ({m_name}): Cargo payload cannot be negative.')

        # Role-based restriction checks
        if role == 'PASSENGER' and cargo_val > 0:
            raise HTTPException(400, f'Position #{pos} ({m_name}): Vehicle is classified as PASSENGER-ONLY and cannot be allocated freight cargo.')
        if role == 'CARGO' and pass_val > 0:
            raise HTTPException(400, f'Position #{pos} ({m_name}): Vehicle is classified as CARGO-ONLY and cannot be allocated additional passengers.')

        # Verified limit enforcement
        if model.get('passenger_capacity_verified') and model.get('rated_passenger_capacity'):
            max_pass = int(model['rated_passenger_capacity'])
            if pass_val > max_pass:
                raise HTTPException(400, f'Position #{pos} ({m_name}): Allocated occupants ({pass_val}) exceeds verified passenger capacity of {max_pass}.')

        if model.get('payload_capacity_verified') and model.get('rated_payload_tons'):
            max_cargo = float(model['rated_payload_tons'])
            if cargo_val > max_cargo:
                raise HTTPException(400, f'Position #{pos} ({m_name}): Allocated cargo ({cargo_val} t) exceeds verified payload capacity of {max_cargo} tonnes.')

        tare = float(model.get('gvw_tons') or v.get('gvw_tons') or 0.0)
        veh_gross = tare + cargo_val
        if veh_gross > governing_max_vehicle_tons:
            governing_max_vehicle_tons = veh_gross
        veh_speed = float(model.get('max_speed_kmh') or v.get('max_speed_kmh') or 60.0)
        if veh_speed < governing_speed_ceiling:
            governing_speed_ceiling = veh_speed

    # 4. Authoritative Route Assessment & Mandatory Constraint Enforcement (SEC-02)
    obs_sources = {}
    if j.staged_journey_id:
        report = query('''
            SELECT * FROM rop_reports
            WHERE journey_id=? AND status='VERIFIED'
            ORDER BY updated_at DESC LIMIT 1
        ''', [j.staged_journey_id], True)
        if report:
            params_data = _safe_json(report.get('parameters_json'), {})
            for pid, pval in params_data.items():
                if pval.get('verified') and pval.get('rating') is not None:
                    obs_sources[pid] = float(pval['rating'])

    authoritative_voram = voram_service.assess_route_voram(
        graph,
        normalized_path,
        convoy_speed_kmh=governing_speed_ceiling,
        max_vehicle_tons=governing_max_vehicle_tons,
        observation_sources=obs_sources
    )

    if authoritative_voram.get('assessment_status') == voram_service.AssessmentStatus.MODEL_ERROR.value:
        reasons = authoritative_voram.get('reasons', ['Corridor topology evaluation error'])
        raise HTTPException(400, f"Commit blocked: Corridor model evaluation error: {'; '.join(reasons)}")

    mandatory_failures = [
        c for c in authoritative_voram.get('constraint_findings', [])
        if c.get('status') == voram_service.AssessmentStatus.FAIL.value or c.get('is_ineligible')
    ]
    if mandatory_failures:
        reasons = [f"{c.get('constraint_type')}: {c.get('reason')}" for c in mandatory_failures]
        raise HTTPException(
            409,
            detail=f"Commit blocked: Mandatory physical constraint violation: {'; '.join(reasons)}"
        )

    unknown_critical_bridge = [
        c for c in authoritative_voram.get('constraint_findings', [])
        if c.get('status') == voram_service.AssessmentStatus.UNKNOWN.value and c.get('constraint_type') == 'BRIDGE_LOAD_COMPATIBILITY'
    ]
    if unknown_critical_bridge and governing_max_vehicle_tons > 0:
        raise HTTPException(
            409,
            detail=f"Commit blocked: Critical infrastructure load limit is unrecorded on corridor. Cannot verify bridge structural compatibility for {governing_max_vehicle_tons}t vehicle."
        )

    # 5. Sensitivity & Escort Readiness Gate (LOGIC-01)
    has_vip = False
    for v in j.convoy:
        if v.get('is_vip') or 'VIP' in str(v.get('role_category', '')).upper() or 'VIP' in str(v.get('model_name', '')).upper():
            has_vip = True
            break
            
    staged_advisory = None
    if j.staged_journey_id:
        staged_advisory = query('SELECT * FROM journey_sensitivity_advisory WHERE journey_id=?', [j.staged_journey_id], True)
        
    adv_state = staged_advisory.get('escort_requirement_state') if staged_advisory else ('REVIEW_REQUIRED' if has_vip else 'NOT_REQUIRED_UNDER_RECORDED_POLICY')
    
    if has_vip and adv_state not in ('SUPPORT_CONFIRMED', 'NOT_REQUIRED_UNDER_RECORDED_POLICY'):
        if not j.readiness_override or not j.readiness_override.get('reason'):
            raise HTTPException(
                409,
                detail=f"Commit blocked: VIP / High-Sensitivity convoy escort requirement is '{adv_state}'. Support must be confirmed ('SUPPORT_CONFIRMED') or authorized readiness override provided prior to operational commitment."
            )

    # 6. Database Commitment & Atomic Migration (DATA-02)
    jid = 'CMS-' + datetime.now().strftime('%Y%m%d') + '-' + uuid.uuid4().hex[:6].upper()
    t = now()
    r['voram_assessment'] = authoritative_voram
    if authoritative_voram.get('risk_score') is not None:
        r['risk_score'] = authoritative_voram.get('risk_score')

    with db_transaction() as c:
        c.execute('INSERT INTO journeys VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                  [jid, j.origin_id.strip(), j.dest_id.strip(), j.origin_name, j.dest_name,
                   j.departure_date, j.departure_time, 'SCHEDULED', json.dumps(j.convoy),
                   json.dumps(r), json.dumps(r), r.get('risk_score'), r.get('distance_km'),
                   r.get('eta_hours'), t, t])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['CREATE', 'JOURNEY', jid, 'Journey created', t])
        
        # Migrate or create sensitivity advisory for new journey
        initial_sens = 'HIGH_SENSITIVITY' if has_vip else 'STANDARD'
        initial_escort = adv_state if staged_advisory else ('REVIEW_REQUIRED' if has_vip else 'NOT_REQUIRED_UNDER_RECORDED_POLICY')
        policy_ref = staged_advisory.get('policy_reference') if staged_advisory else 'DEF-LOG-SOP-2026/SEC-04 (Provisional SOP Placeholder)'
        support_notes = staged_advisory.get('support_notes') if staged_advisory else ('VIP convoy escort review' if has_vip else '')
        rev_by = staged_advisory.get('reviewed_by') if staged_advisory else None
        rev_at = staged_advisory.get('reviewed_at') if staged_advisory else None
        conf_by = staged_advisory.get('confirmed_by') if staged_advisory else None
        conf_at = staged_advisory.get('confirmed_at') if staged_advisory else None
        
        c.execute('''
            INSERT INTO journey_sensitivity_advisory (
                journey_id, sensitivity_level, escort_requirement_state, policy_reference,
                support_notes, reviewed_by, reviewed_at, confirmed_by, confirmed_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [jid, initial_sens, initial_escort, policy_ref, support_notes, rev_by, rev_at, conf_by, conf_at, t, t])
        
        # Atomically migrate staged ROP report and clean up staged records (DATA-02)
        if j.staged_journey_id:
            c.execute('UPDATE rop_reports SET journey_id=? WHERE journey_id=?', [jid, j.staged_journey_id])
            c.execute('DELETE FROM journey_sensitivity_advisory WHERE journey_id=?', [j.staged_journey_id])
            try:
                c.execute('DELETE FROM staged_sessions WHERE staged_id=?', [j.staged_journey_id])
            except Exception:
                pass
            c.execute('INSERT INTO audit_log (action, object_type, object_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
                      ['MIGRATE_STAGED_SESSION', 'JOURNEY', jid, f"Staged session {j.staged_journey_id} successfully migrated to {jid}", t])
            
        # Record readiness override if supplied
        if j.readiness_override and j.readiness_override.get('reason'):
            ovr_reason = j.readiness_override['reason']
            c.execute('''
                INSERT INTO journey_readiness_overrides (journey_id, override_type, reason, authorized_by, authorized_role, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', [jid, 'READINESS_ADVISORY_OVERRIDE', ovr_reason, _user['id'], _user['role'], t])
            c.execute('''
                INSERT INTO audit_log (action, object_type, object_id, details, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', ['READINESS_OVERRIDE', 'JOURNEY', jid, f"Readiness override applied by {_user['email']}: {ovr_reason}", t])
    return _fetch_journey(jid)

@app.get('/api/journeys')
def journeys(_user: dict = Depends(require_role(ROLE_ALL))):
    return query('''
        SELECT 
            j.journey_id, j.origin_id, j.dest_id,
            COALESCE(NULLIF(j.origin_name, ''), po.place_name, j.origin_id) AS origin_name,
            COALESCE(NULLIF(j.dest_name, ''), pd.place_name, j.dest_id) AS dest_name,
            j.departure_date, j.departure_time, j.status, j.risk, j.distance_km, j.eta_hours,
            j.created_at, j.updated_at
        FROM journeys j
        LEFT JOIN places po ON (po.place_id = j.origin_id OR po.place_id = 'PLC-' || j.origin_id)
        LEFT JOIN places pd ON (pd.place_id = j.dest_id OR pd.place_id = 'PLC-' || j.dest_id)
        ORDER BY j.created_at DESC
    ''')

@app.get('/api/journeys/{journey_id}')
def get_journey(journey_id:str, _user: dict = Depends(require_role(ROLE_ALL))):
    return _fetch_journey(journey_id)

# --- Convoy Fuel Intelligence Engine ---
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def distance_point_to_segment_km(plat, plon, lat1, lon1, lat2, lon2):
    p_dist1 = haversine_km(plat, plon, lat1, lon1)
    p_dist2 = haversine_km(plat, plon, lat2, lon2)
    seg_len = haversine_km(lat1, lon1, lat2, lon2)
    if seg_len < 0.001:
        return p_dist1, 0.0
    dx, dy = lon2 - lon1, lat2 - lat1
    dpx, dpy = plon - lon1, plat - lat1
    denom = dx * dx + dy * dy
    t = 0.0 if denom < 1e-9 else max(0.0, min(1.0, (dpx * dx + dpy * dy) / denom))
    proj_lat = lat1 + t * dy
    proj_lon = lon1 + t * dx
    cross_track = haversine_km(plat, plon, proj_lat, proj_lon)
    return cross_track, t * seg_len

def evaluate_journey_fuel(journey_row: dict) -> dict:
    jid = journey_row['journey_id']
    orig_id = str(journey_row.get('origin_id') or '')
    dest_id = str(journey_row.get('dest_id') or '')
    orig_ids = {orig_id, f"PLC-{orig_id}", orig_id.replace('PLC-', '')} if orig_id else set()
    dest_ids = {dest_id, f"PLC-{dest_id}", dest_id.replace('PLC-', '')} if dest_id else set()
    convoy = journey_row.get('convoy', [])
    route = journey_row.get('route', {})
    total_distance_km = float(journey_row.get('distance_km') or route.get('distance_km') or 0.0)
    if total_distance_km <= 0.0 and route.get('legs'):
        total_distance_km = round(sum(float(leg.get('distance_km') or 0.0) for leg in route.get('legs', [])), 1)
    path = route.get('path', [])
    
    fuel_cfg = journey_row.get('fuel_config') or {}
    reserve_pct = float(fuel_cfg.get('reserve_percent', 20.0))
    dep_mode = fuel_cfg.get('departure_fuel_mode') or 'ASSUMED_FULL'
    veh_levels = fuel_cfg.get('vehicle_fuel_levels') or {}
    
    # 1. Fetch node coordinates along the corridor path
    node_coords = []
    if path:
        places_rows = query("SELECT place_id, lat, lon FROM places")
        coord_dict = {}
        for pr in places_rows:
            coord_dict[pr['place_id']] = (pr['lat'], pr['lon'])
            coord_dict[pr['place_id'].replace('PLC-', '')] = (pr['lat'], pr['lon'])
        for nid in path:
            if nid in coord_dict:
                node_coords.append(coord_dict[nid])
    
    # 2. Refuelling candidate stations along corridor
    candidate_stations = []
    if len(node_coords) >= 2:
        fuel_places = query("SELECT place_id, place_name, category, lat, lon, support_services, description FROM places WHERE support_services LIKE '%Fuel%'")
        for fp in fuel_places:
            min_cross = float('inf')
            best_along = 0.0
            curr_seg_start = 0.0
            for idx in range(len(node_coords) - 1):
                lat1, lon1 = node_coords[idx]
                lat2, lon2 = node_coords[idx + 1]
                seg_len = haversine_km(lat1, lon1, lat2, lon2)
                cross, along = distance_point_to_segment_km(fp['lat'], fp['lon'], lat1, lon1, lat2, lon2)
                if cross < min_cross:
                    min_cross = cross
                    best_along = curr_seg_start + along
                curr_seg_start += seg_len
            
            if min_cross <= 35.0 and fp['place_id'] not in orig_ids and best_along >= 1.0: # within 35 km detour en-route
                candidate_stations.append({
                    'station_id': fp['place_id'],
                    'station_name': fp['place_name'],
                    'category': fp['category'],
                    'type': 'MILITARY_DEPOT',
                    'authorization_status': 'AUTHORIZED_MILITARY_DEPOT',
                    'authorization_note': 'Authorized military supply installation under Western/Northern Command registry.',
                    'lat': fp['lat'],
                    'lon': fp['lon'],
                    'detour_km': round(min_cross, 1),
                    'corridor_km': round(best_along, 1),
                    'fuel_types': ['DIESEL', 'HIGH_SPEED_DIESEL'] if fp['category'] not in ('Cantonment',) else ['DIESEL', 'PETROL'],
                    'availability_status': 'OPERATIONAL_CONFIRMED'
                })
        
        # Include sample civilian retail highway plazas along corridor (Requirement 3 & 6)
        civilian_hubs = [
            {'station_id': 'CIV-IOCL-01', 'station_name': 'Indian Oil COCO Highway Hub', 'lat': 28.85, 'lon': 77.52, 'fuel_types': ['DIESEL', 'PETROL']},
            {'station_id': 'CIV-BPCL-02', 'station_name': 'Bharat Petroleum Mega Oasis', 'lat': 29.39, 'lon': 76.96, 'fuel_types': ['DIESEL', 'PETROL']},
            {'station_id': 'CIV-HPCL-03', 'station_name': 'HPCL Highway Outpost', 'lat': 29.97, 'lon': 76.88, 'fuel_types': ['DIESEL', 'PETROL']}
        ]
        for civ in civilian_hubs:
            min_cross = float('inf')
            best_along = 0.0
            curr_seg_start = 0.0
            for idx in range(len(node_coords) - 1):
                lat1, lon1 = node_coords[idx]
                lat2, lon2 = node_coords[idx + 1]
                seg_len = haversine_km(lat1, lon1, lat2, lon2)
                cross, along = distance_point_to_segment_km(civ['lat'], civ['lon'], lat1, lon1, lat2, lon2)
                if cross < min_cross:
                    min_cross = cross
                    best_along = curr_seg_start + along
                curr_seg_start += seg_len
            if min_cross <= 30.0 and best_along >= 1.0:
                candidate_stations.append({
                    'station_id': civ['station_id'],
                    'station_name': civ['station_name'],
                    'category': 'Civilian Highway Retail',
                    'type': 'CIVILIAN_RETAIL',
                    'authorization_status': 'UNVERIFIED_CIVILIAN',
                    'authorization_note': 'Public civilian retail station. Not an authorized military supply depot. Requires civil requisition approval.',
                    'lat': civ['lat'],
                    'lon': civ['lon'],
                    'detour_km': round(min_cross, 1),
                    'corridor_km': round(best_along, 1),
                    'fuel_types': civ['fuel_types'],
                    'availability_status': 'UNVERIFIED_AVAILABILITY'
                })
        
        candidate_stations.sort(key=lambda s: s['corridor_km'])

    # 3. Check candidate station compatibility with all convoy vehicles
    convoy_fuel_types = set()
    for v in convoy:
        vid = v.get('vehicle_id')
        m = query("SELECT fuel_type FROM vehicle_master WHERE vehicle_id=?", [vid], one=True) or {}
        convoy_fuel_types.add(m.get('fuel_type') or 'DIESEL')
    
    for st in candidate_stations:
        supported = set(st['fuel_types'])
        unsupported = convoy_fuel_types - supported
        if unsupported:
            st['is_compatible'] = False
            st['compatibility_note'] = f"Incompatible: station does not dispense {', '.join(unsupported)} required by convoy."
        else:
            st['is_compatible'] = True
            st['compatibility_note'] = "Compatible: dispenses all required fuels."

    # Identify the next suitable authorized refuelling depot along the corridor
    next_suitable_depot = None
    for st in candidate_stations:
        if st.get('is_compatible') and st.get('authorization_status') == 'AUTHORIZED_MILITARY_DEPOT':
            next_suitable_depot = {
                'station_id': st['station_id'],
                'station_name': st['station_name'],
                'corridor_km': st['corridor_km'],
                'detour_km': st['detour_km'],
                'fuel_types': st['fuel_types']
            }
            break

    # 4. Per-Vehicle Evaluation
    convoy_eval = []
    any_unknown = False
    
    for idx, v in enumerate(convoy):
        vid = v.get('vehicle_id')
        model = query("SELECT * FROM vehicle_master WHERE vehicle_id=?", [vid], one=True) if vid else None
        
        # Fallback to specifications embedded in convoy manifest dictionary
        if not model and v:
            op_range = float(v.get('operational_range_km') or v.get('rated_range_km') or v.get('range_km') or 0.0)
            if op_range > 0:
                model = {
                    'model_name': v.get('model_name') or v.get('model') or vid,
                    'operational_range_km': op_range,
                    'fuel_type': v.get('fuel_type') or 'DIESEL',
                    'tank_capacity_liters': float(v.get('tank_capacity_liters') or v.get('tank_capacity') or 80.0),
                    'fuel_consumption_kmpl': float(v.get('fuel_consumption_kmpl') or v.get('consumption_kmpl') or 5.0),
                    'fuel_spec_verified': bool(v.get('fuel_spec_verified', 1)),
                    'capacity_source_note': 'Convoy Manifest Specification'
                }

        # Guard against unassigned or unknown vehicles
        if not vid or not model or 'operational_range_km' not in model or not model.get('operational_range_km'):
            any_unknown = True
            convoy_eval.append({
                'position': idx + 1,
                'vehicle_id': vid or f'UNKNOWN_POS_{idx+1}',
                'unit_id': v.get('unit_id'),
                'callsign': v.get('callsign'),
                'model_name': 'Unknown / Unassigned Vehicle',
                'fuel_type': 'UNKNOWN',
                'tank_capacity_liters': None,
                'fuel_consumption_kmpl': None,
                'fuel_spec_verified': False,
                'capacity_source_note': 'Missing or unregistered vehicle catalog entry',
                'rated_range_km': None,
                'departure_fuel_pct': None,
                'remaining_fuel_liters': None,
                'fuel_provenance': 'UNKNOWN (Vehicle not found in catalog)',
                'reserve_buffer_km': None,
                'usable_range_km': None,
                'range_to_next_depot_km': None,
                'feasibility': 'CANNOT_DETERMINE',
                'feasibility_message': f"Vehicle specification missing for '{vid}' in vehicle master and convoy manifest."
            })
            continue

        model_name = model.get('model_name') or vid
        rated_range = float(model.get('operational_range_km') or 0.0)
        fuel_type = model.get('fuel_type') or 'DIESEL'
        tank_cap = float(model.get('tank_capacity_liters') or 0.0) if model.get('tank_capacity_liters') is not None else None
        consumption = float(model.get('fuel_consumption_kmpl') or 0.0) if model.get('fuel_consumption_kmpl') is not None else None
        spec_verified = bool(model.get('fuel_spec_verified', 1))

        # Check departure fuel level with rigorous numeric and bounds validation
        dip_val = None
        provenance = ''
        if vid in veh_levels:
            try:
                raw_val = float(veh_levels[vid])
                if raw_val < 0.0 or raw_val > 100.0:
                    dip_val = None
                    provenance = f'INVALID DIP VALUE ({raw_val}% outside 0-100% capacity)'
                else:
                    dip_val = round(raw_val, 1)
                    provenance = f'MANUAL PHYSICAL DIP ({dip_val}% logged at dispatch)'
            except (ValueError, TypeError):
                dip_val = None
                provenance = f'INVALID DIP FORMAT ({veh_levels[vid]})'
        elif dep_mode == 'ASSUMED_FULL':
            dip_val = 100.0
            provenance = 'PLANNING ASSUMPTION: 100% FULL DEPARTURE TANK (Unverified Telematics)'
        elif journey_row.get('status') == 'COMPLETED':
            # For historical completed journeys where departure dip was not recorded,
            # evaluate theoretical performance using nominal full tank baseline
            dip_val = 100.0
            provenance = 'HISTORICAL DEBRIEF: 100% NOMINAL TANK BASELINE (Manual Dip Not Logged)'
        else:
            dip_val = None
            provenance = 'DEPARTURE FUEL UNVERIFIED (Policy: UNKNOWN)'
        
        remaining_fuel_liters = round(tank_cap * (dip_val / 100.0), 1) if (tank_cap is not None and dip_val is not None) else None
        
        invalid_consumption = (consumption is not None and consumption <= 0.0)
        invalid_tank = (tank_cap is not None and tank_cap <= 0.0)
        invalid_rated_range = (rated_range <= 0.0)

        if dip_val is None or total_distance_km <= 0 or invalid_consumption or invalid_tank or invalid_rated_range:
            any_unknown = True
            usable_range = None
            reserve_km = None
            feasibility = 'CANNOT_DETERMINE'
            if invalid_consumption:
                feasibility_msg = f'Invalid fuel consumption ({consumption} km/L). Consumption must be positive.'
            elif invalid_tank:
                feasibility_msg = f'Invalid tank capacity ({tank_cap} L). Tank capacity must be positive.'
            elif invalid_rated_range:
                feasibility_msg = f'Invalid operational range ({rated_range} km). Must be positive.'
            elif dip_val is None:
                feasibility_msg = 'Departure fuel level unverified. Cannot calculate usable range.'
            else:
                feasibility_msg = 'Route distance unverified. Cannot calculate usable range.'
            range_to_next_depot_km = None
        else:
            usable_range = round(rated_range * (dip_val / 100.0) * (1.0 - reserve_pct / 100.0), 1)
            reserve_km = round(rated_range * (dip_val / 100.0) * (reserve_pct / 100.0), 1)
            range_to_next_depot_km = round(usable_range - next_suitable_depot['corridor_km'], 1) if next_suitable_depot else None
            
            if usable_range >= total_distance_km:
                feasibility = 'FEASIBLE_NON_STOP'
                margin = round(usable_range - total_distance_km, 1)
                feasibility_msg = f'Non-stop feasible ({usable_range} km usable vs {total_distance_km} km route; {margin} km margin above {reserve_pct}% reserve).'
            else:
                deficit = round(total_distance_km - usable_range, 1)
                reachable_compat = [s for s in candidate_stations if s['corridor_km'] <= usable_range and fuel_type in s['fuel_types'] and s['authorization_status'] == 'AUTHORIZED_MILITARY_DEPOT']
                if reachable_compat:
                    best_stop = reachable_compat[-1]
                    feasibility = 'REQUIRES_REFUELLING'
                    feasibility_msg = f'Refuelling required ({deficit} km deficit). Reachable authorized stop: {best_stop["station_name"]} at corridor km {best_stop["corridor_km"]}.'
                else:
                    feasibility = 'INFEASIBLE_STRANDING_RISK'
                    feasibility_msg = f'STRANDING RISK: Usable range ({usable_range} km) cannot reach destination ({total_distance_km} km) and no authorized {fuel_type} depot exists within reach.'
        
        convoy_eval.append({
            'position': idx + 1,
            'vehicle_id': vid,
            'unit_id': v.get('unit_id'),
            'callsign': v.get('callsign'),
            'model_name': model_name,
            'fuel_type': fuel_type,
            'tank_capacity_liters': tank_cap,
            'fuel_consumption_kmpl': consumption,
            'fuel_spec_verified': spec_verified,
            'capacity_source_note': model.get('capacity_source_note') or 'Defense Manual',
            'rated_range_km': rated_range,
            'departure_fuel_pct': dip_val,
            'remaining_fuel_liters': remaining_fuel_liters,
            'fuel_provenance': provenance,
            'reserve_buffer_km': reserve_km,
            'usable_range_km': usable_range,
            'range_to_next_depot_km': range_to_next_depot_km,
            'feasibility': feasibility,
            'feasibility_message': feasibility_msg
        })

    # 5. Convoy-Level Synthesis
    valid_usable = [x for x in convoy_eval if x.get('usable_range_km') is not None]
    if not convoy_eval:
        convoy_status = 'EMPTY_CONVOY'
        convoy_msg = 'Convoy manifest is empty. At least one vehicle required.'
        limiting_veh = None
        limiting_usable_km = None
        avg_convoy_range_km = None
    elif not valid_usable:
        convoy_status = 'FEASIBILITY_UNVERIFIED'
        convoy_msg = 'Convoy fuel feasibility cannot be evaluated: vehicle operational range specifications are missing.'
        limiting_veh = None
        limiting_usable_km = None
        avg_convoy_range_km = None
    else:
        limiting_veh = min(valid_usable, key=lambda x: x['usable_range_km'])
        limiting_usable_km = limiting_veh['usable_range_km']
        avg_convoy_range_km = round(sum(x['usable_range_km'] for x in valid_usable) / len(valid_usable), 1)
        
        if all(x['feasibility'] == 'FEASIBLE_NON_STOP' for x in convoy_eval):
            convoy_status = 'FEASIBLE_NON_STOP'
            convoy_msg = f'All {len(convoy_eval)} vehicles can complete the {total_distance_km} km journey non-stop with {reserve_pct}% reserve intact. Limiting vehicle: {limiting_veh["model_name"]} ({limiting_usable_km} km usable).'
        elif any(x['feasibility'] == 'INFEASIBLE_STRANDING_RISK' for x in convoy_eval):
            convoy_status = 'INFEASIBLE_STRANDING_RISK'
            infeasible_models = [x['model_name'] for x in convoy_eval if x['feasibility'] == 'INFEASIBLE_STRANDING_RISK']
            convoy_msg = f'CRITICAL: Infeasible fuel leg. Stranding risk for: {", ".join(infeasible_models)}. Cannot reach any compatible authorized refuelling stop.'
        elif any(x['feasibility'] == 'REQUIRES_REFUELLING' for x in convoy_eval):
            convoy_status = 'REFUELLING_RECOMMENDED'
            convoy_msg = f'Refuelling stop recommended. Limiting vehicle ({limiting_veh["model_name"]}) has {limiting_usable_km} km usable range ({round(total_distance_km - limiting_usable_km, 1)} km deficit).'
        else:
            convoy_status = 'FEASIBILITY_UNVERIFIED'
            convoy_msg = 'Convoy fuel feasibility cannot be evaluated for all vehicles.'

    ovr = query('SELECT * FROM journey_fuel_overrides WHERE journey_id=?', [jid], True)
    authorized_stations = [s for s in candidate_stations if s.get('authorization_status') == 'AUTHORIZED_MILITARY_DEPOT']
    unverified_stations = [s for s in candidate_stations if s.get('authorization_status') != 'AUTHORIZED_MILITARY_DEPOT']

    return {
        'journey_id': jid,
        'total_distance_km': total_distance_km,
        'reserve_percent': reserve_pct,
        'departure_fuel_mode': dep_mode,
        'convoy_status': convoy_status,
        'convoy_message': convoy_msg,
        'limiting_vehicle': limiting_veh,
        'limiting_usable_range_km': limiting_usable_km,
        'average_convoy_range_km': avg_convoy_range_km,
        'next_suitable_refuelling_point': next_suitable_depot,
        'vehicles': convoy_eval,
        'candidate_stations': candidate_stations,
        'authorized_stations': authorized_stations,
        'unverified_candidate_stations': unverified_stations,
        'fuel_override': dict(ovr) if ovr else None,
        'data_limitations': {
            'telematics_status': 'DISCONNECTED',
            'telematics_message': 'Live vehicle CAN bus / fuel sensor telemetry feed is offline. Physical dip or operator assumption required.',
            'authorization_policy': 'Civilian retail stations require civil requisition authorization; only military supply depots are authorized by default.'
        }
    }

@app.post('/api/journeys/{journey_id}/status')
def set_journey_status(journey_id:str, s:JourneyStatus, _user: dict = Depends(require_role(ROLE_OPS))):
    allowed={'DRAFT','SCHEDULED','ACTIVE','DISRUPTED','COMPLETED','CANCELLED'}
    if s.status not in allowed: raise HTTPException(400,'Invalid journey status.')
    row=query('SELECT status FROM journeys WHERE journey_id=?',[journey_id],True)
    if not row: raise HTTPException(404,'Journey not found.')
    transitions={'DRAFT':{'SCHEDULED','CANCELLED'},'SCHEDULED':{'ACTIVE','CANCELLED'},'ACTIVE':{'DISRUPTED','COMPLETED','CANCELLED'},'DISRUPTED':{'ACTIVE','COMPLETED','CANCELLED'},'COMPLETED':set(),'CANCELLED':set()}
    if s.status not in transitions[row['status']]: raise HTTPException(409,f"Invalid transition {row['status']} -> {s.status}")
    t=now()
    event_msg = s.message.strip() if s.message and s.message.strip() else f'Journey status changed to {s.status}'

    # Departure Fuel Feasibility Safety Gate (Enforced server-side when moving to ACTIVE)
    if s.status == 'ACTIVE':
        j_full = _fetch_journey(journey_id)
        fuel_eval = evaluate_journey_fuel(j_full)
        c_status = fuel_eval.get('convoy_status')
        
        # Calculate assessment hash to prevent stale or manipulated override reuse
        f_cfg = j_full.get('fuel_config') or {}
        assessment_hash = hashlib.sha256(json.dumps({
            'distance': fuel_eval.get('total_distance_km'),
            'status': c_status,
            'vehicles': [v['vehicle_id'] for v in fuel_eval.get('vehicles', [])],
            'levels': f_cfg.get('vehicle_fuel_levels', {}),
            'mode': f_cfg.get('departure_fuel_mode'),
            'reserve': f_cfg.get('reserve_percent')
        }, sort_keys=True).encode()).hexdigest()[:16]

        if c_status not in ('FEASIBLE_NON_STOP', 'REFUELLING_RECOMMENDED'):
            override_applied = False
            override_rec = query('SELECT * FROM journey_fuel_overrides WHERE journey_id=?', [journey_id], True)
            
            # Check if override_reason is provided in this transition request
            if s.override_reason and s.override_reason.strip():
                # Server-derived role authorization check
                if _user['role'] not in ROLE_COORDINATOR:
                    raise HTTPException(403, f"Role '{_user['role']}' is not authorized to grant departure fuel overrides. Coordinator or Admin required.")
                
                reason_clean = s.override_reason.strip()
                ovr_type = 'UNCERTAINTY_OVERRIDE' if c_status == 'FEASIBILITY_UNVERIFIED' else 'INFEASIBILITY_OVERRIDE'
                
                with db_transaction() as c:
                    c.execute('''
                        INSERT INTO journey_fuel_overrides (
                            journey_id, override_type, fuel_assessment_status, assessment_hash,
                            reason, authorized_by, authorized_role, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(journey_id) DO UPDATE SET
                            override_type=excluded.override_type,
                            fuel_assessment_status=excluded.fuel_assessment_status,
                            assessment_hash=excluded.assessment_hash,
                            reason=excluded.reason,
                            authorized_by=excluded.authorized_by,
                            authorized_role=excluded.authorized_role,
                            created_at=excluded.created_at
                    ''', [journey_id, ovr_type, c_status, assessment_hash, reason_clean, _user['email'], _user['role'], t])
                    c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                              ['FUEL_DEPARTURE_OVERRIDE', 'JOURNEY', journey_id,
                               f"Fuel departure override ({ovr_type}) authorized by {_user['email']} ({_user['role']}) for {c_status}. Reason: {reason_clean}", t])
                    c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                              [journey_id, 'FUEL_OVERRIDE', f"Departure authorized under {ovr_type}: {reason_clean}",
                               json.dumps({'override_type': ovr_type, 'authorized_by': _user['email'], 'role': _user['role'], 'status': c_status}), t])
                override_applied = True
                event_msg = f"Journey departed ACTIVE under {ovr_type}: {reason_clean}"
            elif override_rec:
                # Validate existing persisted override against current assessment
                if override_rec['assessment_hash'] != assessment_hash:
                    raise HTTPException(409, detail={
                        'code': 'DEPARTURE_OVERRIDE_STALE',
                        'message': 'Previous fuel departure override is stale because fuel configuration or convoy manifest was modified. Re-evaluation and new authorization required.'
                    })
                override_applied = True
                event_msg = f"Journey departed ACTIVE under authorized {override_rec['override_type']}: {override_rec['reason']}"
            
            if not override_applied:
                block_code = 'DEPARTURE_BLOCKED_UNVERIFIED' if c_status == 'FEASIBILITY_UNVERIFIED' else 'DEPARTURE_BLOCKED_INFEASIBLE'
                raise HTTPException(409, detail={
                    'code': block_code,
                    'status': c_status,
                    'message': f"Departure blocked by fuel safety gate ({c_status}). {fuel_eval.get('convoy_message')} Authorized override with non-empty reason required.",
                    'limiting_vehicle': fuel_eval.get('limiting_vehicle'),
                    'limiting_usable_range_km': fuel_eval.get('limiting_usable_range_km'),
                    'total_distance_km': fuel_eval.get('total_distance_km'),
                    'data_limitations': fuel_eval.get('data_limitations')
                })

    with db_transaction() as c:
        c.execute('UPDATE journeys SET status=?,updated_at=? WHERE journey_id=?',[s.status,t,journey_id])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,created_at) VALUES(?,?,?,?)',[journey_id,s.status,event_msg,t])
    return _fetch_journey(journey_id)

@app.get('/api/journeys/{journey_id}/fuel-override')
def get_fuel_override(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    if not query('SELECT 1 FROM journeys WHERE journey_id=?', [journey_id], True):
        raise HTTPException(404, 'Journey not found.')
    row = query('SELECT * FROM journey_fuel_overrides WHERE journey_id=?', [journey_id], True)
    return dict(row) if row else None

@app.post('/api/journeys/{journey_id}/fuel-override')
def create_fuel_override(journey_id: str, req: FuelOverrideRequest, _user: dict = Depends(require_role(ROLE_COORDINATOR))):
    j = _fetch_journey(journey_id)
    if not j: raise HTTPException(404, 'Journey not found.')
    if j.get('status') in TERMINAL_JOURNEY_STATUSES:
        raise HTTPException(409, detail={
            "code": "TERMINAL_JOURNEY_LOCKED",
            "status": j.get('status'),
            "message": f"Journey '{journey_id}' is in terminal state '{j.get('status')}' and cannot be modified."
        })
    if not req.reason or not req.reason.strip():
        raise HTTPException(400, 'Override reason is required and cannot be empty.')
    
    fuel_eval = evaluate_journey_fuel(j)
    c_status = fuel_eval.get('convoy_status')
    if c_status in ('FEASIBLE_NON_STOP', 'REFUELLING_RECOMMENDED'):
        raise HTTPException(400, 'Convoy fuel status is already feasible. No departure override needed.')
    
    ovr_type = 'UNCERTAINTY_OVERRIDE' if c_status == 'FEASIBILITY_UNVERIFIED' else 'INFEASIBILITY_OVERRIDE'
    t = now()
    f_cfg = j.get('fuel_config') or {}
    assessment_hash = hashlib.sha256(json.dumps({
        'distance': fuel_eval.get('total_distance_km'),
        'status': c_status,
        'vehicles': [v['vehicle_id'] for v in fuel_eval.get('vehicles', [])],
        'levels': f_cfg.get('vehicle_fuel_levels', {}),
        'mode': f_cfg.get('departure_fuel_mode'),
        'reserve': f_cfg.get('reserve_percent')
    }, sort_keys=True).encode()).hexdigest()[:16]

    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        c.execute('''
            INSERT INTO journey_fuel_overrides (
                journey_id, override_type, fuel_assessment_status, assessment_hash,
                reason, authorized_by, authorized_role, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                override_type=excluded.override_type,
                fuel_assessment_status=excluded.fuel_assessment_status,
                assessment_hash=excluded.assessment_hash,
                reason=excluded.reason,
                authorized_by=excluded.authorized_by,
                authorized_role=excluded.authorized_role,
                created_at=excluded.created_at
        ''', [journey_id, ovr_type, c_status, assessment_hash, req.reason.strip(), _user['email'], _user['role'], t])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['FUEL_DEPARTURE_OVERRIDE', 'JOURNEY', journey_id,
                   f"Fuel departure override ({ovr_type}) recorded by {_user['email']} ({_user['role']}). Reason: {req.reason.strip()}", t])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'FUEL_OVERRIDE', f"Fuel departure override recorded: {req.reason.strip()}",
                   json.dumps({'override_type': ovr_type, 'authorized_by': _user['email'], 'role': _user['role'], 'status': c_status}), t])
    return _fetch_journey(journey_id)

@app.delete('/api/journeys/{journey_id}/fuel-override')
def delete_fuel_override(journey_id: str, _user: dict = Depends(require_role(ROLE_COORDINATOR))):
    t = now()
    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        c.execute('DELETE FROM journey_fuel_overrides WHERE journey_id=?', [journey_id])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['FUEL_OVERRIDE_REVOKE', 'JOURNEY', journey_id, f"Fuel departure override revoked by {_user['email']} ({_user['role']})", t])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'FUEL_OVERRIDE_REVOKED', f"Departure fuel override revoked by {_user['email']}", json.dumps({'revoked_by': _user['email']}), t])
    return _fetch_journey(journey_id)

@app.post('/api/journeys/{journey_id}/disruption')
def log_journey_disruption(journey_id:str, req:DisruptionRequest, _user: dict = Depends(require_role(ROLE_OPS))):
    row=query('SELECT status FROM journeys WHERE journey_id=?',[journey_id],True)
    if not row: raise HTTPException(404,'Journey not found.')
    current_status = row['status']
    if current_status != 'ACTIVE':
        raise HTTPException(409, f"Cannot log disruption on journey in state '{current_status}'. Journey must be ACTIVE.")
    t=now()
    payload_str = json.dumps(req.payload or {})
    with db_transaction() as c:
        c.execute('UPDATE journeys SET status=?,updated_at=? WHERE journey_id=?',['DISRUPTED',t,journey_id])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id,'DISRUPTION',req.message.strip(),payload_str,t])
    return _fetch_journey(journey_id)

@app.post('/api/journeys/{journey_id}/events')
def journey_event(journey_id:str, e:JourneyEventCreate, _user: dict = Depends(require_role(ROLE_OPS))):
    t=now()
    payload_str = json.dumps(e.payload or {})
    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, e.event_type.strip(), e.message.strip(), payload_str, t])
    return {'ok':True,'created_at':t}

@app.get('/api/journeys/{journey_id}/spacing-config')
def get_spacing_config(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    if not query('SELECT 1 FROM journeys WHERE journey_id=?', [journey_id], True):
        raise HTTPException(404, 'Journey not found.')
    row = query('SELECT * FROM journey_spacing_config WHERE journey_id=?', [journey_id], True)
    if row:
        return dict(row)
    return {
        'journey_id': journey_id,
        'min_spacing_m': 40.0,
        'max_spacing_m': None,
        'updated_at': now(),
        'updated_by': 'SYSTEM_DEFAULT',
        'reason': 'Default safe operational spacing'
    }

@app.post('/api/journeys/{journey_id}/spacing-config')
def update_spacing_config(journey_id: str, req: SpacingConfigRequest, _user: dict = Depends(require_role(ROLE_OPS))):
    t = now()
    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        c.execute('''
            INSERT INTO journey_spacing_config (journey_id, min_spacing_m, max_spacing_m, updated_at, updated_by, reason)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                min_spacing_m=excluded.min_spacing_m,
                max_spacing_m=excluded.max_spacing_m,
                updated_at=excluded.updated_at,
                updated_by=excluded.updated_by,
                reason=excluded.reason
        ''', [journey_id, req.min_spacing_m, req.max_spacing_m, t, _user['email'], req.reason or ''])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['CONFIG_UPDATE', 'JOURNEY_SPACING', journey_id,
                   f"Spacing updated: min={req.min_spacing_m}m, max={req.max_spacing_m}m by {_user['email']}", t])
    return query('SELECT * FROM journey_spacing_config WHERE journey_id=?', [journey_id], True)

@app.get('/api/journeys/{journey_id}/incidents')
def list_incidents(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    if not query('SELECT 1 FROM journeys WHERE journey_id=?', [journey_id], True):
        raise HTTPException(404, 'Journey not found.')
    rows = query('SELECT * FROM incidents WHERE journey_id=? ORDER BY created_at DESC', [journey_id])
    for r in rows:
        r['operator_ack'] = _safe_json(r.get('operator_ack'), None)
        r['checkpoint_ack'] = _safe_json(r.get('checkpoint_ack'), None)
        r['resolution_details'] = _safe_json(r.get('resolution_details'), None)
    return rows

@app.post('/api/journeys/{journey_id}/incidents')
def create_incident(journey_id: str, req: IncidentCreate, _user: dict = Depends(require_role(ROLE_OPS))):
    if not query('SELECT 1 FROM journeys WHERE journey_id=?', [journey_id], True):
        raise HTTPException(404, 'Journey not found.')
    t = now()
    
    with db_transaction() as c:
        # Check for open incident with same rule_type and vehicle_id for deduplication
        existing = c.execute('''
            SELECT id, occurrence_count FROM incidents
            WHERE journey_id=? AND rule_type=? AND coalesce(vehicle_id, '')=? AND handling_state='OPEN'
        ''', [journey_id, req.rule_type, req.vehicle_id or '']).fetchone()
        
        if existing:
            inc_id = existing[0]
            new_count = existing[1] + 1
            c.execute('''
                UPDATE incidents
                SET occurrence_count=?, observation_time=?, updated_at=?, message=?
                WHERE id=?
            ''', [new_count, t, t, req.message.strip(), inc_id])
            c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                      ['INCIDENT_DEDUP', 'INCIDENT', inc_id,
                       f"Incident count incremented to {new_count} for {req.rule_type} on {journey_id}", t])
        else:
            inc_id = 'INC-' + uuid.uuid4().hex[:8].upper()
            c.execute('''
                INSERT INTO incidents (
                    id, journey_id, vehicle_id, unit_id, rule_type, violation_type,
                    message, evidence_source, observation_time, last_known_pos,
                    verification_state, handling_state, occurrence_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUSPECTED', 'OPEN', 1, ?, ?)
            ''', [
                inc_id, journey_id, req.vehicle_id, req.unit_id, req.rule_type, req.violation_type,
                req.message.strip(), req.evidence_source, t, req.last_known_pos, t, t
            ])
            c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                      ['INCIDENT_CREATE', 'INCIDENT', inc_id,
                       f"Incident created: {req.rule_type} ({req.violation_type}) for {journey_id} by {_user['email']}", t])
            c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                      [journey_id, 'INCIDENT', f"Incident reported: {req.violation_type} - {req.message.strip()}",
                       json.dumps({'incident_id': inc_id, 'rule_type': req.rule_type}), t])

    row = query('SELECT * FROM incidents WHERE id=?', [inc_id], True)
    row['operator_ack'] = _safe_json(row.get('operator_ack'), None)
    row['checkpoint_ack'] = _safe_json(row.get('checkpoint_ack'), None)
    row['resolution_details'] = _safe_json(row.get('resolution_details'), None)
    return row

@app.post('/api/journeys/{journey_id}/incidents/{incident_id}/ack')
def ack_incident(journey_id: str, incident_id: str, req: Optional[AckRequest] = None, _user: dict = Depends(require_role(ROLE_OPS))):
    inc = query('SELECT * FROM incidents WHERE id=? AND journey_id=?', [incident_id, journey_id], True)
    if not inc:
        raise HTTPException(404, 'Incident not found.')
    
    t = now()
    user_role = _user['role']
    ack_data = json.dumps({
        'acknowledged_by': _user['email'],
        'user_id': _user['id'],
        'role': user_role,
        'timestamp': t
    })

    # Derive target strictly server-side from user role
    target = None
    if user_role == 'COORDINATOR':
        target = 'OPERATOR'
    elif user_role == 'CHECKPOINT_OPERATOR':
        target = 'CHECKPOINT'
    elif user_role == 'ADMIN':
        if req and req.target in ('OPERATOR', 'CHECKPOINT'):
            target = req.target
        else:
            if not inc.get('operator_ack'):
                target = 'OPERATOR'
            else:
                target = 'CHECKPOINT'

    with db_transaction() as c:
        if target == 'OPERATOR':
            c.execute('UPDATE incidents SET operator_ack=?, handling_state=CASE WHEN handling_state="OPEN" THEN "ACKNOWLEDGED" ELSE handling_state END, updated_at=? WHERE id=?',
                      [ack_data, t, incident_id])
        else:
            c.execute('UPDATE incidents SET checkpoint_ack=?, handling_state=CASE WHEN handling_state="OPEN" THEN "ACKNOWLEDGED" ELSE handling_state END, updated_at=? WHERE id=?',
                      [ack_data, t, incident_id])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['INCIDENT_ACK', 'INCIDENT', incident_id,
                   f"Incident acknowledged as {target} by {_user['email']} ({user_role})", t])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'INCIDENT_ACK', f"Incident {incident_id} acknowledged by {user_role} ({_user['email']})",
                   json.dumps({'incident_id': incident_id, 'ack_target': target}), t])

    res = query('SELECT * FROM incidents WHERE id=?', [incident_id], True)
    res['operator_ack'] = _safe_json(res.get('operator_ack'), None)
    res['checkpoint_ack'] = _safe_json(res.get('checkpoint_ack'), None)
    res['resolution_details'] = _safe_json(res.get('resolution_details'), None)
    return res

@app.post('/api/journeys/{journey_id}/incidents/{incident_id}/resolve')
def resolve_incident(journey_id: str, incident_id: str, req: IncidentResolve, _user: dict = Depends(require_role(ROLE_OPS))):
    inc = query('SELECT * FROM incidents WHERE id=? AND journey_id=?', [incident_id, journey_id], True)
    if not inc:
        raise HTTPException(404, 'Incident not found.')
    
    t = now()
    res_data = json.dumps({
        'resolved_by': _user['email'],
        'user_id': _user['id'],
        'role': _user['role'],
        'details': req.resolution.strip(),
        'timestamp': t
    })
    
    v_state = req.verification_state if req.verification_state in ('CONFIRMED', 'DISMISSED', 'FALSE_ALARM') else 'CONFIRMED'
    
    with db_transaction() as c:
        c.execute('''
            UPDATE incidents
            SET handling_state='RESOLVED', verification_state=?, resolution_details=?, updated_at=?
            WHERE id=?
        ''', [v_state, res_data, t, incident_id])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['INCIDENT_RESOLVE', 'INCIDENT', incident_id,
                   f"Incident resolved ({v_state}) by {_user['email']}: {req.resolution.strip()}", t])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'INCIDENT_RESOLVED', f"Incident {incident_id} resolved: {req.resolution.strip()}",
                   json.dumps({'incident_id': incident_id, 'verification_state': v_state}), t])

    res = query('SELECT * FROM incidents WHERE id=?', [incident_id], True)
    res['operator_ack'] = _safe_json(res.get('operator_ack'), None)
    res['checkpoint_ack'] = _safe_json(res.get('checkpoint_ack'), None)
    res['resolution_details'] = _safe_json(res.get('resolution_details'), None)
    return res

@app.get('/api/journeys/{journey_id}/fuel-intelligence')
def get_fuel_intelligence(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    j = _fetch_journey(journey_id)
    return evaluate_journey_fuel(j)

@app.get('/api/journeys/{journey_id}/report')
def get_journey_report(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    j = _fetch_journey(journey_id)
    if (j.get('status') or '').upper() != 'COMPLETED':
        raise HTTPException(
            status_code=403,
            detail=f"Debrief report generation unauthorized. Reports are strictly authorized for COMPLETED journeys only. Journey '{journey_id}' is currently '{j.get('status') or 'UNKNOWN'}'."
        )
    fuel_eval = evaluate_journey_fuel(j)
    return report_service.build_raw_journey_report(j, fuel_eval, query, node_map, now())

@app.get('/api/journeys/{journey_id}/report/pdf')
def get_journey_report_pdf(journey_id: str, _user: dict = Depends(require_role(ROLE_ALL))):
    j = _fetch_journey(journey_id)
    if (j.get('status') or '').upper() != 'COMPLETED':
        raise HTTPException(
            status_code=403,
            detail=f"Debrief PDF export unauthorized. Reports are strictly authorized for COMPLETED journeys only. Journey '{journey_id}' is currently '{j.get('status') or 'UNKNOWN'}'."
        )
    fuel_eval = evaluate_journey_fuel(j)
    raw_report = report_service.build_raw_journey_report(j, fuel_eval, query, node_map, now())
    display_model = report_service.normalize_report_display_model(raw_report)

    logo_path = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend', 'vayu.png'))
    if not os.path.exists(logo_path):
        logo_path = None

    try:
        pdf_bytes = report_pdf.generate_journey_debrief_pdf(display_model, logo_path=logo_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate journey debrief PDF: {str(e)}")

    safe_id = "".join(c for c in journey_id if c.isalnum() or c in ("-", "_")) or "report"
    filename = f"VAYU-ORBIT-Journey-Debrief-{safe_id}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.post('/api/journeys/{journey_id}/fuel-config')
def update_fuel_config(journey_id: str, req: FuelConfigRequest, _user: dict = Depends(require_role(ROLE_OPS))):
    t = now()
    levels_json = json.dumps(req.vehicle_fuel_levels or {})
    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        # Invalidate any prior override on fuel policy or level change
        c.execute('DELETE FROM journey_fuel_overrides WHERE journey_id=?', [journey_id])
        c.execute('''
            INSERT INTO journey_fuel_config (journey_id, reserve_percent, departure_fuel_mode, vehicle_fuel_levels_json, updated_at, updated_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                reserve_percent=excluded.reserve_percent,
                departure_fuel_mode=excluded.departure_fuel_mode,
                vehicle_fuel_levels_json=excluded.vehicle_fuel_levels_json,
                updated_at=excluded.updated_at,
                updated_by=excluded.updated_by,
                notes=excluded.notes
        ''', [journey_id, req.reserve_percent, req.departure_fuel_mode, levels_json, t, _user['email'], req.notes or ''])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['FUEL_CONFIG_UPDATE', 'JOURNEY_FUEL', journey_id,
                   f"Fuel config updated: reserve={req.reserve_percent}%, mode={req.departure_fuel_mode} by {_user['email']}", t])
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'FUEL_CONFIG', f"Fuel policy updated: reserve {req.reserve_percent}%, mode: {req.departure_fuel_mode}",
                   json.dumps({'reserve_percent': req.reserve_percent, 'departure_fuel_mode': req.departure_fuel_mode}), t])
    j = _fetch_journey(journey_id)
    return evaluate_journey_fuel(j)

@app.post('/api/journeys/{journey_id}/fuel-preview-detour')
def preview_fuel_detour(journey_id: str, req: FuelDetourPreviewRequest, _user: dict = Depends(require_role(ROLE_OPS))):
    j = query('SELECT * FROM journeys WHERE journey_id=?', [journey_id], True)
    if not j: raise HTTPException(404, 'Journey not found.')
    station = query('SELECT * FROM places WHERE place_id=?', [req.station_id], True)
    if not station:
        if req.station_id.startswith('CIV-'):
            station = {'place_id': req.station_id, 'place_name': 'Civilian Highway Fuel Hub', 'lat': 28.85, 'lon': 77.52}
        else:
            raise HTTPException(404, 'Station not found.')
    
    route = _safe_json(j.get('route_json'), {})
    base_dist = float(j.get('distance_km') or route.get('distance_km') or 0.0)
    base_eta = float(j.get('eta_hours') or route.get('eta_hours') or 0.0)
    path = route.get('path', [])
    
    detour_path = list(path)
    if len(detour_path) >= 2:
        detour_path.insert(1, station['place_id'])
    else:
        detour_path.append(station['place_id'])
    
    detour_dist = round(base_dist + 8.5, 1)
    detour_eta = round(base_eta + 0.35, 2)
    st_coord = [float(station['lon']), float(station['lat'])]
    
    return {
        'station_id': station['place_id'],
        'station_name': station.get('place_name', req.station_id),
        'station_coord': st_coord,
        'baseline_distance_km': base_dist,
        'baseline_eta_hours': base_eta,
        'detour_distance_km': detour_dist,
        'detour_eta_hours': detour_eta,
        'delta_distance_km': round(detour_dist - base_dist, 1),
        'delta_eta_hours': round(detour_eta - base_eta, 2),
        'detour_path': detour_path,
        'note': 'Proposed refuelling detour. Baseline active route remains unchanged.'
    }

@app.post('/api/journeys/{journey_id}/fuel-apply-detour')
def apply_fuel_detour(journey_id: str, req: FuelDetourPreviewRequest, _user: dict = Depends(require_role(ROLE_COORDINATOR))):
    j = query('SELECT * FROM journeys WHERE journey_id=?', [journey_id], True)
    if not j: raise HTTPException(404, 'Journey not found.')
    station = query('SELECT * FROM places WHERE place_id=?', [req.station_id], True)
    st_name = station['place_name'] if station else req.station_id
    t = now()
    with db_transaction() as c:
        _assert_journey_non_terminal(c, journey_id)
        c.execute('INSERT INTO journey_events(journey_id,event_type,message,payload_json,created_at) VALUES(?,?,?,?,?)',
                  [journey_id, 'ROUTE_MODIFICATION', f"Refuelling detour applied: Stop at {st_name}",
                   json.dumps({'refuel_stop': req.station_id, 'applied_by': _user['email']}), t])
        c.execute('INSERT INTO audit_log(action,object_type,object_id,details,created_at) VALUES(?,?,?,?,?)',
                  ['ROUTE_MODIFICATION', 'JOURNEY', journey_id, f"Refuelling detour to {st_name} applied by {_user['email']}", t])
    return _fetch_journey(journey_id)

@app.get('/api/analytics')
def analytics(_user: dict = Depends(require_role(ROLE_ALL))):
    try:
        def _tbl_exists(name: str) -> bool:
            try:
                r = query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,), one=True)
                return bool(r)
            except Exception:
                return False

        # 1. Journeys status breakdown
        j_total = 0
        j_active = 0
        j_scheduled = 0
        j_completed = 0
        j_cancelled = 0
        j_disrupted = 0
        j_other = 0
        j_map = {}
        if _tbl_exists('journeys'):
            j_rows = query('SELECT status, count(1) AS cnt FROM journeys GROUP BY status')
            j_map = {(r['status'] or 'UNKNOWN'): int(r['cnt']) for r in j_rows}
            j_total = sum(j_map.values())
            j_active = j_map.get('ACTIVE', 0)
            j_scheduled = j_map.get('SCHEDULED', 0)
            j_completed = j_map.get('COMPLETED', 0)
            j_cancelled = j_map.get('CANCELLED', 0)
            j_disrupted = j_map.get('DISRUPTED', 0)
            known_sum = j_active + j_scheduled + j_completed + j_cancelled + j_disrupted
            j_other = max(0, j_total - known_sum)

        # 2. Vehicle catalogue models vs physical fleet units
        models_total = 0
        if _tbl_exists('vehicle_master'):
            vm_stat = query('SELECT count(1) AS cnt FROM vehicle_master', one=True)
            models_total = int(vm_stat['cnt']) if vm_stat else 0

        fu_total = 0
        fu_avail = 0
        fu_assigned = 0
        fu_in_op = 0
        fu_maint = 0
        fu_retired = 0
        fu_other = 0
        fu_map = {}
        if _tbl_exists('fleet_units'):
            fu_rows = query('SELECT status, count(1) AS cnt FROM fleet_units GROUP BY status')
            fu_map = {(r['status'] or 'UNKNOWN'): int(r['cnt']) for r in fu_rows}
            fu_total = sum(fu_map.values())
            fu_avail = fu_map.get('AVAILABLE', 0)
            fu_assigned = fu_map.get('ASSIGNED', 0)
            fu_in_op = fu_map.get('IN_OPERATION', 0)
            fu_maint = fu_map.get('MAINTENANCE', 0)
            fu_retired = fu_map.get('RETIRED', 0)
            fu_other = max(0, fu_total - (fu_avail + fu_assigned + fu_in_op + fu_maint + fu_retired))

        # 3. Places catalogue
        p_total = 0
        p_active = 0
        p_inactive = 0
        p_map = {}
        if _tbl_exists('places'):
            try:
                p_rows = query('SELECT status, count(1) AS cnt FROM places GROUP BY status')
                p_map = {(r['status'] or 'UNKNOWN'): int(r['cnt']) for r in p_rows}
                p_total = sum(p_map.values())
                p_active = p_map.get('ACTIVE', 0)
                p_inactive = max(0, p_total - p_active)
            except Exception:
                p_stat = query('SELECT count(1) AS cnt FROM places', one=True)
                p_total = int(p_stat['cnt']) if p_stat else 0
                p_active = p_total
                p_inactive = 0

        # 4. Incidents & resolution metrics
        inc_total = 0
        inc_resolved = 0
        inc_open = 0
        inc_other = 0
        res_rate = 0.0
        inc_map = {}
        by_rule = {}
        by_verification = {}
        by_violation = {}
        if _tbl_exists('incidents'):
            inc_rows = query('SELECT handling_state, count(1) AS cnt FROM incidents GROUP BY handling_state')
            inc_map = {(r['handling_state'] or 'UNKNOWN'): int(r['cnt']) for r in inc_rows}
            inc_total = sum(inc_map.values())
            inc_resolved = inc_map.get('RESOLVED', 0)
            inc_open = inc_map.get('OPEN', 0)
            inc_other = max(0, inc_total - (inc_resolved + inc_open))
            res_rate = round((inc_resolved / inc_total * 100.0), 1) if inc_total > 0 else 0.0

            inc_rules = query('SELECT rule_type, count(1) AS cnt FROM incidents GROUP BY rule_type')
            by_rule = {(r['rule_type'] or 'UNKNOWN'): int(r['cnt']) for r in inc_rules}

            inc_verif = query('SELECT verification_state, count(1) AS cnt FROM incidents GROUP BY verification_state')
            by_verification = {(r['verification_state'] or 'UNKNOWN'): int(r['cnt']) for r in inc_verif}

            inc_viol = query('SELECT violation_type, count(1) AS cnt FROM incidents GROUP BY violation_type')
            by_violation = {(r['violation_type'] or 'UNKNOWN'): int(r['cnt']) for r in inc_viol}

        return {
            'journeys': {
                'total': j_total,
                'active': j_active,
                'scheduled': j_scheduled,
                'completed': j_completed,
                'cancelled': j_cancelled,
                'disrupted': j_disrupted,
                'other': j_other,
                'by_status': j_map
            },
            'fleet': {
                'catalogue_models': models_total,
                'physical_units_total': fu_total,
                'physical_units_available': fu_avail,
                'physical_units_assigned': fu_assigned,
                'physical_units_in_operation': fu_in_op,
                'physical_units_maintenance': fu_maint,
                'physical_units_retired': fu_retired,
                'physical_units_other': fu_other,
                'by_status': fu_map
            },
            'places': {
                'total': p_total,
                'active': p_active,
                'inactive': p_inactive,
                'by_status': p_map
            },
            'incidents': {
                'total': inc_total,
                'open': inc_open,
                'resolved': inc_resolved,
                'other': inc_other,
                'resolution_rate_percent': res_rate,
                'by_handling_state': inc_map,
                'by_verification_state': by_verification,
                'by_rule': by_rule,
                'by_violation': by_violation
            },
            # Backwards-compatibility keys for legacy callers
            'journeys_total': j_total,
            'completed': j_completed,
            'disrupted': j_disrupted,
            'vehicles': models_total,
            'places_total': p_total,
            'active_places': p_active,
            'generated_at': now()
        }
    except Exception as e:
        raise HTTPException(500, f'Unable to compute analytics data: {str(e)}')

@app.get('/api/audit')
def audit(_user: dict = Depends(require_role(ROLE_COORDINATOR))):
    return query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200')

if __name__=='__main__':
    import uvicorn; uvicorn.run(app,host='127.0.0.1',port=8000)
