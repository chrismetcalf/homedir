"""
Notification history tracking for notify

Stores notification history in an SQLite database for later review.
"""

import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class NotificationHistory:
    """Track notification history in SQLite database"""

    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize notification history

        Args:
            db_path: Path to database file (default: ~/.local/share/notify/history.db)
        """
        if db_path is None:
            db_path = Path.home() / ".local" / "share" / "notify" / "history.db"

        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row

        self._init_schema()

    def _init_schema(self) -> None:
        """Initialize database schema"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                priority INTEGER DEFAULT 0,
                method TEXT NOT NULL,
                success INTEGER NOT NULL,
                prefix TEXT
            )
        """)

        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_timestamp ON notifications(timestamp)
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_method ON notifications(method)
        """)

    @contextmanager
    def transaction(self):
        """Context manager for database transactions"""
        try:
            yield self.conn
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def log_notification(
        self,
        title: str,
        message: str,
        method: str,
        success: bool,
        priority: int = 0,
        prefix: Optional[str] = None
    ) -> None:
        """
        Log a notification

        Args:
            title: Notification title
            message: Notification message
            method: Method used (wall, pushover)
            success: Whether the notification succeeded
            priority: Priority level
            prefix: Optional prefix (for wall notifications)
        """
        timestamp = datetime.utcnow().isoformat()

        self.conn.execute(
            """
            INSERT INTO notifications
            (timestamp, title, message, priority, method, success, prefix)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (timestamp, title, message, priority, method, 1 if success else 0, prefix)
        )
        self.conn.commit()

    def get_recent(self, limit: int = 50, method: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get recent notifications

        Args:
            limit: Maximum number to return
            method: Filter by method (wall, pushover, or None for all)

        Returns:
            List of notification dictionaries
        """
        if method:
            cursor = self.conn.execute(
                """
                SELECT * FROM notifications
                WHERE method = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (method, limit)
            )
        else:
            cursor = self.conn.execute(
                """
                SELECT * FROM notifications
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (limit,)
            )

        return [dict(row) for row in cursor.fetchall()]

    def get_stats(self, hours: int = 24) -> Dict[str, Any]:
        """
        Get statistics for recent notifications

        Args:
            hours: Time window in hours

        Returns:
            Dictionary with statistics
        """
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

        cursor = self.conn.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(success) as successful,
                method
            FROM notifications
            WHERE timestamp > ?
            GROUP BY method
            """,
            (cutoff,)
        )

        stats = {
            'total': 0,
            'successful': 0,
            'by_method': {}
        }

        for row in cursor.fetchall():
            stats['total'] += row['total']
            stats['successful'] += row['successful']
            stats['by_method'][row['method']] = {
                'total': row['total'],
                'successful': row['successful']
            }

        return stats

    def cleanup(self, days: int = 30) -> int:
        """
        Delete old notification history

        Args:
            days: Keep notifications from the last N days

        Returns:
            Number of records deleted
        """
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

        cursor = self.conn.execute(
            "DELETE FROM notifications WHERE timestamp < ?",
            (cutoff,)
        )
        deleted = cursor.rowcount
        self.conn.commit()

        return deleted

    def close(self) -> None:
        """Close database connection"""
        if self.conn:
            self.conn.close()
