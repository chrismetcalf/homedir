"""
Data export utilities for battery-monitor

Provides functions for exporting battery monitoring data to various formats.
"""

import csv
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

from .database import Database

logger = logging.getLogger(__name__)


def export_csv(db: Database, output_path: Path, hours: Optional[int] = None) -> int:
    """
    Export battery data to CSV format

    Args:
        db: Database instance
        output_path: Output file path
        hours: Hours to look back (None = all data)

    Returns:
        Number of records exported
    """
    # Build query
    where_clause = ""
    params = []

    if hours:
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        where_clause = "WHERE timestamp >= ?"
        params.append(cutoff)

    query = f"""
    SELECT
        timestamp,
        percentage,
        status,
        voltage,
        current,
        power,
        temperature,
        time_remaining,
        cycle_count
    FROM battery_log
    {where_clause}
    ORDER BY timestamp
    """

    cursor = db.conn.execute(query, params)

    # Write CSV
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'timestamp', 'percentage', 'status', 'voltage', 'current',
            'power', 'temperature', 'time_remaining', 'cycle_count'
        ])

        count = 0
        for row in cursor:
            writer.writerow(row)
            count += 1

    logger.info(f"Exported {count} records to {output_path}")
    return count


def export_json(db: Database, output_path: Path, hours: Optional[int] = None,
                pretty: bool = True) -> int:
    """
    Export battery data to JSON format

    Args:
        db: Database instance
        output_path: Output file path
        hours: Hours to look back (None = all data)
        pretty: Pretty-print JSON

    Returns:
        Number of records exported
    """
    # Build query
    where_clause = ""
    params = []

    if hours:
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        where_clause = "WHERE timestamp >= ?"
        params.append(cutoff)

    query = f"""
    SELECT
        timestamp,
        percentage,
        status,
        voltage,
        current,
        power,
        temperature,
        time_remaining,
        cycle_count
    FROM battery_log
    {where_clause}
    ORDER BY timestamp
    """

    cursor = db.conn.execute(query, params)

    # Build JSON structure
    records = []
    for row in cursor:
        record = {
            'timestamp': row[0],
            'percentage': row[1],
            'status': row[2],
            'voltage': row[3],
            'current': row[4],
            'power': row[5],
            'temperature': row[6],
            'time_remaining': row[7],
            'cycle_count': row[8]
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


def export_summary_json(db: Database, output_path: Path) -> bool:
    """
    Export battery summary statistics to JSON

    Args:
        db: Database instance
        output_path: Output file path

    Returns:
        True if successful
    """
    summary = {
        'generated_at': datetime.utcnow().isoformat(),
        'windows': {}
    }

    # Get stats for different time windows
    for hours in [1, 6, 24, 168]:  # 1h, 6h, 24h, 1 week
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
        cursor = db.conn.execute(
            """
            SELECT
                COUNT(*) as total,
                AVG(percentage) as avg_pct,
                MIN(percentage) as min_pct,
                MAX(percentage) as max_pct,
                AVG(voltage) as avg_voltage,
                AVG(current) as avg_current,
                AVG(power) as avg_power,
                AVG(temperature) as avg_temp
            FROM battery_log
            WHERE timestamp >= ?
            """,
            (cutoff,)
        )

        row = cursor.fetchone()

        # Count time in each status
        status_cursor = db.conn.execute(
            """
            SELECT status, COUNT(*) as count
            FROM battery_log
            WHERE timestamp >= ?
            GROUP BY status
            """,
            (cutoff,)
        )
        status_counts = {row[0]: row[1] for row in status_cursor.fetchall()}

        window_name = f"{hours}h" if hours < 168 else "1w"
        summary['windows'][window_name] = {
            'total_readings': row[0] or 0,
            'avg_percentage': round(row[1], 2) if row[1] else None,
            'min_percentage': round(row[2], 2) if row[2] else None,
            'max_percentage': round(row[3], 2) if row[3] else None,
            'avg_voltage': round(row[4], 3) if row[4] else None,
            'avg_current': round(row[5], 3) if row[5] else None,
            'avg_power': round(row[6], 2) if row[6] else None,
            'avg_temperature': round(row[7], 1) if row[7] else None,
            'status_counts': status_counts
        }

    # Get recent events
    events_cursor = db.conn.execute(
        """
        SELECT timestamp, event_type, description, percentage
        FROM events
        ORDER BY timestamp DESC
        LIMIT 10
        """
    )

    summary['recent_events'] = [
        {
            'timestamp': row[0],
            'event_type': row[1],
            'description': row[2],
            'percentage': row[3]
        }
        for row in events_cursor.fetchall()
    ]

    # Get battery info
    info_cursor = db.conn.execute(
        "SELECT battery_id, manufacturer, model, capacity FROM battery_info LIMIT 1"
    )
    info_row = info_cursor.fetchone()
    if info_row:
        summary['battery_info'] = {
            'battery_id': info_row[0],
            'manufacturer': info_row[1],
            'model': info_row[2],
            'capacity': info_row[3]
        }

    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)

    logger.info(f"Exported summary to {output_path}")
    return True
