"""
Reporting utilities for battery-monitor

Provides functions for generating summary reports.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from .database import Database

logger = logging.getLogger(__name__)


def get_daily_report(db: Database, days: int = 7) -> Dict[str, Any]:
    """
    Generate daily summary report

    Args:
        db: Database instance
        days: Number of days to include

    Returns:
        Dictionary with daily stats
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    query = """
    SELECT
        date(timestamp) as day,
        COUNT(*) as total,
        AVG(percentage) as avg_pct,
        MIN(percentage) as min_pct,
        MAX(percentage) as max_pct,
        AVG(power) as avg_power,
        AVG(temperature) as avg_temp,
        SUM(CASE WHEN status = 'Charging' THEN 1 ELSE 0 END) as charging_count,
        SUM(CASE WHEN status = 'Discharging' THEN 1 ELSE 0 END) as discharging_count
    FROM battery_log
    WHERE timestamp >= datetime(?)
    GROUP BY day
    ORDER BY day DESC
    """

    cursor = db.conn.execute(query, (cutoff,))
    daily_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        charging = row[7] or 0
        discharging = row[8] or 0
        charging_pct = (charging / total * 100.0) if total > 0 else 0.0
        discharging_pct = (discharging / total * 100.0) if total > 0 else 0.0

        daily_stats.append({
            'day': row[0],
            'total_readings': total,
            'avg_percentage': row[2],
            'min_percentage': row[3],
            'max_percentage': row[4],
            'avg_power': row[5],
            'avg_temperature': row[6],
            'charging_pct': charging_pct,
            'discharging_pct': discharging_pct
        })

    return {
        'period': f"Last {days} days",
        'daily': daily_stats
    }


def get_weekly_report(db: Database, weeks: int = 4) -> Dict[str, Any]:
    """
    Generate weekly summary report

    Args:
        db: Database instance
        weeks: Number of weeks to include

    Returns:
        Dictionary with weekly stats
    """
    cutoff = (datetime.utcnow() - timedelta(weeks=weeks)).isoformat()

    query = """
    SELECT
        strftime('%Y-W%W', timestamp) as week,
        COUNT(*) as total,
        AVG(percentage) as avg_pct,
        MIN(percentage) as min_pct,
        MAX(percentage) as max_pct,
        AVG(power) as avg_power,
        AVG(temperature) as avg_temp,
        SUM(CASE WHEN status = 'Charging' THEN 1 ELSE 0 END) as charging_count,
        SUM(CASE WHEN status = 'Discharging' THEN 1 ELSE 0 END) as discharging_count
    FROM battery_log
    WHERE timestamp >= datetime(?)
    GROUP BY week
    ORDER BY week DESC
    """

    cursor = db.conn.execute(query, (cutoff,))
    weekly_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        charging = row[7] or 0
        discharging = row[8] or 0
        charging_pct = (charging / total * 100.0) if total > 0 else 0.0
        discharging_pct = (discharging / total * 100.0) if total > 0 else 0.0

        weekly_stats.append({
            'week': row[0],
            'total_readings': total,
            'avg_percentage': row[2],
            'min_percentage': row[3],
            'max_percentage': row[4],
            'avg_power': row[5],
            'avg_temperature': row[6],
            'charging_pct': charging_pct,
            'discharging_pct': discharging_pct
        })

    return {
        'period': f"Last {weeks} weeks",
        'weekly': weekly_stats
    }


def get_monthly_report(db: Database, months: int = 3) -> Dict[str, Any]:
    """
    Generate monthly summary report

    Args:
        db: Database instance
        months: Number of months to include

    Returns:
        Dictionary with monthly stats
    """
    # Approximate months as 30 days each
    cutoff = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()

    query = """
    SELECT
        strftime('%Y-%m', timestamp) as month,
        COUNT(*) as total,
        AVG(percentage) as avg_pct,
        MIN(percentage) as min_pct,
        MAX(percentage) as max_pct,
        AVG(power) as avg_power,
        AVG(temperature) as avg_temp,
        SUM(CASE WHEN status = 'Charging' THEN 1 ELSE 0 END) as charging_count,
        SUM(CASE WHEN status = 'Discharging' THEN 1 ELSE 0 END) as discharging_count
    FROM battery_log
    WHERE timestamp >= datetime(?)
    GROUP BY month
    ORDER BY month DESC
    """

    cursor = db.conn.execute(query, (cutoff,))
    monthly_stats = []

    for row in cursor.fetchall():
        total = row[1] or 0
        charging = row[7] or 0
        discharging = row[8] or 0
        charging_pct = (charging / total * 100.0) if total > 0 else 0.0
        discharging_pct = (discharging / total * 100.0) if total > 0 else 0.0

        monthly_stats.append({
            'month': row[0],
            'total_readings': total,
            'avg_percentage': row[2],
            'min_percentage': row[3],
            'max_percentage': row[4],
            'avg_power': row[5],
            'avg_temperature': row[6],
            'charging_pct': charging_pct,
            'discharging_pct': discharging_pct
        })

    return {
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
    lines.append(f"\n=== Battery Report - {report['period']} ===\n")

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
    lines.append(f"{header:<12}  {'READS':<6}  {'AVG%':<6}  {'MIN%':<6}  {'MAX%':<6}  {'PWR(W)':<8}  {'TEMP':<6}  {'CHG%':<6}  DSCH%")
    lines.append("-" * 80)

    # Table rows
    for item in data:
        period = item.get('day') or item.get('week') or item.get('month')
        avg_pct = f"{item['avg_percentage']:.1f}" if item['avg_percentage'] else "N/A"
        min_pct = f"{item['min_percentage']:.1f}" if item['min_percentage'] else "N/A"
        max_pct = f"{item['max_percentage']:.1f}" if item['max_percentage'] else "N/A"
        avg_power = f"{item['avg_power']:.2f}" if item['avg_power'] else "N/A"
        avg_temp = f"{item['avg_temperature']:.1f}°C" if item['avg_temperature'] else "N/A"

        lines.append(
            f"{period:<12}  "
            f"{item['total_readings']:<6}  "
            f"{avg_pct:<6}  "
            f"{min_pct:<6}  "
            f"{max_pct:<6}  "
            f"{avg_power:<8}  "
            f"{avg_temp:<6}  "
            f"{item['charging_pct']:>5.1f}  "
            f"{item['discharging_pct']:>5.1f}"
        )

    return "\n".join(lines)


def get_charge_cycle_summary(db: Database, days: int = 30) -> List[Dict[str, Any]]:
    """
    Get summary of charge/discharge cycles

    Args:
        db: Database instance
        days: Number of days to analyze

    Returns:
        List of charge cycle summaries
    """
    cycles = db.get_charge_cycles(days=days)

    summaries = []
    for cycle in cycles:
        duration = None
        if 'end_time' in cycle:
            start = datetime.fromisoformat(cycle['start_time'])
            end = datetime.fromisoformat(cycle['end_time'])
            duration = (end - start).total_seconds() / 3600  # hours

        summary = {
            'start_time': cycle['start_time'],
            'type': cycle['type'],
            'start_percentage': cycle.get('start_percentage'),
            'end_percentage': cycle.get('end_percentage'),
            'duration_hours': duration
        }
        summaries.append(summary)

    return summaries


def format_charge_cycles(cycles: List[Dict[str, Any]]) -> str:
    """
    Format charge cycle summary for terminal output

    Args:
        cycles: List of cycle dictionaries

    Returns:
        Formatted string
    """
    if not cycles:
        return "No charge cycles detected in the specified period"

    lines = []
    lines.append(f"\n=== Charge/Discharge Cycles ===\n")
    lines.append(f"{'START':<20}  {'TYPE':<10}  {'START%':<7}  {'END%':<7}  DURATION")
    lines.append("-" * 70)

    for cycle in cycles:
        start_time = datetime.fromisoformat(cycle['start_time']).strftime('%Y-%m-%d %H:%M')
        cycle_type = cycle['type'].capitalize()
        start_pct = f"{cycle['start_percentage']:.1f}%" if cycle['start_percentage'] else "N/A"
        end_pct = f"{cycle['end_percentage']:.1f}%" if cycle.get('end_percentage') else "ongoing"

        if cycle.get('duration_hours'):
            hours = int(cycle['duration_hours'])
            minutes = int((cycle['duration_hours'] - hours) * 60)
            duration_str = f"{hours}h {minutes}m"
        else:
            duration_str = "ongoing"

        lines.append(
            f"{start_time:<20}  "
            f"{cycle_type:<10}  "
            f"{start_pct:<7}  "
            f"{end_pct:<7}  "
            f"{duration_str}"
        )

    return "\n".join(lines)
