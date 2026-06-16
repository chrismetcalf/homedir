"""
Location analysis utilities for ping-monitor

Provides functions for analyzing monitoring data by location.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from .database import Database

logger = logging.getLogger(__name__)


def get_all_locations(db: Database) -> List[Dict[str, Any]]:
    """
    Get all unique locations from database

    Args:
        db: Database instance

    Returns:
        List of location dictionaries
    """
    cursor = db.conn.execute(
        """
        SELECT
            id,
            public_ip,
            isp,
            city,
            region,
            country,
            first_seen,
            last_seen
        FROM locations
        ORDER BY last_seen DESC
        """
    )

    locations = []
    for row in cursor.fetchall():
        locations.append({
            'id': row[0],
            'public_ip': row[1],
            'isp': row[2],
            'city': row[3],
            'region': row[4],
            'country': row[5],
            'first_seen': row[6],
            'last_seen': row[7]
        })

    return locations


def get_location_stats(db: Database, location_id: int,
                       hours: int = 24) -> Dict[str, Any]:
    """
    Get statistics for a specific location

    Args:
        db: Database instance
        location_id: Location ID
        hours: Hours to look back

    Returns:
        Dictionary with stats
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    cursor = db.conn.execute(
        """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
            SUM(CASE WHEN status = 'OFFLINE' OR status = 'TIMEOUT' THEN 1 ELSE 0 END) as offline,
            AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
            MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
            MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
        FROM log
        WHERE location_id = ? AND timestamp >= ?
        """,
        (location_id, cutoff)
    )

    row = cursor.fetchone()
    total = row[0] or 0
    online = row[1] or 0
    offline = row[2] or 0
    uptime_pct = (online / total * 100.0) if total > 0 else 0.0

    return {
        'total_pings': total,
        'online': online,
        'offline': offline,
        'uptime_pct': uptime_pct,
        'avg_ping': row[3],
        'min_ping': row[4],
        'max_ping': row[5]
    }


def format_locations_table(locations: List[Dict[str, Any]],
                           db: Optional[Database] = None,
                           show_stats: bool = False) -> str:
    """
    Format locations as a table

    Args:
        locations: List of location dictionaries
        db: Database instance (required if show_stats=True)
        show_stats: Whether to include statistics

    Returns:
        Formatted string
    """
    if not locations:
        return "No locations recorded"

    lines = []

    if show_stats and db:
        # Header with stats
        lines.append(f"{'IP':<15}  {'ISP':<30}  {'LOCATION':<25}  {'UPTIME':<8}  AVG PING")
        lines.append("-" * 100)

        for loc in locations:
            stats = get_location_stats(db, loc['id'], hours=24)
            location_str = f"{loc['city'] or 'Unknown'}, {loc['country'] or '??'}"
            avg_ping = f"{stats['avg_ping']:.1f}ms" if stats['avg_ping'] else "N/A"

            lines.append(
                f"{loc['public_ip']:<15}  "
                f"{(loc['isp'] or 'Unknown')[:30]:<30}  "
                f"{location_str[:25]:<25}  "
                f"{stats['uptime_pct']:>6.2f}%  "
                f"{avg_ping}"
            )
    else:
        # Simple table without stats
        lines.append(f"{'IP':<15}  {'ISP':<30}  {'LOCATION':<25}  LAST SEEN")
        lines.append("-" * 100)

        for loc in locations:
            location_str = f"{loc['city'] or 'Unknown'}, {loc['country'] or '??'}"
            last_seen = loc['last_seen']
            if last_seen:
                last_dt = datetime.fromisoformat(last_seen)
                age = datetime.utcnow() - last_dt
                if age.days > 0:
                    last_seen_str = f"{age.days}d ago"
                elif age.seconds > 3600:
                    last_seen_str = f"{age.seconds // 3600}h ago"
                else:
                    last_seen_str = f"{age.seconds // 60}m ago"
            else:
                last_seen_str = "Unknown"

            lines.append(
                f"{loc['public_ip']:<15}  "
                f"{(loc['isp'] or 'Unknown')[:30]:<30}  "
                f"{location_str[:25]:<25}  "
                f"{last_seen_str}"
            )

    return "\n".join(lines)
