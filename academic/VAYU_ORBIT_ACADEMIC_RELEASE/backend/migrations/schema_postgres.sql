-- ==============================================================================
-- VAYU ORBIT v6.0.0 — Native PostgreSQL Schema DDL
-- Target: Cloud SQL for PostgreSQL / Firebase SQL Connect (vayu_orbit_db)
-- All 18 tables with constraints, indexes, sequences and foreign keys
-- ==============================================================================

-- Drop tables in reverse topological order if rebuilding
-- (Commented out for migration safety; use only in test teardown)
-- DROP TABLE IF EXISTS audit_events CASCADE;
-- DROP TABLE IF EXISTS audit_log CASCADE;
-- DROP TABLE IF EXISTS incidents CASCADE;
-- DROP TABLE IF EXISTS rop_reports CASCADE;
-- DROP TABLE IF EXISTS journey_readiness_overrides CASCADE;
-- DROP TABLE IF EXISTS journey_sensitivity_advisory CASCADE;
-- DROP TABLE IF EXISTS journey_spacing_config CASCADE;
-- DROP TABLE IF EXISTS journey_fuel_overrides CASCADE;
-- DROP TABLE IF EXISTS journey_fuel_config CASCADE;
-- DROP TABLE IF EXISTS journey_events CASCADE;
-- DROP TABLE IF EXISTS journeys CASCADE;
-- DROP TABLE IF EXISTS staged_sessions CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS fleet_units CASCADE;
-- DROP TABLE IF EXISTS vehicle_status CASCADE;
-- DROP TABLE IF EXISTS vehicle_master CASCADE;
-- DROP TABLE IF EXISTS places CASCADE;
-- DROP TABLE IF EXISTS military_nodes CASCADE;

-- ------------------------------------------------------------------------------
-- 1. Master Independent Catalogs & Reference Tables
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS military_nodes (
    node_id VARCHAR(32) PRIMARY KEY,
    installation_name VARCHAR(255) NOT NULL,
    node_type VARCHAR(64) NOT NULL,
    state VARCHAR(64) NOT NULL,
    command_jurisdiction VARCHAR(64) NOT NULL,
    primary_highway VARCHAR(64),
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    delay_multiplier DOUBLE PRECISION,
    max_axle_load_tons DOUBLE PRECISION,
    clearance_time_mins INTEGER
);

CREATE TABLE IF NOT EXISTS places (
    place_id VARCHAR(32) PRIMARY KEY,
    place_name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    region VARCHAR(64) DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    access_class VARCHAR(64) NOT NULL DEFAULT 'SIMULATION',
    max_vehicle_tons DOUBLE PRECISION DEFAULT 12.0,
    clearance_m DOUBLE PRECISION DEFAULT 4.0,
    support_services TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_master (
    vehicle_id VARCHAR(64) PRIMARY KEY,
    class_type VARCHAR(64) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    maker VARCHAR(128) NOT NULL,
    axle_config VARCHAR(32),
    gvw_tons DOUBLE PRECISION NOT NULL,
    operational_range_km INTEGER NOT NULL,
    max_speed_kmh INTEGER NOT NULL,
    routing_footprint VARCHAR(64),
    role_category VARCHAR(32) NOT NULL DEFAULT 'DUAL',
    is_vip BOOLEAN NOT NULL DEFAULT false,
    rated_passenger_capacity INTEGER,
    passenger_capacity_verified BOOLEAN NOT NULL DEFAULT false,
    rated_payload_tons DOUBLE PRECISION,
    payload_capacity_verified BOOLEAN NOT NULL DEFAULT false,
    capacity_source_note TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    fuel_type VARCHAR(32) DEFAULT 'DIESEL',
    tank_capacity_liters DOUBLE PRECISION,
    fuel_consumption_kmpl DOUBLE PRECISION,
    fuel_spec_verified BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS fleet_units (
    unit_id VARCHAR(64) PRIMARY KEY,
    model_id VARCHAR(64) NOT NULL REFERENCES vehicle_master(vehicle_id) ON UPDATE CASCADE,
    callsign VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    registration_no VARCHAR(64),
    assigned_base VARCHAR(128) DEFAULT '',
    is_demo BOOLEAN NOT NULL DEFAULT false,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_status (
    vehicle_id VARCHAR(64) PRIMARY KEY,
    status VARCHAR(64) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. User Identity & Governance (Authoritative PostgreSQL RBAC)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL,
    firebase_uid VARCHAR(128) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

CREATE TABLE IF NOT EXISTS staged_sessions (
    staged_id VARCHAR(64) PRIMARY KEY,
    owner_user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. Convoy Journeys, Configuration & Fuel Governance
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journeys (
    journey_id VARCHAR(64) PRIMARY KEY,
    origin_id VARCHAR(32) NOT NULL,
    dest_id VARCHAR(32) NOT NULL,
    origin_name VARCHAR(255),
    dest_name VARCHAR(255),
    departure_date VARCHAR(32),
    departure_time VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    convoy_json JSONB DEFAULT '[]'::jsonb,
    route_json JSONB DEFAULT '{}'::jsonb,
    baseline_route_json JSONB DEFAULT '{}'::jsonb,
    risk DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    eta_hours DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journeys_status ON journeys(status);
CREATE INDEX IF NOT EXISTS idx_journeys_departure ON journeys(departure_date, departure_time);

CREATE TABLE IF NOT EXISTS journey_events (
    id BIGSERIAL PRIMARY KEY,
    journey_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journey_events_journey ON journey_events(journey_id);

CREATE TABLE IF NOT EXISTS journey_fuel_config (
    journey_id VARCHAR(64) PRIMARY KEY REFERENCES journeys(journey_id) ON DELETE CASCADE,
    reserve_percent DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    departure_fuel_mode VARCHAR(64) NOT NULL DEFAULT 'UNKNOWN',
    vehicle_fuel_levels_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) NOT NULL,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS journey_fuel_overrides (
    journey_id VARCHAR(64) PRIMARY KEY REFERENCES journeys(journey_id) ON DELETE CASCADE,
    override_type VARCHAR(64) NOT NULL,
    fuel_assessment_status VARCHAR(64) NOT NULL,
    assessment_hash VARCHAR(128) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by VARCHAR(64) NOT NULL,
    authorized_role VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journey_spacing_config (
    journey_id VARCHAR(64) PRIMARY KEY REFERENCES journeys(journey_id) ON DELETE CASCADE,
    min_spacing_m DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    max_spacing_m DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) NOT NULL,
    reason TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS journey_sensitivity_advisory (
    journey_id VARCHAR(64) PRIMARY KEY,
    sensitivity_level VARCHAR(64) NOT NULL DEFAULT 'STANDARD',
    escort_requirement_state VARCHAR(64) NOT NULL DEFAULT 'REVIEW_REQUIRED',
    policy_reference VARCHAR(128) NOT NULL DEFAULT 'DEF-LOG-SOP-2026/SEC-04',
    support_notes TEXT DEFAULT '',
    reviewed_by VARCHAR(64),
    reviewed_at TIMESTAMPTZ,
    confirmed_by VARCHAR(64),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journey_readiness_overrides (
    journey_id VARCHAR(64) PRIMARY KEY,
    override_type VARCHAR(64) NOT NULL DEFAULT 'READINESS_ADVISORY_OVERRIDE',
    reason TEXT NOT NULL,
    authorized_by VARCHAR(64) NOT NULL,
    authorized_role VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. Reconnaissance (ROP), Incidents & Audits
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rop_reports (
    report_id VARCHAR(64) PRIMARY KEY,
    journey_id VARCHAR(64) NOT NULL,
    route_version VARCHAR(32) NOT NULL,
    reporting_user_id VARCHAR(64) NOT NULL,
    reporting_user_email VARCHAR(255) NOT NULL,
    reporting_user_role VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    observation_period_start TIMESTAMPTZ,
    observation_period_end TIMESTAMPTZ,
    parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by VARCHAR(64),
    reviewed_at TIMESTAMPTZ,
    review_decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rop_reports_journey ON rop_reports(journey_id);

CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    journey_id VARCHAR(64) NOT NULL REFERENCES journeys(journey_id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64),
    unit_id VARCHAR(64),
    rule_type VARCHAR(64) NOT NULL,
    violation_type VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    evidence_source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_REPORT',
    observation_time TIMESTAMPTZ NOT NULL,
    last_known_pos VARCHAR(128),
    verification_state VARCHAR(64) NOT NULL DEFAULT 'SUSPECTED',
    handling_state VARCHAR(64) NOT NULL DEFAULT 'OPEN',
    operator_ack VARCHAR(64),
    checkpoint_ack VARCHAR(64),
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    resolution_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidents_journey ON incidents(journey_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(128) NOT NULL,
    object_type VARCHAR(64),
    object_id VARCHAR(128),
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id VARCHAR(64),
    actor_role VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id VARCHAR(64) PRIMARY KEY,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    details TEXT NOT NULL,
    diff_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
