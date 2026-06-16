"""
Advanced analysis utilities for ping-monitor

Provides functions for percentile analysis, histograms, anomaly detection, etc.
"""

import logging
import statistics
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from collections import Counter

from .database import Database
from .utils import build_target_filter, build_target_filter_aliased

logger = logging.getLogger(__name__)

try:
    import plotext as plt
    HAS_PLOTEXT = True
except ImportError:
    HAS_PLOTEXT = False


def get_latency_percentiles(db: Database, target_name: Optional[str] = None,
                            hours: int = 24) -> Dict[str, Any]:
    """
    Calculate latency percentiles

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back

    Returns:
        Dictionary with percentile stats
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter(target_id)
    else:
        where_clause = ""
        filter_params = ()

    # Get all latency values
    query = f"""
    SELECT ping_ms
    FROM log
    WHERE timestamp >= datetime('{cutoff}')
    AND ping_ms IS NOT NULL
    {where_clause}
    ORDER BY ping_ms
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    latencies = [row[0] for row in cursor.fetchall()]

    if not latencies:
        return {"error": "No latency data available"}

    # Calculate percentiles
    def percentile(data: List[float], p: float) -> float:
        n = len(data)
        k = (n - 1) * (p / 100.0)
        f = int(k)
        c = int(k) + 1 if k != f else f
        if f == c:
            return data[f]
        return data[f] * (c - k) + data[c] * (k - f)

    return {
        'count': len(latencies),
        'min': min(latencies),
        'p01': percentile(latencies, 1),
        'p05': percentile(latencies, 5),
        'p10': percentile(latencies, 10),
        'p25': percentile(latencies, 25),
        'p50': percentile(latencies, 50),
        'p75': percentile(latencies, 75),
        'p90': percentile(latencies, 90),
        'p95': percentile(latencies, 95),
        'p99': percentile(latencies, 99),
        'max': max(latencies),
        'mean': statistics.mean(latencies),
        'stdev': statistics.stdev(latencies) if len(latencies) > 1 else 0.0
    }


def format_percentiles(stats: Dict[str, Any]) -> str:
    """
    Format percentile stats for terminal output

    Args:
        stats: Percentile stats dictionary

    Returns:
        Formatted string
    """
    if "error" in stats:
        return f"Error: {stats['error']}"

    lines = []
    lines.append(f"\n=== Latency Percentiles ({stats['count']:,} samples) ===\n")
    lines.append(f"Min:    {stats['min']:.2f} ms")
    lines.append(f"p1:     {stats['p01']:.2f} ms")
    lines.append(f"p5:     {stats['p05']:.2f} ms")
    lines.append(f"p10:    {stats['p10']:.2f} ms")
    lines.append(f"p25:    {stats['p25']:.2f} ms")
    lines.append(f"p50:    {stats['p50']:.2f} ms  (median)")
    lines.append(f"p75:    {stats['p75']:.2f} ms")
    lines.append(f"p90:    {stats['p90']:.2f} ms")
    lines.append(f"p95:    {stats['p95']:.2f} ms")
    lines.append(f"p99:    {stats['p99']:.2f} ms")
    lines.append(f"Max:    {stats['max']:.2f} ms")
    lines.append(f"\nMean:   {stats['mean']:.2f} ms")
    lines.append(f"StdDev: {stats['stdev']:.2f} ms")

    return "\n".join(lines)


def get_latency_histogram(db: Database, target_name: Optional[str] = None,
                          hours: int = 24, bins: int = 20) -> Dict[str, Any]:
    """
    Get latency distribution histogram data

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
        bins: Number of bins

    Returns:
        Dictionary with histogram data
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter(target_id)
    else:
        where_clause = ""
        filter_params = ()

    # Get all latency values
    query = f"""
    SELECT ping_ms
    FROM log
    WHERE timestamp >= datetime('{cutoff}')
    AND ping_ms IS NOT NULL
    {where_clause}
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    latencies = [row[0] for row in cursor.fetchall()]

    if not latencies:
        return {"error": "No latency data available"}

    # Create histogram bins
    min_lat = min(latencies)
    max_lat = max(latencies)
    bin_width = (max_lat - min_lat) / bins

    histogram = []
    for i in range(bins):
        bin_start = min_lat + (i * bin_width)
        bin_end = bin_start + bin_width
        count = sum(1 for lat in latencies if bin_start <= lat < bin_end)
        histogram.append({
            'range': f"{bin_start:.1f}-{bin_end:.1f}",
            'start': bin_start,
            'end': bin_end,
            'count': count
        })

    # Add last value to last bin if needed
    if latencies and max(latencies) == max_lat:
        histogram[-1]['count'] += 1

    return {
        'bins': histogram,
        'total': len(latencies),
        'min': min_lat,
        'max': max_lat
    }


def plot_histogram(db: Database, target_name: Optional[str] = None,
                   hours: int = 24) -> None:
    """
    Plot latency histogram using plotext

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
    """
    if not HAS_PLOTEXT:
        print("plotext not installed")
        return

    hist_data = get_latency_histogram(db, target_name, hours, bins=25)

    if "error" in hist_data:
        print(f"Error: {hist_data['error']}")
        return

    # Extract data
    bins = hist_data['bins']
    labels = [b['range'] for b in bins]
    counts = [b['count'] for b in bins]

    # Create bar chart
    plt.clear_figure()
    plt.theme('dark')

    x_values = list(range(len(bins)))
    plt.bar(x_values, counts, width=0.8, color="green+", marker="hd")

    plt.title(f"Latency Distribution - Last {hours}h{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Latency (ms)")
    plt.ylabel("Count")

    # Show labels for every 5th bin
    step = max(1, len(bins) // 10)
    label_positions = list(range(0, len(bins), step))
    label_texts = [bins[i]['range'] for i in label_positions]
    plt.xticks(label_positions, label_texts)

    plt.show()


def get_uptime_heatmap(db: Database, target_name: Optional[str] = None,
                       days: int = 30) -> Dict[str, Any]:
    """
    Get uptime data for heatmap visualization

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        days: Number of days to include

    Returns:
        Dictionary with heatmap data
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Get uptime by day and hour
    query = f"""
    SELECT
        date(timestamp) as day,
        strftime('%H', timestamp) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online
    FROM log l
    WHERE timestamp >= datetime('{cutoff}')
    {where_clause}
    GROUP BY day, hour
    ORDER BY day, hour
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    heatmap_data = {}

    for row in cursor.fetchall():
        day = row[0]
        hour = int(row[1])
        total = row[2] or 0
        online = row[3] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        if day not in heatmap_data:
            heatmap_data[day] = {}

        heatmap_data[day][hour] = {
            'uptime_pct': uptime_pct,
            'total': total
        }

    return {
        'data': heatmap_data,
        'days': days
    }


def format_heatmap(heatmap: Dict[str, Any]) -> str:
    """
    Format heatmap for terminal output

    Args:
        heatmap: Heatmap data dictionary

    Returns:
        Formatted string
    """
    if "error" in heatmap:
        return f"Error: {heatmap['error']}"

    data = heatmap['data']
    if not data:
        return "No data available"

    # Get sorted days
    days = sorted(data.keys())

    lines = []
    lines.append(f"\n=== Uptime Heatmap (Last {heatmap['days']} days) ===\n")

    # Header with hours
    header = "DATE       "
    for hour in range(0, 24, 2):
        header += f"{hour:>2} "
    lines.append(header)
    lines.append("-" * len(header))

    # Each day is a row
    for day in days:
        day_data = data[day]
        row = f"{day}  "

        for hour in range(0, 24, 2):
            if hour in day_data:
                uptime = day_data[hour]['uptime_pct']
                # Color code based on uptime
                if uptime >= 99.0:
                    char = "█"  # Perfect
                elif uptime >= 95.0:
                    char = "▓"  # Good
                elif uptime >= 90.0:
                    char = "▒"  # OK
                elif uptime > 0:
                    char = "░"  # Poor
                else:
                    char = " "  # Down
            else:
                char = "·"  # No data

            row += f" {char} "

        lines.append(row)

    # Legend
    lines.append("\nLegend: █ >99%  ▓ >95%  ▒ >90%  ░ <90%  · no data")

    return "\n".join(lines)


def detect_anomalies(db: Database, target_name: Optional[str] = None,
                     hours: int = 24, threshold_multiplier: float = 3.0) -> List[Dict[str, Any]]:
    """
    Detect latency anomalies using standard deviation

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
        threshold_multiplier: Number of standard deviations for anomaly

    Returns:
        List of anomaly events
    """
    # First get baseline stats
    stats = get_latency_percentiles(db, target_name, hours)
    if "error" in stats:
        return []

    mean = stats['mean']
    stdev = stats['stdev']
    threshold = mean + (threshold_multiplier * stdev)

    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return []
        where_clause, filter_params = build_target_filter_aliased(target_id, "l")
    else:
        where_clause = ""
        filter_params = ()

    # Find anomalies
    query = f"""
    SELECT
        timestamp,
        ping_ms,
        t.name as target_name
    FROM log l
    JOIN targets t ON l.target_id = t.id
    WHERE timestamp >= datetime('{cutoff}')
    AND ping_ms IS NOT NULL
    AND ping_ms > ?
    {where_clause}
    ORDER BY ping_ms DESC
    """

    cursor = db.conn.execute(query, (threshold,))
    anomalies = []

    for row in cursor.fetchall():
        sigma = (row[1] - mean) / stdev if stdev > 0 else 0
        anomalies.append({
            'timestamp': row[0],
            'latency': row[1],
            'target': row[2],
            'sigma': sigma,
            'threshold': threshold
        })

    return anomalies


def format_anomalies(anomalies: List[Dict[str, Any]],
                     baseline_mean: float, baseline_stdev: float) -> str:
    """
    Format anomalies for terminal output

    Args:
        anomalies: List of anomaly dictionaries
        baseline_mean: Baseline mean latency
        baseline_stdev: Baseline standard deviation

    Returns:
        Formatted string
    """
    if not anomalies:
        return "No anomalies detected"

    lines = []
    lines.append(f"\n=== {len(anomalies)} Anomalies Detected ===")
    lines.append(f"Baseline: {baseline_mean:.1f}ms ± {baseline_stdev:.1f}ms\n")
    lines.append(f"{'TIMESTAMP':<20}  {'LATENCY':<10}  {'SIGMA':<8}  TARGET")
    lines.append("-" * 60)

    for anomaly in anomalies[:50]:  # Limit to top 50
        ts = datetime.fromisoformat(anomaly['timestamp']).strftime('%Y-%m-%d %H:%M:%S')
        lines.append(
            f"{ts:<20}  "
            f"{anomaly['latency']:>7.1f}ms  "
            f"{anomaly['sigma']:>6.1f}σ  "
            f"{anomaly['target']}"
        )

    if len(anomalies) > 50:
        lines.append(f"\n... and {len(anomalies) - 50} more")

    return "\n".join(lines)


def correlate_targets(db: Database, hours: int = 24) -> Dict[str, Any]:
    """
    Correlate downtime between targets to identify common causes

    Args:
        db: Database instance
        hours: Hours to look back

    Returns:
        Correlation data
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    # Get all targets
    cursor = db.conn.execute("SELECT id, name FROM targets")
    targets = cursor.fetchall()

    if len(targets) < 2:
        return {"error": "Need at least 2 targets for correlation"}

    # For each target, get offline timestamps
    target_downtimes = {}
    for target_id, target_name in targets:
        cursor = db.conn.execute(
            """
            SELECT timestamp
            FROM log
            WHERE target_id = ?
            AND timestamp >= datetime(?)
            AND (status = 'OFFLINE' OR status = 'TIMEOUT')
            """,
            (target_id, cutoff)
        )
        target_downtimes[target_name] = set(row[0] for row in cursor.fetchall())

    # Calculate overlaps
    correlations = []
    target_names = list(target_downtimes.keys())

    for i in range(len(target_names)):
        for j in range(i + 1, len(target_names)):
            name1 = target_names[i]
            name2 = target_names[j]

            set1 = target_downtimes[name1]
            set2 = target_downtimes[name2]

            if not set1 or not set2:
                continue

            overlap = len(set1 & set2)
            total = len(set1 | set2)
            correlation = (overlap / total * 100.0) if total > 0 else 0.0

            correlations.append({
                'target1': name1,
                'target2': name2,
                'overlap': overlap,
                'total1': len(set1),
                'total2': len(set2),
                'correlation_pct': correlation
            })

    # Sort by correlation
    correlations.sort(key=lambda x: x['correlation_pct'], reverse=True)

    return {
        'correlations': correlations,
        'hours': hours
    }


def get_hourly_patterns(db: Database, target_name: Optional[str] = None,
                        days: int = 7) -> Dict[str, Any]:
    """
    Get average latency and uptime by hour of day (0-23)

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        days: Number of days to analyze

    Returns:
        Dictionary with hourly pattern data
    """
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter(target_id)
    else:
        where_clause = ""
        filter_params = ()

    query = f"""
    SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
        AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
        MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
        MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
    FROM log
    WHERE timestamp >= datetime('{cutoff}')
    {where_clause}
    GROUP BY hour
    ORDER BY hour
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    hourly_data = {}

    for row in cursor.fetchall():
        hour = row[0]
        total = row[1] or 0
        online = row[2] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        hourly_data[hour] = {
            'hour': hour,
            'total': total,
            'uptime_pct': uptime_pct,
            'avg_ping': row[3],
            'min_ping': row[4],
            'max_ping': row[5]
        }

    return {
        'data': hourly_data,
        'days': days,
        'target': target_name or 'all'
    }


def get_daily_patterns(db: Database, target_name: Optional[str] = None,
                       weeks: int = 4) -> Dict[str, Any]:
    """
    Get average latency and uptime by day of week (0=Mon, 6=Sun)

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        weeks: Number of weeks to analyze

    Returns:
        Dictionary with daily pattern data
    """
    cutoff = (datetime.utcnow() - timedelta(weeks=weeks)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
        where_clause, filter_params = build_target_filter(target_id)
    else:
        where_clause = ""
        filter_params = ()

    query = f"""
    SELECT
        CAST(strftime('%w', timestamp) AS INTEGER) as dow,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online,
        AVG(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as avg_ping,
        MIN(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as min_ping,
        MAX(CASE WHEN ping_ms IS NOT NULL THEN ping_ms END) as max_ping
    FROM log
    WHERE timestamp >= datetime('{cutoff}')
    {where_clause}
    GROUP BY dow
    ORDER BY dow
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    daily_data = {}

    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    for row in cursor.fetchall():
        dow = row[0]  # 0=Sunday in SQLite
        total = row[1] or 0
        online = row[2] or 0
        uptime_pct = (online / total * 100.0) if total > 0 else 0.0

        daily_data[dow] = {
            'dow': dow,
            'day_name': day_names[dow],
            'total': total,
            'uptime_pct': uptime_pct,
            'avg_ping': row[3],
            'min_ping': row[4],
            'max_ping': row[5]
        }

    return {
        'data': daily_data,
        'weeks': weeks,
        'target': target_name or 'all'
    }


def plot_hourly_patterns(db: Database, target_name: Optional[str] = None,
                         days: int = 7) -> None:
    """
    Plot hourly patterns using plotext

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        days: Number of days to analyze
    """
    if not HAS_PLOTEXT:
        print("plotext not installed")
        return

    pattern_data = get_hourly_patterns(db, target_name, days)

    if "error" in pattern_data:
        print(f"Error: {pattern_data['error']}")
        return

    data = pattern_data['data']
    if not data:
        print("No data available")
        return

    # Ensure all hours are present (fill gaps with None)
    hours = list(range(24))
    avg_pings = [data[h]['avg_ping'] if h in data and data[h]['avg_ping'] else None for h in hours]
    uptimes = [data[h]['uptime_pct'] if h in data else 0.0 for h in hours]

    # Create dual-axis plot
    plt.clear_figure()
    plt.theme('dark')

    # Plot average latency
    plt.plot(hours, avg_pings, color="cyan+", marker="braille", label="Avg Latency")

    plt.title(f"Hourly Patterns - Last {days} days{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Hour of Day (UTC)")
    plt.ylabel("Latency (ms)")

    # Show all hours
    plt.xticks(list(range(0, 24, 3)))

    plt.show()

    # Show uptime separately
    print("\nUptime by Hour:")
    print(f"{'HOUR':<6}  {'UPTIME':<8}  {'AVG PING':<10}  SAMPLES")
    print("-" * 40)
    for h in hours:
        if h in data:
            avg_ping = f"{data[h]['avg_ping']:.1f}ms" if data[h]['avg_ping'] else "N/A"
            print(f"{h:02d}:00  {data[h]['uptime_pct']:>6.2f}%  {avg_ping:<10}  {data[h]['total']:>6}")


def plot_daily_patterns(db: Database, target_name: Optional[str] = None,
                        weeks: int = 4) -> None:
    """
    Plot daily patterns using plotext

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        weeks: Number of weeks to analyze
    """
    if not HAS_PLOTEXT:
        print("plotext not installed")
        return

    pattern_data = get_daily_patterns(db, target_name, weeks)

    if "error" in pattern_data:
        print(f"Error: {pattern_data['error']}")
        return

    data = pattern_data['data']
    if not data:
        print("No data available")
        return

    day_names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    days = list(range(7))
    avg_pings = [data[d]['avg_ping'] if d in data and data[d]['avg_ping'] else None for d in days]
    uptimes = [data[d]['uptime_pct'] if d in data else 0.0 for d in days]

    # Create bar chart
    plt.clear_figure()
    plt.theme('dark')

    plt.bar(days, avg_pings, color="magenta+", marker="hd", width=0.6, label="Avg Latency")

    plt.title(f"Daily Patterns - Last {weeks} weeks{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Day of Week")
    plt.ylabel("Latency (ms)")

    plt.xticks(days, day_names)

    plt.show()

    # Show uptime table
    print("\nUptime by Day:")
    print(f"{'DAY':<10}  {'UPTIME':<8}  {'AVG PING':<10}  SAMPLES")
    print("-" * 45)
    for d in days:
        if d in data:
            avg_ping = f"{data[d]['avg_ping']:.1f}ms" if data[d]['avg_ping'] else "N/A"
            print(f"{data[d]['day_name']:<10}  {data[d]['uptime_pct']:>6.2f}%  {avg_ping:<10}  {data[d]['total']:>6}")


def get_jitter_data(db: Database, target_name: Optional[str] = None,
                    hours: int = 24, bucket_minutes: int = 15) -> Dict[str, Any]:
    """
    Calculate jitter (latency variance) over time

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes

    Returns:
        Dictionary with jitter data
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    if target_name:
        target_id = db.get_target_id(target_name)
        if not target_id:
            return {"error": f"Target '{target_name}' not found"}
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
    )
    SELECT
        bucket,
        AVG(ping_ms) as avg_ping,
        MIN(ping_ms) as min_ping,
        MAX(ping_ms) as max_ping,
        COUNT(*) as samples
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
    """

    cursor = db.conn.execute(query, (cutoff,) + filter_params)
    jitter_data = []

    for row in cursor.fetchall():
        bucket = row[0]
        avg_ping = row[1]
        min_ping = row[2]
        max_ping = row[3]
        samples = row[4]

        # Calculate jitter as max - min in this bucket
        jitter = max_ping - min_ping if max_ping and min_ping else 0.0

        jitter_data.append({
            'bucket': bucket,
            'avg_ping': avg_ping,
            'min_ping': min_ping,
            'max_ping': max_ping,
            'jitter': jitter,
            'samples': samples
        })

    return {
        'data': jitter_data,
        'hours': hours,
        'target': target_name or 'all'
    }


def plot_jitter(db: Database, target_name: Optional[str] = None,
                hours: int = 24) -> None:
    """
    Plot jitter (latency variance) using plotext

    Args:
        db: Database instance
        target_name: Target name filter (None = all targets)
        hours: Hours to look back
    """
    if not HAS_PLOTEXT:
        print("plotext not installed")
        return

    jitter_result = get_jitter_data(db, target_name, hours)

    if "error" in jitter_result:
        print(f"Error: {jitter_result['error']}")
        return

    data = jitter_result['data']
    if not data:
        print("No data available")
        return

    # Extract data
    times = [d['bucket'] for d in data]
    avg_pings = [d['avg_ping'] for d in data]
    jitters = [d['jitter'] for d in data]

    # Create plot
    plt.clear_figure()
    plt.theme('dark')

    x_values = list(range(len(times)))

    # Plot average latency
    plt.plot(x_values, avg_pings, color="cyan+", marker="braille", label="Avg Latency")

    # Plot jitter as separate line
    plt.plot(x_values, jitters, color="yellow+", marker="braille", label="Jitter (variance)")

    plt.title(f"Latency & Jitter - Last {hours}h{' (' + target_name + ')' if target_name else ''}")
    plt.xlabel("Time")
    plt.ylabel("Milliseconds")

    # Show time labels
    step = max(1, len(times) // 10)
    labels = [times[i][-5:] if i < len(times) else "" for i in range(0, len(times), step)]
    label_positions = list(range(0, len(times), step))
    plt.xticks(label_positions, labels)

    plt.show()

    # Show statistics
    avg_jitter = statistics.mean(jitters) if jitters else 0.0
    max_jitter = max(jitters) if jitters else 0.0

    print(f"\nJitter Statistics:")
    print(f"  Average Jitter: {avg_jitter:.2f}ms")
    print(f"  Maximum Jitter: {max_jitter:.2f}ms")
    print(f"  Quality: ", end="")

    if avg_jitter < 10:
        print("Excellent (low jitter, very stable)")
    elif avg_jitter < 30:
        print("Good (moderate jitter)")
    elif avg_jitter < 50:
        print("Fair (noticeable jitter, may affect VoIP/gaming)")
    else:
        print("Poor (high jitter, connection unstable)")


def format_correlations(corr_data: Dict[str, Any]) -> str:
    """
    Format correlation data for terminal output

    Args:
        corr_data: Correlation data dictionary

    Returns:
        Formatted string
    """
    if "error" in corr_data:
        return f"Error: {corr_data['error']}"

    correlations = corr_data['correlations']
    if not correlations:
        return "No correlations found (no overlapping downtime)"

    lines = []
    lines.append(f"\n=== Target Correlation Analysis (Last {corr_data['hours']}h) ===\n")
    lines.append(f"{'TARGET 1':<20}  {'TARGET 2':<20}  {'OVERLAP':<8}  CORRELATION")
    lines.append("-" * 70)

    for corr in correlations:
        lines.append(
            f"{corr['target1']:<20}  "
            f"{corr['target2']:<20}  "
            f"{corr['overlap']:<8}  "
            f"{corr['correlation_pct']:>5.1f}%"
        )

    lines.append("\nHigh correlation suggests common root cause (ISP issue, etc.)")

    return "\n".join(lines)
