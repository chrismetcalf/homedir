"""
Database management for ping-monitor

Handles SQLite database operations with proper schema, parameterized queries,
and log rotation.
"""

import sqlite3
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any

logger = logging.getLogger(__name__)


class Database:
    """SQLite database manager for ping monitoring data"""

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

    def _check_legacy_schema(self) -> bool:
        """Check if database has legacy v1.x schema"""
        try:
            cursor = self.conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='log'")
            if cursor.fetchone():
                # Table exists, check if it has target_id column
                cursor = self.conn.execute("PRAGMA table_info(log)")
                columns = [row[1] for row in cursor.fetchall()]
                return 'target_id' not in columns
            return False
        except Exception:
            return False

    def _init_schema(self) -> None:
        """Initialize database schema if it doesn't exist"""
        logger.debug("Initializing database schema")

        # Check if we have a legacy database
        if self._check_legacy_schema():
            logger.warning("Detected legacy v1.x database schema")
            logger.warning("Renaming old 'log' table to 'log_v1' to preserve existing data")
            logger.warning("Run 'ping-monitor-migrate' to migrate your data to the new schema")

            # Rename old table to preserve data
            self.conn.execute("ALTER TABLE log RENAME TO log_v1")
            logger.info("Legacy data preserved in 'log_v1' table")

        # Create targets table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS targets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                host TEXT NOT NULL,
                description TEXT,
                enabled BOOLEAN DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)

        # Create locations table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_ip TEXT NOT NULL,
                isp TEXT,
                city TEXT,
                region TEXT,
                country TEXT,
                latitude REAL,
                longitude REAL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                UNIQUE(public_ip)
            )
        """)

        # Create log table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                location_id INTEGER,
                status TEXT NOT NULL CHECK(status IN ('ONLINE', 'OFFLINE', 'TIMEOUT', 'HTTP_ERROR')),
                ping_ms REAL,
                http_status_code INTEGER,
                FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
                FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
            )
        """)

        # Create indexes for query performance
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log(timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_log_target_timestamp ON log(target_id, timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_log_location ON log(location_id)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_locations_ip ON locations(public_ip)")
        # Additional indexes for status queries and ping time aggregations
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_log_status_timestamp ON log(status, timestamp)")
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_log_ping_ms ON log(ping_ms) WHERE ping_ms IS NOT NULL")

        # Migrate existing databases to support HTTP monitoring
        cursor = self.conn.execute("PRAGMA table_info(log)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'http_status_code' not in columns:
            logger.info("Migrating database to support HTTP monitoring...")
            # Add http_status_code column
            self.conn.execute("ALTER TABLE log ADD COLUMN http_status_code INTEGER")
            logger.info("Added http_status_code column to log table")

        # Create backward compatibility view
        self.conn.execute("""
            CREATE VIEW IF NOT EXISTS legacy_log AS
            SELECT timestamp, status, ping_ms
            FROM log
            WHERE target_id = (SELECT id FROM targets WHERE name = 'default' LIMIT 1)
            ORDER BY timestamp
        """)

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

    def insert_target(self, name: str, host: str, description: str = "", enabled: bool = True) -> int:
        """
        Insert a new ping target (or get existing)

        Args:
            name: Unique target name
            host: Host to ping (IP or hostname)
            description: Optional description
            enabled: Whether target is enabled

        Returns:
            Target ID
        """
        now = datetime.utcnow().isoformat()

        try:
            cursor = self.conn.execute(
                """
                INSERT INTO targets (name, host, description, enabled, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (name, host, description, enabled, now)
            )
            target_id = cursor.lastrowid
            logger.info(f"Created target: {name} ({host}) with ID {target_id}")
            return target_id
        except sqlite3.IntegrityError:
            # Target already exists, return its ID
            cursor = self.conn.execute(
                "SELECT id FROM targets WHERE name = ?",
                (name,)
            )
            row = cursor.fetchone()
            return row[0]

    def get_target_id(self, name: str) -> Optional[int]:
        """
        Get target ID by name

        Args:
            name: Target name

        Returns:
            Target ID or None if not found
        """
        cursor = self.conn.execute(
            "SELECT id FROM targets WHERE name = ?",
            (name,)
        )
        row = cursor.fetchone()
        return row[0] if row else None

    def upsert_location(self, public_ip: str, isp: Optional[str] = None,
                       city: Optional[str] = None, region: Optional[str] = None,
                       country: Optional[str] = None, latitude: Optional[float] = None,
                       longitude: Optional[float] = None) -> int:
        """
        Insert or update location data

        Args:
            public_ip: Public IP address
            isp: ISP name
            city: City name
            region: Region/state name
            country: Country name
            latitude: Latitude coordinate
            longitude: Longitude coordinate

        Returns:
            Location ID
        """
        now = datetime.utcnow().isoformat()

        # Try to get existing location
        cursor = self.conn.execute(
            "SELECT id FROM locations WHERE public_ip = ?",
            (public_ip,)
        )
        row = cursor.fetchone()

        if row:
            # Update existing location
            location_id = row[0]
            self.conn.execute(
                """
                UPDATE locations
                SET isp = ?, city = ?, region = ?, country = ?,
                    latitude = ?, longitude = ?, last_seen = ?
                WHERE id = ?
                """,
                (isp, city, region, country, latitude, longitude, now, location_id)
            )
            logger.debug(f"Updated location {location_id} for IP {public_ip}")
        else:
            # Insert new location
            cursor = self.conn.execute(
                """
                INSERT INTO locations (public_ip, isp, city, region, country,
                                      latitude, longitude, first_seen, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (public_ip, isp, city, region, country, latitude, longitude, now, now)
            )
            location_id = cursor.lastrowid
            logger.info(f"Created location {location_id} for IP {public_ip} (ISP: {isp})")

        return location_id

    def log_ping(self, target_id: int, status: str, ping_ms: Optional[float] = None,
                 location_id: Optional[int] = None, http_status_code: Optional[int] = None) -> None:
        """
        Log a ping or HTTP check result (SECURE: uses parameterized query)

        Args:
            target_id: Target ID
            status: One of 'ONLINE', 'OFFLINE', 'TIMEOUT', 'HTTP_ERROR'
            ping_ms: Ping latency or HTTP response time in milliseconds (None if offline)
            location_id: Optional location ID
            http_status_code: HTTP status code (for HTTP targets only)
        """
        timestamp = datetime.utcnow().isoformat()

        # SECURE: Parameterized query prevents SQL injection
        self.conn.execute(
            """
            INSERT INTO log (timestamp, target_id, location_id, status, ping_ms, http_status_code)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (timestamp, target_id, location_id, status, ping_ms, http_status_code)
        )
        self.conn.commit()  # Commit the transaction

        if http_status_code:
            logger.debug(f"Logged HTTP check: target={target_id}, status={status}, latency={ping_ms}ms, http_code={http_status_code}")
        else:
            logger.debug(f"Logged ping: target={target_id}, status={status}, latency={ping_ms}ms")

    def get_recent_logs(self, limit: int = 100, target_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get recent log entries

        Args:
            limit: Maximum number of entries to return
            target_id: Optional filter by target ID

        Returns:
            List of log entries as dictionaries
        """
        if target_id:
            cursor = self.conn.execute(
                """
                SELECT l.*, t.name as target_name, t.host
                FROM log l
                JOIN targets t ON l.target_id = t.id
                WHERE l.target_id = ?
                ORDER BY l.timestamp DESC
                LIMIT ?
                """,
                (target_id, limit)
            )
        else:
            cursor = self.conn.execute(
                """
                SELECT l.*, t.name as target_name, t.host
                FROM log l
                JOIN targets t ON l.target_id = t.id
                ORDER BY l.timestamp DESC
                LIMIT ?
                """,
                (limit,)
            )

        return [dict(row) for row in cursor.fetchall()]

    def get_stats(self, target_id: int, window_minutes: int) -> Dict[str, Any]:
        """
        Get uptime statistics for a time window

        Args:
            target_id: Target ID
            window_minutes: Time window in minutes

        Returns:
            Dictionary with statistics (total, offline, percentage)
        """
        cutoff = (datetime.utcnow() - timedelta(minutes=window_minutes)).isoformat()

        cursor = self.conn.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status != 'ONLINE' THEN 1 ELSE 0 END) as offline
            FROM log
            WHERE target_id = ? AND timestamp >= ?
            """,
            (target_id, cutoff)
        )

        row = cursor.fetchone()
        total = row[0]
        offline = row[1] or 0

        return {
            "total": total,
            "offline": offline,
            "uptime_pct": 100.0 - (offline / total * 100.0) if total > 0 else 100.0
        }

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
                "DELETE FROM log WHERE timestamp < ?",
                (cutoff,)
            )
            deleted = cursor.rowcount

        logger.info(f"Deleted {deleted} old log entries")

        if vacuum and deleted > 0:
            logger.info("Vacuuming database to reclaim space")
            self.conn.execute("VACUUM")
            logger.info("Vacuum complete")

        return deleted

    def get_all_locations(self) -> List[Dict[str, Any]]:
        """
        Get all location data

        Returns:
            List of locations with statistics
        """
        cursor = self.conn.execute(
            """
            SELECT
                l.*,
                COUNT(log.id) as ping_count,
                MIN(log.timestamp) as first_ping,
                MAX(log.timestamp) as last_ping
            FROM locations l
            LEFT JOIN log ON l.id = log.location_id
            GROUP BY l.id
            ORDER BY l.last_seen DESC
            """)

        return [dict(row) for row in cursor.fetchall()]

    def get_count(self) -> int:
        """Get total number of log entries"""
        cursor = self.conn.execute("SELECT COUNT(*) FROM log")
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
