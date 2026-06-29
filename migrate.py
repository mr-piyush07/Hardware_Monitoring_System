import os
import sys
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///iot_data.db")
engine = create_engine(DATABASE_URL)

def run_sql(sql):
    with engine.connect() as conn:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"Executed: {sql}")
        except Exception as e:
            print(f"Failed: {sql} - {e}")

if __name__ == "__main__":
    run_sql("ALTER TABLE devices ADD COLUMN last_seen TIMESTAMP;")
    run_sql("ALTER TABLE alert_rules ADD COLUMN last_triggered TIMESTAMP;")
    run_sql("ALTER TABLE alert_rules ADD COLUMN cooldown_seconds INTEGER DEFAULT 300;")
    run_sql("""
        CREATE TABLE IF NOT EXISTS notification_templates (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name VARCHAR NOT NULL,
            subject VARCHAR NOT NULL,
            body TEXT NOT NULL
        );
    """)
    run_sql("ALTER TABLE alert_rules ALTER COLUMN sensor_key DROP NOT NULL;")
    run_sql("ALTER TABLE alert_rules ALTER COLUMN operator DROP NOT NULL;")
