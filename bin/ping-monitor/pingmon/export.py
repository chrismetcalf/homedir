"""
Data export utilities for ping-monitor

Provides functions for exporting monitoring data to various formats.
"""

import csv
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

from .database import Database

logger = logging.getLogger(__name__)


def export_csv(db: Database, output_path: Path, hours: Optional[int] = None,
               target_name: Optional[str] = None) -> int:
    """
    Export data to CSV format

    Args:
        db: Database instance
        output_path: Output file path
        hours: Hours to look back (None = all data)
        target_name: Target name filter (None = all targets)

    Returns:
        Number of records exported
    """
    # Build query
    where_clauses = []
    params = []

    if hours:
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        where_clauses.append("l.timestamp >= ?")
        params.append(cutoff)

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            logger.error(f"Target '{target_name}' not found")
            return 0
        where_clauses.append("l.target_id = ?")
        params.append(target_id)

    where_clause = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    query = f"""
    SELECT
        l.timestamp,
        t.name as target_name,
        t.host as target_host,
        l.status,
        l.ping_ms,
        loc.public_ip,
        loc.isp,
        loc.city,
        loc.region,
        loc.country
    FROM log l
    JOIN targets t ON l.target_id = t.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    {where_clause}
    ORDER BY l.timestamp
    """

    cursor = db.conn.execute(query, params)

    # Write CSV
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'timestamp', 'target_name', 'target_host', 'status', 'ping_ms',
            'public_ip', 'isp', 'city', 'region', 'country'
        ])

        count = 0
        for row in cursor:
            writer.writerow(row)
            count += 1

    logger.info(f"Exported {count} records to {output_path}")
    return count


def export_json(db: Database, output_path: Path, hours: Optional[int] = None,
                target_name: Optional[str] = None, pretty: bool = True) -> int:
    """
    Export data to JSON format

    Args:
        db: Database instance
        output_path: Output file path
        hours: Hours to look back (None = all data)
        target_name: Target name filter (None = all targets)
        pretty: Pretty-print JSON

    Returns:
        Number of records exported
    """
    # Build query (same as CSV)
    where_clauses = []
    params = []

    if hours:
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        where_clauses.append("l.timestamp >= ?")
        params.append(cutoff)

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            logger.error(f"Target '{target_name}' not found")
            return 0
        where_clauses.append("l.target_id = ?")
        params.append(target_id)

    where_clause = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    query = f"""
    SELECT
        l.timestamp,
        t.name as target_name,
        t.host as target_host,
        l.status,
        l.ping_ms,
        loc.public_ip,
        loc.isp,
        loc.city,
        loc.region,
        loc.country
    FROM log l
    JOIN targets t ON l.target_id = t.id
    LEFT JOIN locations loc ON l.location_id = loc.id
    {where_clause}
    ORDER BY l.timestamp
    """

    cursor = db.conn.execute(query, params)

    # Build JSON structure
    records = []
    for row in cursor:
        record = {
            'timestamp': row[0],
            'target': {
                'name': row[1],
                'host': row[2]
            },
            'status': row[3],
            'ping_ms': row[4]
        }

        if row[5]:  # Has location data
            record['location'] = {
                'public_ip': row[5],
                'isp': row[6],
                'city': row[7],
                'region': row[8],
                'country': row[9]
            }

        records.append(record)

    # Write JSON
    with open(output_path, 'w') as f:
        if pretty:
            json.dump(records, f, indent=2)
        else:
            json.dump(records, f)

    count = len(records)
    logger.info(f"Exported {count} records to {output_path}")
    return count


def export_summary_json(db: Database, output_path: Path,
                        target_name: Optional[str] = None) -> bool:
    """
    Export summary statistics to JSON

    Args:
        db: Database instance
        output_path: Output file path
        target_name: Target name filter (None = all targets)

    Returns:
        True if successful
    """
    summary = {
        'generated_at': datetime.utcnow().isoformat(),
        'targets': []
    }

    # Get targets
    if target_name:
        cursor = db.conn.execute(
            "SELECT id, name, host FROM targets WHERE name = ?",
            (target_name,)
        )
    else:
        cursor = db.conn.execute("SELECT id, name, host FROM targets")

    targets = cursor.fetchall()

    for target_id, name, host in targets:
        # Get stats for different windows
        target_stats = {
            'name': name,
            'host': host,
            'windows': {}
        }

        for hours in [1, 6, 24, 168]:  # 1h, 6h, 24h, 1 week
            cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
            cursor = db.conn.execute(
                """
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
                    AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
                    MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
                    MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
                FROM log
                WHERE target_id = ? AND timestamp >= ?
                """,
                (target_id, cutoff)
            )

            row = cursor.fetchone()
            total = row[0] or 0
            online = row[1] or 0
            uptime_pct = (online / total * 100.0) if total > 0 else 0.0

            window_name = f"{hours}h" if hours < 168 else "1w"
            target_stats['windows'][window_name] = {
                'total_pings': total,
                'uptime_pct': round(uptime_pct, 2),
                'avg_ping_ms': round(row[2], 2) if row[2] else None,
                'min_ping_ms': row[3],
                'max_ping_ms': row[4]
            }

        summary['targets'].append(target_stats)

    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)

    logger.info(f"Exported summary to {output_path}")
    return True
