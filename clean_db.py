import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'iot_data.db')
if not os.path.exists(db_path):
    print("Database path not found! Check BASE_DIR or path.")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check foreign key setting
cur.execute("PRAGMA foreign_keys = ON;")

try:
    # Delete telemetry first due to foreign keys referencing devices
    cur.execute("DELETE FROM telemetry;")
    print("All rows from 'telemetry' table deleted.")

    # Delete device alerts / rule logs / etc if any tables exists
    # Let's clean other dependent tables if they contain foreign key constraints.
    # Let's inspect the sqlite master table to see what tables exist
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cur.fetchall()]
    print("Tables list in DB:", tables)

    for tbl in ['alert_logs', 'alert_rules', 'tickets', 'smtp_configs', 'devices']:
        if tbl in tables:
            cur.execute(f"DELETE FROM {tbl};")
            print(f"All rows from '{tbl}' table deleted.")

    conn.commit()
    print("Database devices and dependent entries cleared successfully!")
except Exception as e:
    conn.rollback()
    print("Error during database clear:", e)
finally:
    conn.close()
