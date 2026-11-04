import sqlite3
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migrate_fleet_schema import migrate

def provision_vehicle_database():
    migrate()
    print("✅ Vehicle Master Database Provisioned Successfully with Full Catalog and Fleet Schema.")

if __name__ == "__main__":
    provision_vehicle_database()
