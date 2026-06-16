"""
Real-time monitoring utilities for ping-monitor

Provides functions for live status display and continuous monitoring.
"""

import time
import sys
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from .config import Config
from .database import Database
from .pinger import Pinger, PingResult

logger = logging.getLogger(__name__)


def get_current_status(db: Database, config: Config) -> List[Dict[str, Any]]:
    """
    Get current status of all targets (optimized with single query)

    Args:
        db: Database instance
        config: Config instance

    Returns:
        List of target status dictionaries
    """
    # Build target name to host mapping from config
    target_hosts = {target.name: target.host for target in config.targets}

    # Single query to get latest ping for all targets with recent stats
    cutoff = (datetime.utcnow() - timedelta(minutes=5)).isoformat()

    cursor = db.conn.execute("""
        WITH latest_pings AS (
            SELECT
                t.id,
                t.name,
                l.timestamp,
                l.status,
                l.ping_ms,
                ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY l.timestamp DESC) as rn
            FROM targets t
            LEFT JOIN log l ON t.id = l.target_id
        ),
        recent_stats AS (
            SELECT
                target_id,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'OFFLINE' THEN 1 ELSE 0 END) as offline
            FROM log
            WHERE timestamp >= ?
            GROUP BY target_id
        )
        SELECT
            lp.name,
            lp.timestamp,
            lp.status,
            lp.ping_ms,
            COALESCE(rs.total, 0) as total,
            COALESCE(rs.offline, 0) as offline
        FROM latest_pings lp
        LEFT JOIN recent_stats rs ON lp.id = rs.target_id
        WHERE lp.rn = 1
    """, (cutoff,))

    # Convert to dictionary keyed by target name
    status_by_name = {}
    for row in cursor.fetchall():
        name, timestamp, status, ping_ms, total, offline = row

        if timestamp:
            last_timestamp = datetime.fromisoformat(timestamp)
            age = datetime.utcnow() - last_timestamp
            age_str = f"{int(age.total_seconds())}s ago"
            recent_uptime = 100.0 - (offline / total * 100.0) if total > 0 else 0.0

            status_by_name[name] = {
                'name': name,
                'host': target_hosts.get(name, 'unknown'),
                'status': status,
                'ping_ms': ping_ms,
                'last_seen': age_str,
                'timestamp': timestamp,
                'recent_uptime': recent_uptime
            }
        else:
            status_by_name[name] = {
                'name': name,
                'host': target_hosts.get(name, 'unknown'),
                'status': 'UNKNOWN',
                'ping_ms': None,
                'last_seen': 'never',
                'timestamp': None,
                'recent_uptime': 0.0
            }

    # Return in config order
    statuses = []
    for target in config.targets:
        if target.name in status_by_name:
            statuses.append(status_by_name[target.name])
        else:
            # Target exists in config but not in database yet
            statuses.append({
                'name': target.name,
                'host': target.host,
                'status': 'UNKNOWN',
                'ping_ms': None,
                'last_seen': 'never',
                'timestamp': None,
                'recent_uptime': 0.0
            })

    return statuses


def format_status(statuses: List[Dict[str, Any]]) -> str:
    """
    Format current status for terminal output

    Args:
        statuses: List of status dictionaries

    Returns:
        Formatted string
    """
    if not statuses:
        return "No targets configured"

    lines = []
    lines.append(f"\n=== Ping Monitor Status ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) ===\n")
    lines.append(f"{'TARGET':<15}  {'HOST':<25}  {'STATUS':<8}  {'LATENCY':<10}  {'5M UPTIME':<10}  LAST SEEN")
    lines.append("-" * 95)

    for status in statuses:
        # Color code status
        if status['status'] == 'ONLINE':
            status_str = "\033[32mONLINE\033[0m  "  # Green
        elif status['status'] == 'OFFLINE':
            status_str = "\033[31mOFFLINE\033[0m "  # Red
        elif status['status'] == 'TIMEOUT':
            status_str = "\033[33mTIMEOUT\033[0m "  # Yellow
        else:
            status_str = "UNKNOWN "

        latency = f"{status['ping_ms']:.1f}ms" if status['ping_ms'] else "N/A"
        uptime = f"{status['recent_uptime']:.1f}%"

        lines.append(
            f"{status['name']:<15}  "
            f"{status['host']:<25}  "
            f"{status_str:<16}  "  # Extra space for ANSI codes
            f"{latency:<10}  "
            f"{uptime:<10}  "
            f"{status['last_seen']}"
        )

    return "\n".join(lines)


def live_status(config: Config, db: Database, interval: int = 5) -> None:
    """
    Display live status updates

    Args:
        config: Config instance
        db: Database instance
        interval: Update interval in seconds
    """
    try:
        while True:
            # Clear screen
            print("\033[2J\033[H", end="")

            # Get and display status
            statuses = get_current_status(db, config)
            print(format_status(statuses))

            # Wait for next update
            print(f"\nUpdating every {interval}s... (Ctrl+C to exit)")
            time.sleep(interval)

    except KeyboardInterrupt:
        print("\n\nExiting live status...")


def watch_pings(config: Config, continuous: bool = False, interval: int = 1) -> None:
    """
    Watch ping results in real-time (doesn't save to database)

    Args:
        config: Config instance
        continuous: If True, run continuously; if False, ping once
        interval: Interval between pings in seconds
    """
    # Create pingers for each target
    pingers = {}
    for target in config.targets:
        pingers[target.name] = Pinger(
            target.host,
            timeout=config.monitoring.ping_timeout
        )

    try:
        print(f"=== Watching Pings ({datetime.now().strftime('%H:%M:%S')}) ===\n")

        iteration = 0
        while True:
            if iteration > 0 and continuous:
                # Clear previous results
                print("\033[2J\033[H", end="")
                print(f"=== Watching Pings ({datetime.now().strftime('%H:%M:%S')}) ===\n")

            # Ping all targets
            for target_name, pinger in pingers.items():
                result = pinger.ping()

                # Format result with color
                if result.status == "ONLINE":
                    status_str = f"\033[32m{result.status}\033[0m"
                    latency_str = f"{result.latency_ms:.1f}ms"
                elif result.status == "TIMEOUT":
                    status_str = f"\033[33m{result.status}\033[0m"
                    latency_str = "N/A"
                else:
                    status_str = f"\033[31m{result.status}\033[0m"
                    latency_str = "N/A"

                print(f"{target_name:<15}  {status_str:<17}  {latency_str}")

            if not continuous:
                break

            print(f"\nUpdating every {interval}s... (Ctrl+C to exit)")
            time.sleep(interval)
            iteration += 1

    except KeyboardInterrupt:
        print("\n\nExiting watch mode...")


def stream_log(db: Database, target_name: Optional[str] = None,
               follow: bool = True) -> None:
    """
    Stream log entries in real-time (like tail -f)

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        follow: If True, continuously monitor for new entries
    """
    # Get starting position
    cursor = db.conn.execute("SELECT MAX(rowid) FROM log")
    row = cursor.fetchone()
    last_rowid = row[0] or 0

    # Prepare query based on whether we're filtering by target
    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            print(f"Error: Target '{target_name}' not found")
            return
        query = """
            SELECT
                l.rowid,
                l.timestamp,
                t.name as target_name,
                l.status,
                l.ping_ms
            FROM log l
            JOIN targets t ON l.target_id = t.id
            WHERE l.rowid > ? AND l.target_id = ?
            ORDER BY l.rowid
            """
        query_params = lambda last_id: (last_id, target_id)
    else:
        query = """
            SELECT
                l.rowid,
                l.timestamp,
                t.name as target_name,
                l.status,
                l.ping_ms
            FROM log l
            JOIN targets t ON l.target_id = t.id
            WHERE l.rowid > ?
            ORDER BY l.rowid
            """
        query_params = lambda last_id: (last_id,)

    # Print header
    print(f"=== Streaming Ping Log{' (' + target_name + ')' if target_name else ''} ===\n")

    try:
        while True:
            # Query for new entries
            cursor = db.conn.execute(query, query_params(last_rowid))
            new_entries = cursor.fetchall()

            for entry in new_entries:
                rowid, timestamp, target, status, ping_ms = entry
                last_rowid = rowid

                # Format timestamp
                dt = datetime.fromisoformat(timestamp)
                ts_str = dt.strftime('%H:%M:%S')

                # Color code status
                if status == 'ONLINE':
                    status_str = f"\033[32m{status}\033[0m"
                    latency = f"{ping_ms:.1f}ms" if ping_ms else "N/A"
                elif status == 'TIMEOUT':
                    status_str = f"\033[33m{status}\033[0m"
                    latency = "N/A"
                else:
                    status_str = f"\033[31m{status}\033[0m"
                    latency = "N/A"

                print(f"[{ts_str}] {target:<15}  {status_str:<17}  {latency}")

            if not follow:
                break

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\nExiting log stream...")


def plot_waterfall(db: Database, hours: int = 24, bucket_minutes: int = 15) -> None:
    """
    Plot waterfall chart showing all targets stacked vertically

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
    """
    import shutil

    try:
        import plotext as plt
        has_plotext = True
    except ImportError:
        has_plotext = False
        print("plotext not installed")
        return

    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    # Get all targets
    cursor = db.conn.execute("SELECT id, name FROM targets ORDER BY name")
    targets = cursor.fetchall()

    if not targets:
        print("No targets configured")
        return

    # For each target, get bucketed status data
    target_data = {}

    for target_id, target_name in targets:
        query = f"""
        WITH rounded AS (
            SELECT
                strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
                status
            FROM log
            WHERE timestamp >= datetime('{cutoff}')
            AND target_id = ?
        ),
        bucketed AS (
            SELECT
                substr(ts, 1, 13) || ':' ||
                CASE
                    WHEN cast(substr(ts, 15, 2) as int) < {bucket_minutes} THEN '00'
                    WHEN cast(substr(ts, 15, 2) as int) < {bucket_minutes * 2} THEN '{bucket_minutes:02d}'
                    WHEN cast(substr(ts, 15, 2) as int) < {bucket_minutes * 3} THEN '{bucket_minutes * 2:02d}'
                    ELSE '{bucket_minutes * 3:02d}'
                END AS bucket,
                status
            FROM rounded
        ),
        aggregated AS (
            SELECT
                bucket,
                count(*) AS total,
                sum(status = 'OFFLINE' OR status = 'TIMEOUT') AS offline
            FROM bucketed
            GROUP BY bucket
        )
        SELECT bucket, round(100.0 * offline / total, 1) as downtime_pct
        FROM aggregated
        ORDER BY bucket
        """

        cursor = db.conn.execute(query, (target_id,))
        data = cursor.fetchall()

        target_data[target_name] = {
            'buckets': [row[0] for row in data],
            'downtime': [row[1] for row in data]
        }

    # Find common time buckets
    all_buckets = set()
    for data in target_data.values():
        all_buckets.update(data['buckets'])
    all_buckets = sorted(all_buckets)

    if not all_buckets:
        print("No data available")
        return

    # Get terminal width and limit buckets to fit
    try:
        terminal_width = shutil.get_terminal_size().columns
    except:
        terminal_width = 80

    max_name_len = max(len(name) for _, name in targets) if targets else 10
    label_width = max_name_len + 2
    max_buckets = terminal_width - label_width - 2

    # Sample buckets to fit terminal width
    if len(all_buckets) > max_buckets:
        step = len(all_buckets) / max_buckets
        display_buckets = []
        for i in range(max_buckets):
            idx = int(i * step)
            if idx < len(all_buckets):
                display_buckets.append(all_buckets[idx])
    else:
        display_buckets = all_buckets

    # Build ASCII waterfall
    print(f"\n=== Waterfall Chart - Last {hours}h ===\n")

    # For each target, show a row
    for target_id, target_name in targets:
        data = target_data[target_name]
        row = f"{target_name:<{max_name_len}}  "

        # Build status bar using display_buckets
        for bucket in display_buckets:
            if bucket in data['buckets']:
                idx = data['buckets'].index(bucket)
                downtime_pct = data['downtime'][idx]

                if downtime_pct == 0:
                    char = "\033[1;92m█\033[0m"  # Bold bright green - perfect
                elif downtime_pct < 5:
                    char = "\033[1;92m▓\033[0m"  # Bold bright green - good
                elif downtime_pct < 20:
                    char = "\033[33m▒\033[0m"  # Yellow - warning
                else:
                    char = "\033[31m░\033[0m"  # Red - bad
            else:
                char = "·"  # No data

            row += char

        print(row)

    # Legend
    print(f"\n{'Legend:':<{max_name_len}}  \033[1;92m█\033[0m Perfect  \033[1;92m▓\033[0m Good  \033[33m▒\033[0m Warning  \033[31m░\033[0m Down  · No Data")

    # Time scale at bottom - calculate time positions
    num_display = len(display_buckets)
    num_labels = min(10, num_display // 5)
    if num_labels < 2:
        num_labels = min(2, num_display)

    time_labels = []
    time_positions = []

    if num_labels > 0 and len(display_buckets) > 0:
        for i in range(num_labels):
            display_pos = int((i / (num_labels - 1)) * (num_display - 1)) if num_labels > 1 else 0
            if display_pos < len(display_buckets):
                time_labels.append(display_buckets[display_pos][-5:])
                time_positions.append(display_pos)

    time_row = [" "] * (max_name_len + 2 + len(display_buckets))
    for i, pos in enumerate(time_positions):
        if pos < len(display_buckets):
            time_row[max_name_len + 2 + pos] = "|"

    print(f"\n{''.join(time_row)}")

    # Time labels - build as character array for proper positioning
    time_labels_row = [" "] * (max_name_len + 2 + len(display_buckets))
    for i, pos in enumerate(time_positions):
        if i < len(time_labels) and pos < len(display_buckets):
            label = time_labels[i]
            # Center the label around the position
            start_pos = max_name_len + 2 + pos - len(label) // 2
            # Make sure we don't go out of bounds
            if start_pos >= max_name_len + 2 and start_pos + len(label) <= len(time_labels_row):
                for j, char in enumerate(label):
                    time_labels_row[start_pos + j] = char

    print(''.join(time_labels_row))


def compare_targets(db: Database, target_names: List[str], hours: int = 24) -> str:
    """
    Compare statistics between multiple targets

    Args:
        db: Database instance
        target_names: List of target names to compare
        hours: Hours to look back

    Returns:
        Formatted comparison table
    """
    if len(target_names) < 2:
        return "Error: Need at least 2 targets to compare"

    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    lines = []
    lines.append(f"\n=== Target Comparison (Last {hours}h) ===\n")
    lines.append(f"{'METRIC':<20}  " + "  ".join(f"{name:<15}" for name in target_names))
    lines.append("-" * (20 + (len(target_names) * 17)))

    # Collect stats for each target
    all_stats = []
    for name in target_names:
        target_id = db.get_target_id(name)
        if not target_id:
            all_stats.append(None)
            continue

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

        all_stats.append({
            'total': total,
            'uptime_pct': uptime_pct,
            'avg_ping': row[2],
            'min_ping': row[3],
            'max_ping': row[4]
        })

    # Print comparison rows
    metrics = [
        ('Total Pings', lambda s: f"{s['total']:,}" if s else "N/A"),
        ('Uptime %', lambda s: f"{s['uptime_pct']:.2f}%" if s else "N/A"),
        ('Avg Latency', lambda s: f"{s['avg_ping']:.1f}ms" if s and s['avg_ping'] else "N/A"),
        ('Min Latency', lambda s: f"{s['min_ping']:.1f}ms" if s and s['min_ping'] else "N/A"),
        ('Max Latency', lambda s: f"{s['max_ping']:.1f}ms" if s and s['max_ping'] else "N/A"),
    ]

    for metric_name, formatter in metrics:
        row = f"{metric_name:<20}  "
        row += "  ".join(f"{formatter(stats):<15}" for stats in all_stats)
        lines.append(row)

    return "\n".join(lines)
