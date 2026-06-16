"""
Waterfall chart visualization for battery-monitor

Provides a visual timeline of battery status over time.
"""

import shutil
from datetime import datetime, timedelta
from typing import Optional

from .database import Database


def plot_waterfall(db: Database, hours: int = 24, bucket_minutes: int = 15) -> None:
    """
    Plot waterfall chart showing battery status over time

    Row 1: Battery percentage (green=good, yellow=medium, red=low)
    Row 2: Charging status (blue=charging, black=discharging)

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    # Query bucketed battery data using parameterized query
    query = f"""
    WITH rounded AS (
        SELECT
            strftime('%Y-%m-%dT%H:%M', timestamp, 'localtime') AS ts,
            percentage,
            status
        FROM battery_log
        WHERE timestamp >= datetime(?)
        AND percentage IS NOT NULL
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
            percentage,
            status
        FROM rounded
    ),
    aggregated AS (
        SELECT
            bucket,
            ROUND(AVG(percentage), 1) as avg_pct,
            -- Count charging vs not charging
            SUM(CASE WHEN status = 'Charging' OR status = 'Full' THEN 1 ELSE 0 END) as charging_count,
            COUNT(*) as total
        FROM bucketed
        GROUP BY bucket
    )
    SELECT
        bucket,
        avg_pct,
        CASE WHEN charging_count > total / 2 THEN 1 ELSE 0 END as is_charging
    FROM aggregated
    ORDER BY bucket
    """

    cursor = db.conn.execute(query, (cutoff,))
    data = cursor.fetchall()

    if not data:
        print("No battery data available")
        return

    buckets = [row[0] for row in data]
    percentages = [row[1] for row in data]
    charging_states = [row[2] for row in data]

    # Get terminal width and limit buckets to fit
    try:
        terminal_width = shutil.get_terminal_size().columns
    except:
        terminal_width = 80

    label_width = 12  # "Battery %   "
    max_buckets = terminal_width - label_width - 2  # Leave room for margins

    # Truncate or sample data to fit terminal width
    if len(buckets) > max_buckets:
        # Sample evenly across the data
        step = len(buckets) / max_buckets
        display_percentages = []
        display_charging = []
        for i in range(max_buckets):
            idx = int(i * step)
            if idx < len(percentages):
                display_percentages.append(percentages[idx])
                display_charging.append(charging_states[idx])
    else:
        display_percentages = percentages
        display_charging = charging_states

    # Build waterfall chart
    print(f"\n=== Battery Waterfall - Last {hours}h ===\n")

    # Row 1: Battery percentage
    row1 = "Battery %   "
    for pct in display_percentages:
        if pct >= 50:
            char = "\033[1;92m█\033[0m"  # Bold bright green - good battery
        elif pct >= 20:
            char = "\033[33m█\033[0m"  # Yellow - medium battery
        else:
            char = "\033[31m█\033[0m"  # Red - low battery
        row1 += char
    print(row1)

    # Row 2: Charging status
    row2 = "Charging    "
    for is_charging in display_charging:
        if is_charging:
            char = "\033[34m█\033[0m"  # Blue - charging
        else:
            char = "\033[90m█\033[0m"  # Dark gray - discharging
        row2 += char
    print(row2)

    # Legend
    print(f"\nLegend:")
    print(f"  Battery:  \033[1;92m█\033[0m >50%  \033[33m█\033[0m 20-50%  \033[31m█\033[0m <20%")
    print(f"  Charging: \033[34m█\033[0m Charging  \033[90m█\033[0m Discharging")

    # Time scale at bottom - use display data length
    num_display = len(display_percentages)
    num_labels = min(10, num_display // 5)
    if num_labels < 2:
        num_labels = min(2, num_display)

    time_labels = []
    time_positions = []

    if num_labels > 0 and len(buckets) > 0:
        for i in range(num_labels):
            # Map display position back to original bucket
            display_pos = int((i / (num_labels - 1)) * (num_display - 1)) if num_labels > 1 else 0
            if len(buckets) > max_buckets:
                # Calculate original bucket index
                bucket_idx = int(display_pos * (len(buckets) / max_buckets))
            else:
                bucket_idx = display_pos

            if bucket_idx < len(buckets):
                time_labels.append(buckets[bucket_idx][-5:])
                time_positions.append(display_pos)

    # Time markers
    time_row = " " * label_width
    for pos in time_positions:
        time_row += " " * (pos - len(time_row) + label_width) + "|"
    print(f"\n{time_row[:label_width + num_display]}")

    # Time labels
    time_labels_row = [" "] * (label_width + num_display)
    for i, pos in enumerate(time_positions):
        if i < len(time_labels):
            label = time_labels[i]
            start_pos = label_width + pos - len(label) // 2
            if start_pos >= label_width and start_pos + len(label) <= len(time_labels_row):
                for j, char in enumerate(label):
                    time_labels_row[start_pos + j] = char

    print(''.join(time_labels_row))
    print()  # Empty line at end
