"""Tests for battery-monitor database module"""
import pytest
import tempfile
import sqlite3
from pathlib import Path
from datetime import datetime
from freezegun import freeze_time
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from battmon.database import Database

@pytest.fixture
def temp_db():
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = Path(f.name)
    db = Database(db_path)
    yield db
    db.close()
    db_path.unlink(missing_ok=True)

class TestDatabaseInit:
    def test_creates_tables(self, temp_db):
        cursor = temp_db.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        assert 'battery_log' in tables
        assert 'battery_info' in tables
        assert 'events' in tables

    def test_enables_wal_mode(self, temp_db):
        cursor = temp_db.conn.execute("PRAGMA journal_mode")
        assert cursor.fetchone()[0] == 'wal'

class TestLogBatteryReading:
    def test_log_battery_reading(self, temp_db):
        temp_db.log_battery_reading(75.5, 'charging', voltage=12.6, power=15.0)
        cursor = temp_db.conn.execute("SELECT percentage, status, voltage, power FROM battery_log")
        row = cursor.fetchone()
        assert abs(row[0] - 75.5) < 0.01
        assert row[1] == 'charging'
        assert abs(row[2] - 12.6) < 0.01

class TestLogEvent:
    def test_log_event(self, temp_db):
        temp_db.log_event('low_battery', 'Battery critically low', percentage=5.0)
        cursor = temp_db.conn.execute("SELECT event_type, description, percentage FROM events")
        row = cursor.fetchone()
        assert row[0] == 'low_battery'
        assert row[1] == 'Battery critically low'
        assert abs(row[2] - 5.0) < 0.01

@freeze_time("2025-01-15 12:00:00")
class TestRotateLogs:
    def test_rotate_logs(self, temp_db):
        # Insert old and new entries
        with freeze_time("2024-10-01"):
            for _ in range(5):
                temp_db.log_battery_reading(50.0, 'discharging')
        with freeze_time("2025-01-14"):
            for _ in range(3):
                temp_db.log_battery_reading(60.0, 'charging')
        deleted = temp_db.rotate_logs(retention_days=90, vacuum=False)
        assert deleted == 5

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
