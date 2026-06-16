"""
Reporting utilities for ping-monitor

Provides functions for generating summary reports.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from .database import Database
from .utils import build_target_filter_aliased

logger = logging.getLogger(__name__)


def get_daily_report(db: Database, target_name: Optional[str] = None,
                     days: int = 7) -> Dict[str, Any]:
    """
    Generate daily summary report

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        days: Number of days to include

    Returns:
        Dictionary with daily stats
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    # Build target filter
    target_id = None
    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}

    where_clause, filter_params = build_target_filter_aliased(target_id, "l")

    query = f"""
    SELECT
        date(timestamp) as day,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'OFFLINE' OR status = 'TIMEOUT' THEN 1 ELSE 0 END) as offline,
        AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
        MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
        MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
    FROM log l
    WHERE timestamp >= datetime(?)
    {where_clause}
    GROUP BY day
    ORDER BY day DESC
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    daily_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        online = row[2] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        daily_stats.append({
            'day': row[0],
            'total_pings': total,
            'online': online,
            'offline': row[3],
            'uptime_pct': uptime_pct,
            'avg_ping': row[4],
            'min_ping': row[5],
            'max_ping': row[6]
        })

    return {
        'target': target_name or 'all',
        'period': f"Last {days} days",
        'daily': daily_stats
    }


def get_weekly_report(db: Database, target_name: Optional[str] = None,
                      weeks: int = 4) -> Dict[str, Any]:
    """
    Generate weekly summary report

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        weeks: Number of weeks to include

    Returns:
        Dictionary with weekly stats
    """
    cutoff = (datetime.utcnow() - timedelta(weeks=weeks)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    query = f"""
    SELECT
        strftime('%Y-W%W', timestamp) as week,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'OFFLINE' OR status = 'TIMEOUT' THEN 1 ELSE 0 END) as offline,
        AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
        MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
        MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
    FROM log l
    WHERE timestamp >= datetime('{cutoff}')
    {where_clause}
    GROUP BY week
    ORDER BY week DESC
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    weekly_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        online = row[2] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        weekly_stats.append({
            'week': row[0],
            'total_pings': total,
            'online': online,
            'offline': row[3],
            'uptime_pct': uptime_pct,
            'avg_ping': row[4],
            'min_ping': row[5],
            'max_ping': row[6]
        })

    return {
        'target': target_name or 'all',
        'period': f"Last {weeks} weeks",
        'weekly': weekly_stats
    }


def get_monthly_report(db: Database, target_name: Optional[str] = None,
                       months: int = 3) -> Dict[str, Any]:
    """
    Generate monthly summary report

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        months: Number of months to include

    Returns:
        Dictionary with monthly stats
    """
    # Approximate months as 30 days each
    cutoff = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    query = f"""
    SELECT
        strftime('%Y-%m', timestamp) as month,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'OFFLINE' OR status = 'TIMEOUT' THEN 1 ELSE 0 END) as offline,
        AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
        MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
        MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
    FROM log l
    WHERE timestamp >= datetime('{cutoff}')
    {where_clause}
    GROUP BY month
    ORDER BY month DESC
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    monthly_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        online = row[2] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        monthly_stats.append({
            'month': row[0],
            'total_pings': total,
            'online': online,
            'offline': row[3],
            'uptime_pct': uptime_pct,
            'avg_ping': row[4],
            'min_ping': row[5],
            'max_ping': row[6]
        })

    return {
        'target': target_name or 'all',
        'period': f"Last {months} months",
        'monthly': monthly_stats
    }


def format_report(report: Dict[str, Any]) -> str:
    """
    Format report for terminal output

    Args:
        report: Report dictionary

    Returns:
        Formatted string
    """
    if "error" in report:
        return f"Error: {report['error']}"

    lines = []
    lines.append(f"\n=== {report['period']} - Target: {report['target']} ===\n")

    # Determine which type of report
    if 'daily' in report:
        data = report['daily']
        header = "DAY"
    elif 'weekly' in report:
        data = report['weekly']
        header = "WEEK"
    elif 'monthly' in report:
        data = report['monthly']
        header = "MONTH"
    else:
        return "Unknown report format"

    if not data:
        return "No data available for the specified period"

    # Table header
    lines.append(f"{header:<12}  {'PINGS':<8}  {'UPTIME':<8}  {'AVG PING':<10}  {'MIN':<8}  MAX")
    lines.append("-" * 70)

    # Table rows
    for item in data:
        period = item.get('day') or item.get('week') or item.get('month')
        avg_ping = f"{item['avg_ping']:.1f}ms" if item['avg_ping'] else "N/A"
        min_ping = f"{item['min_ping']:.1f}ms" if item['min_ping'] else "N/A"
        max_ping = f"{item['max_ping']:.1f}ms" if item['max_ping'] else "N/A"

        lines.append(
            f"{period:<12}  "
            f"{item['total_pings']:<8}  "
            f"{item['uptime_pct']:>6.2f}%  "
            f"{avg_ping:<10}  "
            f"{min_ping:<8}  "
            f"{max_ping}"
        )

    return "\n".join(lines)


def get_outage_summary(db: Database, target_name: Optional[str] = None,
                       hours: int = 24, min_duration_sec: int = 30) -> List[Dict[str, Any]]:
    """
    Get summary of discrete outage events

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
        min_duration_sec: Minimum outage duration in seconds

    Returns:
        List of outage events
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return []
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Get all offline/timeout events
    query = f"""
    SELECT
        timestamp,
        status,
        t.name as target_name
    FROM log l
    JOIN targets t ON l.target_id = t.id
    WHERE timestamp >= datetime('{cutoff}')
    AND (status = 'OFFLINE' OR status = 'TIMEOUT')
    {where_clause}
    ORDER BY timestamp
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    events = cursor.fetchall()

    # Group consecutive failures into outages
    outages = []
    current_outage = None

    for timestamp, status, target_name in events:
        ts = datetime.fromisoformat(timestamp)

        if current_outage is None:
            # Start new outage
            current_outage = {
                'start': ts,
                'end': ts,
                'target': target_name,
                'count': 1
            }
        elif (ts - current_outage['end']).total_seconds() <= 60:
            # Continue current outage (within 60 seconds)
            current_outage['end'] = ts
            current_outage['count'] += 1
        else:
            # Finish previous outage, start new one
            duration = (current_outage['end'] - current_outage['start']).total_seconds()
            if duration >= min_duration_sec:
                current_outage['duration_sec'] = duration
                outages.append(current_outage)

            current_outage = {
                'start': ts,
                'end': ts,
                'target': target_name,
                'count': 1
            }

    # Don't forget the last outage
    if current_outage:
        duration = (current_outage['end'] - current_outage['start']).total_seconds()
        if duration >= min_duration_sec:
            current_outage['duration_sec'] = duration
            outages.append(current_outage)

    return outages


def format_outages(outages: List[Dict[str, Any]]) -> str:
    """
    Format outages for terminal output

    Args:
        outages: List of outage dictionaries

    Returns:
        Formatted string
    """
    if not outages:
        return "No outages detected in the specified period"

    lines = []
    lines.append(f"\n=== {len(outages)} Outage(s) Detected ===\n")
    lines.append(f"{'START':<20}  {'DURATION':<12}  {'PINGS':<6}  TARGET")
    lines.append("-" * 60)

    for outage in outages:
        start_str = outage['start'].strftime('%Y-%m-%d %H:%M:%S')
        duration = outage['duration_sec']

        # Format duration
        if duration >= 3600:
            duration_str = f"{int(duration // 3600)}h {int((duration % 3600) // 60)}m"
        elif duration >= 60:
            duration_str = f"{int(duration // 60)}m {int(duration % 60)}s"
        else:
            duration_str = f"{int(duration)}s"

        lines.append(
            f"{start_str:<20}  "
            f"{duration_str:<12}  "
            f"{outage['count']:<6}  "
            f"{outage['target']}"
        )

    return "\n".join(lines)
