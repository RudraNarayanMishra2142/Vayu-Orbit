import sqlite3
import os

def calculate_constraints(node_id):
    """Applies your exact operational routing constraints based on Node Prefix."""
    if node_id.startswith("CN-"): return {"type": "Cantonment", "delay": 1.6, "max_axle": 35.0, "clearance": 30}
    elif node_id.startswith("MS-"): return {"type": "Military Station", "delay": 1.0, "max_axle": 70.0, "clearance": 0}
    elif node_id.startswith("AF-"): return {"type": "Air Force Station", "delay": 1.1, "max_axle": 50.0, "clearance": 45}
    elif node_id.startswith("NV-"): return {"type": "Naval Base", "delay": 1.2, "max_axle": 50.0, "clearance": 60}
    elif node_id.startswith("FO-"): return {"type": "Forward Outpost", "delay": 2.5, "max_axle": 15.0, "clearance": 15}
    return {"type": "Unknown", "delay": 1.0, "max_axle": 25.0, "clearance": 20}

def provision_node_database():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BASE_DIR, "military_logistics.db")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('PRAGMA journal_mode=WAL;')
    cursor.execute('PRAGMA busy_timeout=5000;')
    cursor.execute('PRAGMA synchronous=NORMAL;')

    print("📡 Initializing Pan-India Military Node Schema...")
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS military_nodes (
        node_id TEXT PRIMARY KEY,
        installation_name TEXT NOT NULL,
        node_type TEXT NOT NULL,
        state TEXT NOT NULL,
        command_jurisdiction TEXT NOT NULL,
        primary_highway TEXT,
        lat REAL,
        lon REAL,
        delay_multiplier REAL,
        max_axle_load_tons REAL,
        clearance_time_mins INTEGER
    )
    ''')

    # THE COMPLETE MASTER DATASET WITH GPS COORDINATES
    raw_data = [
        # --- CANTONMENTS (Mixed Civilian) ---
        ("CN-01", "Agra Cantt", "Uttar Pradesh", "Central Command", "NH-19", 27.1598, 77.9935),
        ("CN-02", "Ayodhya Cantt", "Uttar Pradesh", "Central Command", "NH-27", 26.7865, 82.1643),
        ("CN-03", "Bareilly Cantt", "Uttar Pradesh", "Central Command", "NH-30", 28.3411, 79.4312),
        ("CN-04", "Fatehgarh Cantt", "Uttar Pradesh", "Central Command", "NH-34", 27.3712, 79.6253),
        ("CN-05", "Kanpur Cantt", "Uttar Pradesh", "Central Command", "NH-19", 26.4382, 80.3703),
        ("CN-06", "Lucknow Cantt", "Uttar Pradesh", "Central Command", "NH-27", 26.8152, 80.9592),
        ("CN-07", "Mathura Cantt", "Uttar Pradesh", "Central Command", "NH-19", 27.4716, 77.6853),
        ("CN-08", "Meerut Cantt", "Uttar Pradesh", "Central Command", "NH-34", 29.0274, 77.7028),
        ("CN-09", "Prayagraj Cantt", "Uttar Pradesh", "Central Command", "NH-19", 25.4497, 81.8213),
        ("CN-10", "Shahjahanpur Cantt", "Uttar Pradesh", "Central Command", "NH-30", 27.8768, 79.9099),
        ("CN-11", "Varanasi Cantt", "Uttar Pradesh", "Central Command", "NH-19", 25.3341, 82.9774),
        ("CN-12", "Almora Cantt", "Uttarakhand", "Central Command", "NH-109", 29.5971, 79.6591),
        ("CN-13", "Chakrata Cantt", "Uttarakhand", "Central Command", "NH-507", 30.7016, 77.8696),
        ("CN-14", "Clement Town Cantt", "Uttarakhand", "Central Command", "NH-72A", 30.2678, 77.9946),
        ("CN-15", "Dehradun Cantt", "Uttarakhand", "Central Command", "NH-7", 30.3440, 77.9981),
        ("CN-16", "Landour Cantt", "Uttarakhand", "Central Command", "NH-707A", 30.4632, 78.0934),
        ("CN-17", "Lansdowne Cantt", "Uttarakhand", "Central Command", "NH-119", 29.8377, 78.6871),
        ("CN-18", "Nainital Cantt", "Uttarakhand", "Central Command", "NH-109", 29.3803, 79.4636),
        ("CN-19", "Ranikhet Cantt", "Uttarakhand", "Central Command", "NH-109", 29.6434, 79.4322),
        ("CN-20", "Roorkee Cantt", "Uttarakhand", "Central Command", "NH-334", 29.8543, 77.8880),
        ("CN-21", "Jabalpur Cantt", "Madhya Pradesh", "Central Command", "NH-30", 23.1610, 79.9576),
        ("CN-22", "Mhow Cantt", "Madhya Pradesh", "Central Command", "NH-52", 22.5510, 75.7601),
        ("CN-23", "Pachmarhi Cantt", "Madhya Pradesh", "Central Command", "NH-45", 22.4674, 78.4346),
        ("CN-24", "Danapur Cantt", "Bihar", "Central Command", "NH-922", 25.6263, 85.0401),
        ("CN-25", "Ramgarh Cantt", "Jharkhand", "Central Command", "NH-33", 23.6306, 85.5222),
        ("CN-26", "Ahmedabad Cantt", "Gujarat", "Southern Command", "NH-48", 23.0645, 72.6108),
        ("CN-27", "Ahilyanagar Cantt", "Maharashtra", "Southern Command", "NH-61", 19.1121, 74.7431),
        ("CN-28", "Chh. Sambhajinagar Cantt", "Maharashtra", "Southern Command", "NH-52", 19.8974, 75.3117),
        ("CN-29", "Dehu Road Cantt", "Maharashtra", "Southern Command", "NH-48", 18.7201, 73.7432),
        ("CN-30", "Deolali Cantt", "Maharashtra", "Southern Command", "NH-60", 19.9248, 73.8329),
        ("CN-31", "Kamptee Cantt", "Maharashtra", "Southern Command", "NH-44", 21.2294, 79.1979),
        ("CN-32", "Khadki Cantt", "Maharashtra", "Southern Command", "NH-48", 18.5602, 73.8325),
        ("CN-33", "Pune Cantt", "Maharashtra", "Southern Command", "NH-65", 18.5034, 73.8821),
        ("CN-34", "Ajmer Cantt", "Rajasthan", "Southern Command", "NH-48", 26.4316, 74.6543),
        ("CN-35", "Nasirabad Cantt", "Rajasthan", "Southern Command", "NH-48", 26.3005, 74.7337),
        ("CN-36", "Babina Cantt", "Uttar Pradesh", "Southern Command", "NH-44", 25.2443, 78.4716),
        ("CN-37", "Jhansi Cantt", "Uttar Pradesh", "Southern Command", "NH-27", 25.4326, 78.5833),
        ("CN-38", "Belagavi Cantt", "Karnataka", "Southern Command", "NH-48", 15.8647, 74.5204),
        ("CN-39", "Kannur Cantt", "Kerala", "Southern Command", "NH-66", 11.8705, 75.3670),
        ("CN-40", "Morar Cantt", "Madhya Pradesh", "Southern Command", "NH-44", 26.2307, 78.2255),
        ("CN-41", "Saugor Cantt", "Madhya Pradesh", "Southern Command", "NH-44", 23.8388, 78.7378),
        ("CN-42", "Secunderabad Cantt", "Telangana", "Southern Command", "NH-44", 17.4725, 78.5137),
        ("CN-43", "St. Thomas Mount", "Tamil Nadu", "Southern Command", "NH-48", 12.9995, 80.1983),
        ("CN-44", "Wellington Cantt", "Tamil Nadu", "Southern Command", "NH-181", 11.3686, 76.7865),
        ("CN-45", "Ambala Cantt", "Haryana", "Western Command", "NH-44", 30.3429, 76.8281),
        ("CN-46", "Amritsar Cantt", "Punjab", "Western Command", "NH-3", 31.6166, 74.8497),
        ("CN-47", "Ferozepur Cantt", "Punjab", "Western Command", "NH-5", 30.9080, 74.6067),
        ("CN-48", "Jalandhar Cantt", "Punjab", "Western Command", "NH-44", 31.3002, 75.6171),
        ("CN-49", "Bakloh Cantt", "Himachal Pradesh", "Western Command", "NH-154A", 32.4831, 75.9265),
        ("CN-50", "Dagshai Cantt", "Himachal Pradesh", "Western Command", "NH-5", 30.8841, 77.0504),
        ("CN-51", "Dalhousie Cantt", "Himachal Pradesh", "Western Command", "NH-154A", 32.5369, 75.9818),
        ("CN-52", "Jutogh Cantt", "Himachal Pradesh", "Western Command", "NH-5", 31.1005, 77.1352),
        ("CN-53", "Kasauli Cantt", "Himachal Pradesh", "Western Command", "NH-5", 30.8988, 76.9620),
        ("CN-54", "Subathu Cantt", "Himachal Pradesh", "Western Command", "NH-5", 30.9789, 76.9934),
        ("CN-55", "Delhi Cantt", "Delhi UT", "Western Command", "NH-48", 28.5961, 77.1232),
        ("CN-56", "Jammu Cantt", "Jammu & Kashmir", "Western Command", "NH-44", 32.6953, 74.8415),
        ("CN-57", "Barrackpore Cantt", "West Bengal", "Eastern Command", "NH-12", 22.7725, 88.3614),
        ("CN-58", "Jalapahar Cantt", "West Bengal", "Eastern Command", "NH-110", 27.0253, 88.2618),
        ("CN-59", "Lebong Cantt", "West Bengal", "Eastern Command", "NH-110", 27.0654, 88.2730),
        ("CN-60", "Shillong Cantt", "Meghalaya", "Eastern Command", "NH-6", 25.5683, 91.8797),
        ("CN-61", "Badamibagh Cantt", "Jammu & Kashmir", "Northern Command", "NH-44", 34.0620, 74.8329),

        # --- MILITARY STATIONS (Restricted Core Nodes) ---
        ("MS-01", "Bathinda MS", "Punjab", "South Western Command", "NH-54", 30.2246, 74.9213),
        ("MS-02", "Patiala MS", "Punjab", "Western Command", "NH-64", 30.3398, 76.3869),
        ("MS-03", "Mamun MS", "Punjab", "Western Command", "NH-44", 32.2733, 75.6521),
        ("MS-04", "Hisar MS", "Haryana", "Western Command", "NH-9", 29.1385, 75.7667),
        ("MS-05", "Jaipur MS", "Rajasthan", "South Western Command", "NH-48", 26.9381, 75.7538),
        ("MS-06", "Jodhpur MS", "Rajasthan", "Southern Command", "NH-25", 26.2625, 73.0456),
        ("MS-07", "Bikaner MS", "Rajasthan", "South Western Command", "NH-11", 28.0229, 73.3119),
        ("MS-08", "Jaisalmer MS", "Rajasthan", "Southern Command", "NH-11", 26.9113, 70.9234),
        ("MS-09", "Gandhinagar MS", "Gujarat", "Southern Command", "NH-147", 23.2307, 72.6713),
        ("MS-10", "Bhuj MS", "Gujarat", "Southern Command", "NH-341", 23.2505, 69.6644),
        ("MS-11", "Dipatoli MS", "Jharkhand", "Central Command", "NH-33", 23.3857, 85.3524),
        ("MS-12", "Tezpur MS", "Assam", "Eastern Command", "NH-15", 26.6528, 92.7926),
        ("MS-13", "Guwahati MS", "Assam", "Eastern Command", "NH-27", 26.1158, 91.7086),
        ("MS-14", "Silchar MS", "Assam", "Eastern Command", "NH-37", 24.8143, 92.8398),
        ("MS-15", "Dimapur MS", "Nagaland", "Eastern Command", "NH-29", 25.8653, 93.7431),
        ("MS-16", "Sukna MS", "West Bengal", "Eastern Command", "NH-10", 26.7937, 88.3582),
        ("MS-17", "Panagarh MS", "West Bengal", "Eastern Command", "NH-19", 23.4687, 87.4243),
        ("MS-18", "Binnaguri MS", "West Bengal", "Eastern Command", "NH-317", 26.7571, 89.0436),
        ("MS-19", "Gangtok MS", "Sikkim", "Eastern Command", "NH-10", 27.3314, 88.6138),
        ("MS-20", "Gopalpur MS", "Odisha", "Central Command", "NH-516", 19.2612, 84.9080),
        ("MS-21", "Udhampur MS", "Jammu & Kashmir", "Northern Command", "NH-44", 32.9265, 75.1417),
        ("MS-22", "Nagrota MS", "Jammu & Kashmir", "Northern Command", "NH-44", 32.7937, 74.9123),
        ("MS-23", "Leh MS", "Ladakh UT", "Northern Command", "NH-1D", 34.1526, 77.5771),

        # --- AIR FORCE STATIONS (Air Induction) ---
        ("AF-01", "Hindon AFS", "Uttar Pradesh", "WAC", "Heavy Lift Node", 28.7061, 77.3592),
        ("AF-02", "Ambala AFS", "Haryana", "WAC", "Fighter Node", 30.3695, 76.8174),
        ("AF-03", "Halwara AFS", "Punjab", "WAC", "Border Strike", 30.7486, 75.6321),
        ("AF-04", "Adampur AFS", "Punjab", "WAC", "Interceptor Axis", 31.4338, 75.7601),
        ("AF-05", "Srinagar AFS", "Jammu & Kashmir", "WAC", "Mountain Air Support", 33.9986, 74.7743),
        ("AF-06", "Awantipur AFS", "Jammu & Kashmir", "WAC", "Tactical Interceptor", 33.9189, 74.9754),
        ("AF-07", "Leh AFS", "Ladakh UT", "WAC", "High-Altitude Air Induction", 34.1378, 77.5463),
        ("AF-08", "Thoise AFS", "Ladakh UT", "WAC", "Glacier Logistics", 34.6974, 77.3483),
        ("AF-09", "Jodhpur AFS", "Rajasthan", "SWAC", "Desert Hub", 26.2625, 73.0456),
        ("AF-10", "Uttarlai AFS", "Rajasthan", "SWAC", "Border Base", 25.8115, 71.4820),
        ("AF-11", "Bhuj AFS", "Gujarat", "SWAC", "Surveillance Base", 23.2878, 69.6701),
        ("AF-12", "Gwalior AFS", "Madhya Pradesh", "CAC", "Weapon Delivery Hub", 26.2936, 78.2257),
        ("AF-13", "Agra AFS", "Uttar Pradesh", "CAC", "AWACS Hub", 27.1558, 77.9609),
        ("AF-14", "Bareilly AFS", "Uttar Pradesh", "CAC", "Su-30MKI Base", 28.4216, 79.4497),
        ("AF-15", "Hasimara AFS", "West Bengal", "EAC", "Air Defense Node", 26.7571, 89.3456),
        ("AF-16", "Tezpur AFS", "Assam", "EAC", "Strike Superiority Hub", 26.7118, 92.7844),
        ("AF-17", "Chabua AFS", "Assam", "EAC", "Frontier Cover Base", 27.4811, 95.1764),
        ("AF-18", "Sulur AFS", "Tamil Nadu", "SAC", "Fleet Deployment Center", 11.0142, 77.1614),

        # --- NAVAL BASES (Amphibious/Marine) ---
        ("NV-01", "INS Angre", "Maharashtra", "WNC", "Fleet Flagship Port", 18.9284, 72.8347),
        ("NV-02", "INS Kadamba", "Karnataka", "WNC", "Aircraft Carrier Anchorage", 14.8016, 74.1306),
        ("NV-03", "INS Hansa", "Goa", "WNC", "Naval Air Strike Fleet", 15.3789, 73.8322),
        ("NV-04", "INS Circars", "Andhra Pradesh", "ENC", "Eastern Fleet Base", 17.7212, 83.2751),
        ("NV-05", "INS Varsha", "Andhra Pradesh", "ENC", "Submarine Pen Node", 17.3871, 82.9739),
        ("NV-06", "INS Rajali", "Tamil Nadu", "ENC", "Recon Node", 12.9234, 79.6789),
        ("NV-07", "INS Venduruthy", "Kerala", "SNC", "Technical Training Base", 9.9443, 76.2625),
        ("NV-08", "INS Baaz", "Andaman & Nicobar", "JSC", "Malacca Chokepoint Gate", 6.7456, 93.8443),

        # --- FORWARD OUTPOSTS (Tactical Edges) ---
        ("FO-01", "Daulat Beg Oldi", "Ladakh UT", "Northern Command", "DS-DBO", 35.3934, 77.9304),
        ("FO-02", "Nyoma ALG", "Ladakh UT", "Northern Command", "Indus Valley", 33.2046, 78.6471),
        ("FO-03", "Fukche ALG", "Ladakh UT", "Northern Command", "Demchok Axis", 32.9351, 79.2062),
        ("FO-04", "Vijayanagar ALG", "Arunachal Pradesh", "Eastern Command", "Changlang Trail", 27.1852, 96.9934),
        ("FO-05", "Mechuka ALG", "Arunachal Pradesh", "Eastern Command", "West Siang Axis", 28.5997, 94.1378),
        ("FO-06", "Tuting ALG", "Arunachal Pradesh", "Eastern Command", "Upper Siang Axis", 28.9892, 94.9084)
    ]

    formatted_data = []
    for row in raw_data:
        node_id, name, state, command, highway, lat, lon = row
        c = calculate_constraints(node_id)
        formatted_data.append((node_id, name, c['type'], state, command, highway, lat, lon, c['delay'], c['max_axle'], c['clearance']))

    cursor.executemany('''
    INSERT OR REPLACE INTO military_nodes 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', formatted_data)

    conn.commit()
    conn.close()
    print("✅ All 116 Pan-India Nodes (Cantonments, MS, AFS, INS, FO) Ingested Successfully!")

if __name__ == "__main__":
    provision_node_database()