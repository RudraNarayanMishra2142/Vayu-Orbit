import sqlite3
import os
import json
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "military_logistics.db")

MODELS = [
    # Category A: Light Tactical Vehicles (LTV)
    ("V-LTV-01", "LTV", "Tata Safari Storme GS800", "Tata Motors", "4x4", 3.0, 600, 90, "Standard clearance, VIP capable", "PASSENGER", 1, 6, 1, 0.8, 1, "Indian Army GS800 Induction Bulletin / Tata Motors Defence", "/vehicles/tata_safari_gs800.svg"),
    ("V-LTV-01B", "LTV", "Tata Xenon 4x4 GS", "Tata Motors", "4x4", 2.95, 650, 90, "Standard clearance, pickup flatbed", "DUAL", 0, 5, 1, 1.0, 1, "Tata Motors Defence Division Specification", "/vehicles/tata_xenon.svg"),
    ("V-LTV-02", "LTV", "Mahindra Armado (ALSV)", "Mahindra Defence", "4x4", 4.7, 500, 80, "Armoured, High clearance, STANAG Level 1", "DUAL", 0, 6, 1, 1.0, 1, "Mahindra Defence Systems Official Datasheet", "/vehicles/mahindra_armado.svg"),
    ("V-LTV-03", "LTV", "Maruti Gypsy MG413W", "Maruti Suzuki", "4x4", 1.6, 450, 80, "Ultra-narrow mountain tracks", "PASSENGER", 0, 6, 1, 0.5, 1, "Indian Army General Service Vehicle Register", "/vehicles/maruti_gypsy.svg"),
    ("V-LTV-03B", "LTV", "Force Gurkha 4x4 Light Patrol", "Force Motors", "4x4", 2.5, 500, 80, "Narrow mountain tracks, high articulation", "PASSENGER", 0, 6, 1, 0.6, 1, "Force Motors Defence Division Datasheet", "/vehicles/force_gurkha.svg"),
    ("V-LTV-04", "LTV", "Kalyani M4 MRAP", "Kalyani Group", "4x4", 16.0, 800, 70, "Mine-Protected, High GVW (50kg blast)", "DUAL", 0, 10, 1, 2.3, 1, "Bharat Forge / Kalyani Group Technical Specifications", "/vehicles/kalyani_m4.svg"),
    ("V-LTV-05", "LTV", "Mahindra Marksman", "Mahindra Defence", "4x4", 3.2, 500, 85, "Armoured capsule, urban & riot mobility", "PASSENGER", 0, 6, 1, 0.4, 1, "Mahindra Defence Product Catalog", "/vehicles/mahindra_marksman.svg"),
    ("V-LTV-06", "LTV", "Tata IPMV / QRFV 4x4", "Tata Advanced Systems", "4x4", 14.0, 600, 80, "High ground clearance, STANAG 4569", "DUAL", 0, 10, 1, 2.0, 1, "TASL Infantry Protected Mobility Vehicle Data", "/vehicles/tata_ipmv.svg"),
    ("V-LTV-07", "LTV", "Mahindra Scorpio Army 4x4", "Mahindra & Mahindra", "4x4", 2.6, 650, 95, "Staff officer transport, command escort", "PASSENGER", 1, 7, 1, 0.4, 1, "Indian Army Procurement Order Spec", "/vehicles/mahindra_scorpio.svg"),

    # Category B: Medium Logistical Vehicles (MSV)
    ("V-MSV-01", "MSV", "Ashok Leyland Stallion 4x4", "Ashok Leyland", "4x4", 12.0, 500, 60, "Standard Indian Army workhorse", "DUAL", 0, 18, 1, 5.0, 1, "Ashok Leyland Stallion Mk IV Service Manual", "/vehicles/stallion_4x4.svg"),
    ("V-MSV-02", "MSV", "Tata LPTA 713 TC 4x4", "Tata Motors", "4x4", 7.75, 550, 65, "Agile in hilly states, cargo focus", "CARGO", 0, 2, 1, 2.5, 1, "Tata Motors Defence 713 TC Manual", "/vehicles/tata_713.svg"),
    ("V-MSV-03", "MSV", "Ashok Leyland Super Stallion 6x6", "Ashok Leyland", "6x6", 18.0, 600, 60, "Multi-axle highway & cross-country profile", "CARGO", 0, 3, 1, 10.0, 1, "Ashok Leyland Super Stallion 10-Tonne Brochure", "/vehicles/super_stallion_6x6.svg"),
    ("V-MSV-04", "MSV", "Tata LPTA 1623 4x4", "Tata Motors", "4x4", 16.0, 550, 65, "Medium tactical cargo transporter", "CARGO", 0, 2, 1, 6.0, 1, "Tata Motors LPTA 1623 Spec Sheet", "/vehicles/tata_1623.svg"),
    ("V-MSV-05", "MSV", "Swaraj Mazda SML 4x4 Troop Bus", "SML Isuzu", "4x4", 6.2, 450, 70, "Dedicated troop bus, passenger only", "PASSENGER", 0, 22, 1, 0.5, 0, "SML Isuzu Special Vehicles Spec (Payload estimated)", "/vehicles/sml_bus.svg"),
    ("V-MSV-06", "MSV", "Ashok Leyland Guru 4x4", "Ashok Leyland", "4x4", 11.5, 550, 65, "Light-medium tactical cargo truck", "CARGO", 0, 2, 1, 4.5, 1, "Ashok Leyland Defence Products", "/vehicles/al_guru.svg"),
    ("V-MSV-07", "MSV", "Eicher 4x4 Tactical Truck", "VE Commercial Vehicles", "4x4", 8.5, 550, 70, "Agile high-altitude logistical cargo", "CARGO", 0, 2, 1, 3.5, 1, "VECV Defence Technical Datasheet", "/vehicles/eicher_4x4.svg"),

    # Category C: Heavy Logistical & Specialist Vehicles (HSV)
    ("V-HSV-01", "HSV", "BEML Tatra T815 8x8", "BEML / Tatra", "8x8", 28.0, 650, 50, "Broad width, swinging half-axles", "CARGO", 0, 2, 1, 15.0, 1, "BEML Defence Tatra T815 VVN Manual", "/vehicles/tatra_8x8.svg"),
    ("V-HSV-02", "HSV", "Ashok Leyland FAT 6x6", "Ashok Leyland", "6x6", 24.0, 500, 55, "Tows 155mm artillery, onboard crane", "SPECIALIST", 0, 8, 1, 5.0, 1, "Ashok Leyland FAT 6x6 Defence Publication", "/vehicles/al_fat_6x6.svg"),
    ("V-HSV-03", "HSV", "Scania P410 HET 8x8", "Scania / BEML", "8x8", 35.0, 600, 50, "Massive wheelbase, heavy haulage", "CARGO", 0, 2, 1, 20.0, 1, "Scania Mining & Defence Manual", "/vehicles/scania_het.svg"),
    ("V-HSV-04", "HSV", "BEML Tatra T815 6x6", "BEML / Tatra", "6x6", 22.0, 600, 55, "High chassis clearance, heavy axle load", "CARGO", 0, 2, 1, 10.5, 1, "BEML Defence Products Catalog", "/vehicles/tatra_6x6.svg"),
    ("V-HSV-05", "HSV", "Ashok Leyland 8x8 Platform", "Ashok Leyland", "8x8", 31.0, 500, 55, "Missile carrier / radar carrier footprint", "SPECIALIST", 0, 2, 1, 16.0, 1, "Ashok Leyland Super Stallion 8x8 Datasheet", "/vehicles/al_8x8.svg"),
    ("V-HSV-06", "HSV", "Tata LPTA 3138 8x8", "Tata Motors", "8x8", 31.0, 600, 60, "Heavy high-mobility missile carrier", "CARGO", 0, 3, 1, 14.0, 1, "Tata Motors Defence 3138 Datasheet", "/vehicles/tata_3138.svg"),
    ("V-HSV-07", "HSV", "Ashok Leyland 6x6 POL Bowser", "Ashok Leyland", "6x6", 18.0, 550, 60, "6000L POL / Water tanker, flammable precautions", "CARGO", 0, 2, 1, 6.0, 1, "Indian Army Supply Corps Bowser Spec", "/vehicles/al_bowser.svg"),
    ("V-HSV-08", "HSV", "Field Ambulance Tata Winger 4x4", "Tata Motors", "4x4", 3.5, 600, 85, "Medical casualty transport, Geneva marking", "PASSENGER", 0, 7, 1, 0.0, 1, "Indian Army Medical Corps Specification", "/vehicles/tata_ambulance.svg"),
    ("V-HSV-09", "HSV", "Tata 6x6 Airbase Crash Tender", "Tata Motors", "6x6", 21.0, 450, 75, "Airbase foam monitors, broad envelope", "FLAGGED_FOR_REVIEW", 0, 4, 0, 8.0, 0, "Airfield Emergency Service Guidelines (Estimated)", "/vehicles/crash_tender.svg"),

    # Category D: Armoured Combat Vehicles (ACV)
    ("V-ACV-01", "ACV", "BMP-2 Sarath ICV", "Ordnance Factory Medak", "Tracked", 14.3, 500, 65, "Requires flatbed for long routes, amphibious", "SPECIALIST", 0, 10, 1, 0.0, 1, "AVNL / OFB BMP-2 Technical Manual", "/vehicles/bmp2_sarath.svg"),
    ("V-ACV-02", "ACV", "T-90S Bhishma MBT", "HVF Avadi", "Tracked", 46.5, 450, 60, "Extreme bridge stress; transport via HET", "SPECIALIST", 0, 3, 1, 0.0, 1, "Indian Army Armoured Corps Manual", "/vehicles/t90_bhishma.svg"),
    ("V-ACV-02B", "ACV", "T-72M1 Ajeya MBT", "HVF Avadi", "Tracked", 41.5, 480, 60, "Tracked MBT, bridge weight constraint", "SPECIALIST", 0, 3, 1, 0.0, 1, "Indian Army Armoured Corps Data", "/vehicles/t72_ajeya.svg"),
    ("V-ACV-03", "ACV", "Arjun MK1A MBT", "HVF Avadi / DRDO", "Tracked", 68.5, 450, 58, "Strictly forbidden on weak bridges; MLC 70", "SPECIALIST", 0, 4, 1, 0.0, 1, "DRDO CVRDE Arjun MK1A Technical Specs", "/vehicles/arjun_mk1a.svg"),
    ("V-ACV-04", "ACV", "WhAP 8x8 / Tata Kestrel", "Tata / DRDO", "8x8", 24.0, 500, 80, "Amphibious wheeled APC, STANAG 4569 Level 4", "DUAL", 0, 12, 1, 2.5, 0, "DRDO VRDE / TASL Technical Leaflet (Payload estimated)", "/vehicles/whap_kestrel.svg"),
    ("V-ACV-05", "ACV", "Mahindra Straton Plus APC", "Mahindra Defence", "4x4", 8.5, 500, 85, "Armoured personnel carrier, CEN B6/B7", "PASSENGER", 0, 8, 1, 0.5, 0, "Mahindra Defence Catalog (Payload estimated)", "/vehicles/mahindra_straton.svg"),
    ("V-ACV-06", "ACV", "Zorawar Light Tank", "DRDO / L&T", "Tracked", 25.0, 400, 65, "High-altitude mountain tank (prototype)", "FLAGGED_FOR_REVIEW", 0, 3, 0, 0.0, 0, "MoD Press Releases & Prototype Briefing (Estimated)", "/vehicles/zorawar.svg"),

    # Category E: Heavy Equipment Transporters (HET)
    ("V-HET-01", "HET", "BEML HET 200 Ton Multi-Axle", "BEML", "Multi-axle", 70.0, 500, 40, "Length > 20m, High turn radius, MBT hauler", "CARGO", 0, 2, 1, 70.0, 1, "BEML Heavy Equipment Transporter Manual", "/vehicles/beml_het.svg"),
    ("V-HET-02", "HET", "Ashok Leyland Super Stallion HET", "Ashok Leyland", "6x6", 45.0, 500, 50, "Heavy tractor-trailer hauler", "CARGO", 0, 2, 1, 35.0, 1, "Ashok Leyland Tactical Transport Datasheet", "/vehicles/al_het.svg"),
    ("V-HET-03", "HET", "Tata 8x8 Pontoon Bridgelayer", "Tata Motors / DRDO", "8x8", 32.0, 500, 50, "Pontoon bridge launch vehicle (Sarvatra)", "SPECIALIST", 0, 2, 1, 10.0, 1, "DRDO Sarvatra Bridging System Datasheet", "/vehicles/sarvatra_8x8.svg"),
    ("V-HET-04", "HET", "WZT-3 Armoured Recovery Vehicle", "BEML / Obrum", "Tracked", 42.0, 450, 55, "Tracked recovery crane & dozer blade", "SPECIALIST", 0, 4, 1, 0.0, 1, "BEML Defence Equipment Directory", "/vehicles/wzt3_arv.svg"),
]

DEMO_FLEET_UNITS = [
    ("UNIT-DEMO-01", "V-LTV-02", "DEMO-ALPHA-01 (Trial Unit)", "AVAILABLE", "24D-DEMO-001", "PLC-CN-55", 1, "Evaluation prototype for quick reaction trials"),
    ("UNIT-DEMO-02", "V-LTV-02", "DEMO-ALPHA-02 (Trial Unit)", "AVAILABLE", "24D-DEMO-002", "PLC-CN-55", 1, "Second evaluation unit for ALSV pair trials"),
    ("UNIT-DEMO-03", "V-MSV-01", "DEMO-STALLION-01 (Training Unit)", "AVAILABLE", "23D-DEMO-101", "PLC-MS-05", 1, "Logistical convoy driver training platform"),
    ("UNIT-DEMO-04", "V-LTV-01", "DEMO-VIP-LEAD (VIP Escort Demo)", "AVAILABLE", "25D-DEMO-901", "PLC-CN-55", 1, "Command convoy VIP lead escort vehicle"),
]

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(vehicle_master)")
    cols = [col[1] for col in cursor.fetchall()]

    new_cols = [
        ("role_category", "TEXT NOT NULL DEFAULT 'DUAL'"),
        ("is_vip", "INTEGER NOT NULL DEFAULT 0"),
        ("rated_passenger_capacity", "INTEGER DEFAULT NULL"),
        ("passenger_capacity_verified", "INTEGER NOT NULL DEFAULT 0"),
        ("rated_payload_tons", "REAL DEFAULT NULL"),
        ("payload_capacity_verified", "INTEGER NOT NULL DEFAULT 0"),
        ("capacity_source_note", "TEXT DEFAULT ''"),
        ("image_url", "TEXT DEFAULT ''"),
        ("is_active", "INTEGER NOT NULL DEFAULT 1"),
    ]

    for col_name, col_def in new_cols:
        if col_name not in cols:
            cursor.execute(f"ALTER TABLE vehicle_master ADD COLUMN {col_name} {col_def}")

    cursor.execute("""
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
    """)

    now = datetime.now(timezone.utc).isoformat()
    for m in MODELS:
        v_id, class_t, m_name, maker, axle, gvw, rng, spd, footprint, role_cat, is_vip, pass_cap, pass_ver, pld_cap, pld_ver, src, img = m
        cursor.execute("SELECT 1 FROM vehicle_master WHERE vehicle_id = ?", (v_id,))
        if cursor.fetchone():
            cursor.execute("""
                UPDATE vehicle_master SET
                    class_type = ?,
                    model_name = ?,
                    maker = ?,
                    axle_config = ?,
                    gvw_tons = ?,
                    operational_range_km = ?,
                    max_speed_kmh = ?,
                    routing_footprint = ?,
                    role_category = ?,
                    is_vip = ?,
                    rated_passenger_capacity = ?,
                    passenger_capacity_verified = ?,
                    rated_payload_tons = ?,
                    payload_capacity_verified = ?,
                    capacity_source_note = ?,
                    image_url = ?,
                    is_active = 1
                WHERE vehicle_id = ?
            """, (class_t, m_name, maker, axle, gvw, rng, spd, footprint, role_cat, is_vip, pass_cap, pass_ver, pld_cap, pld_ver, src, img, v_id))
        else:
            cursor.execute("""
                INSERT INTO vehicle_master (
                    vehicle_id, class_type, model_name, maker, axle_config,
                    gvw_tons, operational_range_km, max_speed_kmh, routing_footprint,
                    role_category, is_vip, rated_passenger_capacity, passenger_capacity_verified,
                    rated_payload_tons, payload_capacity_verified, capacity_source_note,
                    image_url, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (v_id, class_t, m_name, maker, axle, gvw, rng, spd, footprint, role_cat, is_vip, pass_cap, pass_ver, pld_cap, pld_ver, src, img))

    for u in DEMO_FLEET_UNITS:
        uid, mid, csign, stat, regno, base, is_demo, notes = u
        cursor.execute("""
            INSERT OR REPLACE INTO fleet_units (
                unit_id, model_id, callsign, status, registration_no, assigned_base, is_demo, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (uid, mid, csign, stat, regno, base, is_demo, notes, now, now))

    conn.commit()
    conn.close()
    print("Database migration completed successfully.")

if __name__ == "__main__":
    migrate()
