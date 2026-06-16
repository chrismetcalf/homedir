"""
Database management for battery-monitor

Handles SQLite database operations with parameterized queries and log rotation.
"""

import sqlite3
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class Database:
    """SQLite database manager for battery monitoring data"""

    def __init__(self, db_path: Path):
        """
        Initialize database connection

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Enable WAL mode for better concurrent access
        # Note: Not using check_same_thread=False as daemon is single-threaded
        # Note: Using default isolation_level for proper transaction support
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row  # Access columns by name

        # Enable foreign keys
        self.conn.execute("PRAGMA foreign_keys = ON")
        # Enable WAL mode
        self.conn.execute("PRAGMA journal_mode = WAL")
        # Enable incremental auto-vacuum
        self.conn.execute("PRAGMA auto_vacuum = INCREMENTAL")

        # Initialize schema
        self._init_schema()

    def _init_schema(self) -> None:
        """Initialize database schema if it doesn't exist"""
        logger.debug("Initializing database schema")

        # Create battery_log table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS battery_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                percentage REAL,
                status TEXT NOT NULL,
                voltage REAL,
                current REAL,
                power REAL,
                temperature REAL,
                time_remaining INTEGER,
                cycle_count INTEGER
            )
        """)

        # Create battery_info table (for static battery info)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS battery_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                battery_id TEXT UNIQUE NOT NULL,
                manufacturer TEXT,
                model TEXT,
                capacity REAL,
                last_updated TEXT NOT NULL
            )
        """)

        # Create events table (for significant events like full charge, low battery)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                description TEXT,
                percentage REAL
            )
        """)

        # Create indexes for query performance
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_battery_log_timestamp ON battery_log(timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_battery_log_status ON battery_log(status)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)")
        # Additional compound indexes for status/percentage queries over time
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_battery_log_status_timestamp ON battery_log(status, timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_battery_log_percentage_timestamp ON battery_log(percentage, timestamp)")

        logger.info("Database schema initialized")

    @contextmanager
    def transaction(self):
        """Context manager for database transactions"""
        try:
            yield self.conn
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def log_battery_reading(
        self,
        percentage: Optional[float],
        status: str,
        voltage: Optional[float] = None,
        current: Optional[float] = None,
        power: Optional[float] = None,
        temperature: Optional[float] = None,
        time_remaining: Optional[int] = None,
        cycle_count: Optional[int] = None
    ) -> None:
        """
        Log a battery reading (SECURE: uses parameterized query)

        Args:
            percentage: Battery percentage (0-100)
            status: Charging status
            voltage: Voltage in volts
            current: Current in amperes
            power: Power in watts
            temperature: Temperature in Celsius
            time_remaining: Time remaining in minutes
            cycle_count: Battery cycle count
        """
        timestamp = datetime.utcnow().isoformat()

        # SECURE: Parameterized query prevents SQL injection
        self.conn.execute(
            """
            INSERT INTO battery_log
            (timestamp, percentage, status, voltage, current, power, temperature, time_remaining, cycle_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (timestamp, percentage, status, voltage, current, power, temperature, time_remaining, cycle_count)
        )
        self.conn.commit()

        logger.debug(
            f"Logged battery reading: {percentage}%, status={status}, "
            f"voltage={voltage}V, power={power}W"
        )

    def upsert_battery_info(
        self,
        battery_id: str,
        manufacturer: Optional[str] = None,
        model: Optional[str] = None,
        capacity: Optional[float] = None
    ) -> None:
        """
        Insert or update battery information

        Args:
            battery_id: Battery identifier
            manufacturer: Battery manufacturer
            model: Battery model
            capacity: Battery capacity in Wh
        """
        now = datetime.utcnow().isoformat()

        # Check if record exists
        cursor = self.conn.execute(
            "SELECT id FROM battery_info WHERE battery_id = ?",
            (battery_id,)
        )
        row = cursor.fetchone()

        if row:
            # Update existing record
            self.conn.execute(
                """
                UPDATE battery_info
                SET manufacturer = ?, model = ?, capacity = ?, last_updated = ?
                WHERE battery_id = ?
                """,
                (manufacturer, model, capacity, now, battery_id)
            )
            logger.debug(f"Updated battery info for {battery_id}")
        else:
            # Insert new record
            self.conn.execute(
                """
                INSERT INTO battery_info (battery_id, manufacturer, model, capacity, last_updated)
                VALUES (?, ?, ?, ?, ?)
                """,
                (battery_id, manufacturer, model, capacity, now)
            )
            logger.info(f"Created battery info record for {battery_id}")
        self.conn.commit()

    def log_event(self, event_type: str, description: str, percentage: Optional[float] = None) -> None:
        """
        Log a battery event

        Args:
            event_type: Type of event (low_battery, critical_battery, full_charge, etc.)
            description: Event description
            percentage: Battery percentage at event time
        """
        timestamp = datetime.utcnow().isoformat()

        self.conn.execute(
            """
            INSERT INTO events (timestamp, event_type, description, percentage)
            VALUES (?, ?, ?, ?)
            """,
            (timestamp, event_type, description, percentage)
        )
        self.conn.commit()

        logger.info(f"Event logged: {event_type} - {description}")

    def get_recent_readings(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get recent battery readings

        Args:
            limit: Maximum number of entries to return

        Returns:
            List of battery readings as dictionaries
        """
        cursor = self.conn.execute(
            """
            SELECT * FROM battery_log
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,)
        )

        return [dict(row) for row in cursor.fetchall()]

    def get_stats(self, window_hours: int = 24) -> Dict[str, Any]:
        """
        Get battery statistics for a time window

        Args:
            window_hours: Time window in hours

        Returns:
            Dictionary with statistics
        """
        cutoff = (datetime.utcnow() - timedelta(hours=window_hours)).isoformat()

        # Average percentage
        cursor = self.conn.execute(
            """
            SELECT
                AVG(percentage) as avg_percentage,
                MIN(percentage) as min_percentage,
                MAX(percentage) as max_percentage,
                AVG(power) as avg_power,
                AVG(temperature) as avg_temperature,
                COUNT(*) as total_readings
            FROM battery_log
            WHERE timestamp >= ?
            """,
            (cutoff,)
        )

        row = cursor.fetchone()

        # Count charge/discharge cycles
        cursor = self.conn.execute(
            """
            SELECT status, COUNT(*) as count
            FROM battery_log
            WHERE timestamp >= ?
            GROUP BY status
            """,
            (cutoff,)
        )

        status_counts = {row[0]: row[1] for row in cursor.fetchall()}

        return {
            "avg_percentage": row[0] or 0.0,
            "min_percentage": row[1] or 0.0,
            "max_percentage": row[2] or 0.0,
            "avg_power": row[3] or 0.0,
            "avg_temperature": row[4] or 0.0,
            "total_readings": row[5] or 0,
            "status_counts": status_counts
        }

    def get_charge_cycles(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Get charge/discharge cycles

        Args:
            days: Number of days to analyze

        Returns:
            List of charge cycles
        """
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Detect cycles by finding transitions from Charging to Discharging
        cursor = self.conn.execute(
            """
            SELECT
                timestamp,
                percentage,
                status,
                LAG(status) OVER (ORDER BY timestamp) as prev_status
            FROM battery_log
            WHERE timestamp >= ?
            ORDER BY timestamp
            """,
            (cutoff,)
        )

        cycles = []
        current_cycle = None

        for row in cursor.fetchall():
            timestamp = row[0]
            percentage = row[1]
            status = row[2]
            prev_status = row[3]

            # Detect start of charging
            if prev_status != 'Charging' and status == 'Charging':
                if current_cycle:
                    current_cycle['end_time'] = timestamp
                    cycles.append(current_cycle)
                current_cycle = {
                    'start_time': timestamp,
                    'start_percentage': percentage,
                    'type': 'charge'
                }

            # Detect start of discharging
            elif prev_status != 'Discharging' and status == 'Discharging':
                if current_cycle:
                    current_cycle['end_time'] = timestamp
                    current_cycle['end_percentage'] = percentage
                    cycles.append(current_cycle)
                current_cycle = {
                    'start_time': timestamp,
                    'start_percentage': percentage,
                    'type': 'discharge'
                }

        # Append the last cycle if one exists (ongoing cycle)
        if current_cycle:
            cycles.append(current_cycle)

        return cycles

    def get_events(self, limit: int = 50, event_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get recent events

        Args:
            limit: Maximum number of events to return
            event_type: Optional filter by event type

        Returns:
            List of events
        """
        if event_type:
            cursor = self.conn.execute(
                """
                SELECT * FROM events
                WHERE event_type = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (event_type, limit)
            )
        else:
            cursor = self.conn.execute(
                """
                SELECT * FROM events
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (limit,)
            )

        return [dict(row) for row in cursor.fetchall()]

    def rotate_logs(self, retention_days: int, vacuum: bool = True) -> int:
        """
        Delete old log entries and optionally vacuum database

        Args:
            retention_days: Number of days to retain
            vacuum: Whether to vacuum database after deletion

        Returns:
            Number of records deleted
        """
        cutoff = (datetime.utcnow() - timedelta(days=retention_days)).isoformat()

        logger.info(f"Rotating logs: deleting entries older than {retention_days} days ({cutoff})")

        with self.transaction():
            cursor = self.conn.execute(
                "DELETE FROM battery_log WHERE timestamp < ?",
                (cutoff,)
            )
            deleted = cursor.rowcount

        logger.info(f"Deleted {deleted} old log entries")

        if vacuum and deleted > 0:
            logger.info("Vacuuming database to reclaim space")
            self.conn.execute("VACUUM")
            logger.info("Vacuum complete")

        return deleted

    def get_count(self) -> int:
        """Get total number of log entries"""
        cursor = self.conn.execute("SELECT COUNT(*) FROM battery_log")
        return cursor.fetchone()[0]

    def close(self) -> None:
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.debug("Database connection closed")

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
