"""
Visualization utilities for ping-monitor

Provides plotting and reporting functions.
"""

import logging
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

from .database import Database
from .utils import build_target_filter_aliased

logger = logging.getLogger(__name__)

# Try to import plotext for prettier terminal plots
try:
    import plotext as plt
    HAS_PLOTEXT = True
except ImportError:
    HAS_PLOTEXT = False
    logger.debug("plotext not available, using gnuplot fallback")


def plot_downtime_gnuplot(db: Database, hours: int = 24, bucket_minutes: int = 15,
                          target_name: Optional[str] = None, y_max: int = 20) -> None:
    """
    Generate ASCII plot of downtime percentage using gnuplot

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
        target_name: Target name filter (None = all targets)
        y_max: Maximum Y-axis value
    """
    # Get data from database
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            print(f"Error: Target '{target_name}' not found")
            return
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Query with time bucketing
    query = f"""
    WITH rounded AS (
        SELECT
            strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
            status
        FROM log l
        WHERE timestamp >= datetime('{cutoff}')
        {where_clause}
    ),
    bucketed AS (
        SELECT
            substr(ts, 1, 13) || ':' ||
            CASE
                WHEN cast(substr(ts, 15, 2) as int) < 15 THEN '00'
                WHEN cast(substr(ts, 15, 2) as int) < 30 THEN '15'
                WHEN cast(substr(ts, 15, 2) as int) < 45 THEN '30'
                ELSE '45'
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

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    data = cursor.fetchall()

    if not data:
        print("No data available for the specified time range")
        return

    # Write to temporary CSV file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        csv_path = f.name
        for row in data:
            f.write(f"{row[0]},{row[1]}\n")

    try:
        # Generate gnuplot script
        gnuplot_script = f"""
set terminal dumb size 100,25
set datafile separator ','
set xdata time
set timefmt '%Y-%m-%dT%H:%M'
set format x '%H:%M'
set xlabel 'Local Time (past {hours}h)'
set ylabel '% Downtime'
set yrange [0:{y_max}]
set title '{bucket_minutes}-min Downtime % (Local Time){" - " + target_name if target_name else ""}'
plot \\
  '{csv_path}' using 1:2:($2 > 0 ? $2 : 1/0) with boxes title 'Downtime > 0', \\
  '{csv_path}' using 1:2:($2 == 0 ? $2 : 1/0) with boxes title 'No Downtime'
"""

        # Run gnuplot
        result = subprocess.run(
            ['gnuplot'],
            input=gnuplot_script,
            text=True,
            capture_output=True
        )

        if result.returncode == 0:
            print(result.stdout)
        else:
            print(f"Gnuplot error: {result.stderr}")

    finally:
        # Clean up temporary file
        Path(csv_path).unlink(missing_ok=True)


def plot_latency_gnuplot(db: Database, hours: int = 24, bucket_minutes: int = 15,
                        target_name: Optional[str] = None) -> None:
    """
    Generate ASCII plot of average ping latency using gnuplot

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
        target_name: Target name filter (None = all targets)
    """
    # Get data from database
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            print(f"Error: Target '{target_name}' not found")
            return
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Query with time bucketing
    query = f"""
    WITH valid_pings AS (
        SELECT
            strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
            ping_ms
        FROM log l
        WHERE timestamp >= datetime('{cutoff}')
        AND ping_ms IS NOT NULL
        {where_clause}
    ),
    bucketed AS (
        SELECT
            substr(ts, 1, 13) || ':' ||
            CASE
                WHEN cast(substr(ts, 15, 2) as int) < 15 THEN '00'
                WHEN cast(substr(ts, 15, 2) as int) < 30 THEN '15'
                WHEN cast(substr(ts, 15, 2) as int) < 45 THEN '30'
                ELSE '45'
            END AS bucket,
            ping_ms
        FROM valid_pings
    ),
    aggregated AS (
        SELECT
            bucket,
            round(avg(ping_ms), 2) AS avg_ping
        FROM bucketed
        GROUP BY bucket
    )
    SELECT bucket, avg_ping
    FROM aggregated
    ORDER BY bucket
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    data = cursor.fetchall()

    if not data:
        print("No data available for the specified time range")
        return

    # Write to temporary CSV file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        csv_path = f.name
        for row in data:
            f.write(f"{row[0]},{row[1]}\n")

    try:
        # Generate gnuplot script
        gnuplot_script = f"""
set terminal dumb size 100,25
set datafile separator ','
set xdata time
set timefmt '%Y-%m-%dT%H:%M'
set format x '%H:%M'
set xlabel 'Local Time (past {hours}h)'
set ylabel 'Avg Ping (ms)'
set title '{bucket_minutes}-min Avg Ping Latency{" - " + target_name if target_name else ""}'
plot '{csv_path}' using 1:2 with lines title 'Avg Latency'
"""

        # Run gnuplot
        result = subprocess.run(
            ['gnuplot'],
            input=gnuplot_script,
            text=True,
            capture_output=True
        )

        if result.returncode == 0:
            print(result.stdout)
        else:
            print(f"Gnuplot error: {result.stderr}")

    finally:
        # Clean up temporary file
        Path(csv_path).unlink(missing_ok=True)


def get_quick_stats(db: Database, target_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Get quick uptime statistics for multiple time windows

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)

    Returns:
        Dictionary with stats for each time window
    """
    windows = [5, 15, 60]  # minutes
    stats = {}

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
    else:
        target_id = None

    for window in windows:
        if target_id:
            window_stats = db.get_stats(target_id, window)
        else:
            # Aggregate across all targets
            cutoff = (datetime.utcnow() - timedelta(minutes=window)).isoformat()
            cursor = db.conn.execute(
                """
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status != 'ONLINE' THEN 1 ELSE 0 END) as offline
                FROM log
                WHERE timestamp >= ?
                """,
                (cutoff,)
            )
            row = cursor.fetchone()
            total = row[0]
            offline = row[1] or 0
            window_stats = {
                "total": total,
                "offline": offline,
                "uptime_pct": 100.0 - (offline / total * 100.0) if total > 0 else 100.0
            }

        stats[f"{window}m"] = window_stats

    # Get time since last ping
    if target_id:
        cursor = db.conn.execute(
            "SELECT timestamp FROM log WHERE target_id = ? ORDER BY timestamp DESC LIMIT 1",
            (target_id,)
        )
    else:
        cursor = db.conn.execute(
            "SELECT timestamp FROM log ORDER BY timestamp DESC LIMIT 1"
        )

    row = cursor.fetchone()
    if row:
        last_ping = datetime.fromisoformat(row[0])
        age = datetime.utcnow() - last_ping
        age_str = f"{int(age.total_seconds() // 60)}m {int(age.total_seconds() % 60)}s"
    else:
        age_str = "no data"

    stats["last_ping"] = age_str

    return stats


def format_stats_output(stats: Dict[str, Any]) -> str:
    """
    Format stats for terminal output (compatible with status bars)

    Args:
        stats: Stats dictionary from get_quick_stats

    Returns:
        Formatted string
    """
    if "error" in stats:
        return f"N/A, N/A, N/A ({stats['error']})"

    # Calculate downtime percentages
    downtime_5m = 100.0 - stats["5m"]["uptime_pct"]
    downtime_15m = 100.0 - stats["15m"]["uptime_pct"]
    downtime_60m = 100.0 - stats["60m"]["uptime_pct"]

    return f"{downtime_5m:.1f}, {downtime_15m:.1f}, {downtime_60m:.1f} ({stats['last_ping']})"


def plot_downtime_plotext(db: Database, hours: int = 24, bucket_minutes: int = 15,
                          target_name: Optional[str] = None, y_max: int = 20) -> None:
    """
    Generate colored terminal plot of downtime percentage using plotext

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
        target_name: Target name filter (None = all targets)
        y_max: Maximum Y-axis value
    """
    if not HAS_PLOTEXT:
        print("plotext not installed, falling back to gnuplot")
        plot_downtime_gnuplot(db, hours, bucket_minutes, target_name, y_max)
        return

    # Get data from database
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            print(f"Error: Target '{target_name}' not found")
            return
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Query with time bucketing
    query = f"""
    WITH rounded AS (
        SELECT
            strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
            status
        FROM log l
        WHERE timestamp >= datetime('{cutoff}')
        {where_clause}
    ),
    bucketed AS (
        SELECT
            substr(ts, 1, 13) || ':' ||
            CASE
                WHEN cast(substr(ts, 15, 2) as int) < 15 THEN '00'
                WHEN cast(substr(ts, 15, 2) as int) < 30 THEN '15'
                WHEN cast(substr(ts, 15, 2) as int) < 45 THEN '30'
                ELSE '45'
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

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    data = cursor.fetchall()

    if not data:
        print("No data available for the specified time range")
        return

    # Extract times and values
    times = [row[0] for row in data]
    downtime = [row[1] for row in data]

    # Create bar chart with colors
    plt.clear_figure()

    # Dark mode theme
    plt.theme('dark')

    # Use numeric x-axis and set labels manually
    x_values = list(range(len(times)))
    plt.bar(x_values, downtime, width=0.8, color="red+", marker="hd")

    # Styling
    plt.title(f"Downtime % - Last {hours}h{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Time")
    plt.ylabel("% Downtime")
    plt.ylim(0, y_max)

    # Show time labels - extract just HH:MM
    step = max(1, len(times) // 10)
    labels = [times[i][-5:] if i < len(times) else "" for i in range(0, len(times), step)]
    label_positions = list(range(0, len(times), step))
    plt.xticks(label_positions, labels)

    # Show the plot
    plt.show()


def plot_latency_plotext(db: Database, hours: int = 24, bucket_minutes: int = 15,
                        target_name: Optional[str] = None) -> None:
    """
    Generate colored terminal plot of average ping latency using plotext

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
        target_name: Target name filter (None = all targets)
    """
    if not HAS_PLOTEXT:
        print("plotext not installed, falling back to gnuplot")
        plot_latency_gnuplot(db, hours, bucket_minutes, target_name)
        return

    # Get data from database
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            print(f"Error: Target '{target_name}' not found")
            return
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Query with time bucketing
    query = f"""
    WITH valid_pings AS (
        SELECT
            strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
            ping_ms
        FROM log l
        WHERE timestamp >= datetime('{cutoff}')
        AND ping_ms IS NOT NULL
        {where_clause}
    ),
    bucketed AS (
        SELECT
            substr(ts, 1, 13) || ':' ||
            CASE
                WHEN cast(substr(ts, 15, 2) as int) < 15 THEN '00'
                WHEN cast(substr(ts, 15, 2) as int) < 30 THEN '15'
                WHEN cast(substr(ts, 15, 2) as int) < 45 THEN '30'
                ELSE '45'
            END AS bucket,
            ping_ms
        FROM valid_pings
    ),
    aggregated AS (
        SELECT
            bucket,
            round(avg(ping_ms), 2) AS avg_ping
        FROM bucketed
        GROUP BY bucket
    )
    SELECT bucket, avg_ping
    FROM aggregated
    ORDER BY bucket
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    data = cursor.fetchall()

    if not data:
        print("No data available for the specified time range")
        return

    # Extract times and values
    times = [row[0] for row in data]
    latency = [row[1] for row in data]

    # Create line plot with colors
    plt.clear_figure()

    # Dark mode theme
    plt.theme('dark')

    # Use numeric x-axis and set labels manually
    x_values = list(range(len(times)))
    plt.plot(x_values, latency, color="cyan+", marker="braille")

    # Styling
    plt.title(f"Avg Ping Latency - Last {hours}h{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Time")
    plt.ylabel("Latency (ms)")

    # Show time labels - extract just HH:MM
    step = max(1, len(times) // 10)
    labels = [times[i][-5:] if i < len(times) else "" for i in range(0, len(times), step)]
    label_positions = list(range(0, len(times), step))
    plt.xticks(label_positions, labels)

    # Show the plot
    plt.show()
