"""
Plotting utilities for battery-monitor

Provides time-series plots of battery metrics.
"""

import os
import shutil
from datetime import datetime, timedelta
from typing import Optional

from .database import Database


def plot_battery(db: Database, hours: int = 24, bucket_minutes: int = 15) -> None:
    """
    Plot battery percentage and charging status over time

    Args:
        db: Database instance
        hours: Hours to look back
        bucket_minutes: Bucket size in minutes
    """
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()

    # Query bucketed battery data using f-string for bucket_minutes
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

    # Simple ASCII plot
    print(f"\n=== Battery Level - Last {hours}h ===\n")

    # Get terminal width
    try:
        terminal_width = shutil.get_terminal_size().columns
    except:
        terminal_width = 80

    # Calculate plot dimensions
    height = 20
    y_axis_width = 6  # "100% |"
    width = terminal_width - y_axis_width - 2  # Leave room for margins

    # Determine x-axis sampling to fit terminal width
    if len(buckets) > width:
        # Downsample to fit width
        step = len(buckets) / width
        plot_buckets = []
        plot_percentages = []
        plot_charging = []

        for i in range(width):
            idx = int(i * step)
            if idx < len(buckets):
                plot_buckets.append(buckets[idx])
                plot_percentages.append(percentages[idx])
                plot_charging.append(charging_states[idx])
    elif len(buckets) < width:
        # Interpolate to expand to width
        plot_buckets = []
        plot_percentages = []
        plot_charging = []

        for i in range(width):
            # Map i to position in original data
            pos = (i / width) * len(buckets)
            idx = int(pos)

            if idx >= len(buckets):
                idx = len(buckets) - 1

            plot_buckets.append(buckets[idx])
            plot_percentages.append(percentages[idx])
            plot_charging.append(charging_states[idx])
    else:
        plot_buckets = buckets
        plot_percentages = percentages
        plot_charging = charging_states

    # Build a 2D array to draw the line chart
    chart = [[' ' for _ in range(len(plot_buckets))] for _ in range(height + 1)]

    # Draw the line connecting all points
    for i in range(len(plot_percentages)):
        pct = plot_percentages[i]
        is_charging = plot_charging[i]

        # Determine color
        if is_charging:
            color_start = "\033[34m"  # Blue
        elif pct >= 50:
            color_start = "\033[1;92m"  # Bold bright green
        elif pct >= 20:
            color_start = "\033[33m"  # Yellow
        else:
            color_start = "\033[31m"  # Red
        color_end = "\033[0m"

        # Calculate row position (inverted - high percentage at top)
        row = int((pct / 100.0) * height)
        row = max(0, min(height, row))

        if i == 0:
            # First point - just mark it
            chart[row][i] = f"{color_start}●{color_end}"
        else:
            # Connect to previous point
            prev_pct = plot_percentages[i-1]
            prev_row = int((prev_pct / 100.0) * height)
            prev_row = max(0, min(height, prev_row))

            # Draw connection between previous and current point
            if prev_row == row:
                # Horizontal line
                chart[row][i] = f"{color_start}─{color_end}"
            elif prev_row < row:
                # Going up
                steps = row - prev_row
                for step in range(steps + 1):
                    intermediate_row = prev_row + step
                    if step == 0:
                        chart[intermediate_row][i-1] = f"{color_start}╱{color_end}"
                    elif step == steps:
                        chart[intermediate_row][i] = f"{color_start}●{color_end}"
                    else:
                        chart[intermediate_row][i] = f"{color_start}╱{color_end}"
            else:
                # Going down
                steps = prev_row - row
                for step in range(steps + 1):
                    intermediate_row = prev_row - step
                    if step == 0:
                        chart[intermediate_row][i-1] = f"{color_start}╲{color_end}"
                    elif step == steps:
                        chart[intermediate_row][i] = f"{color_start}●{color_end}"
                    else:
                        chart[intermediate_row][i] = f"{color_start}╲{color_end}"

    # Print the chart from top to bottom
    for row in range(height, -1, -1):
        pct_value = row * 5

        # Y-axis label
        if row == height:
            print(f"100% |", end="")
        elif row == height // 2:
            print(f" 50% |", end="")
        elif row == 0:
            print(f"  0% |", end="")
        else:
            print(f"     |", end="")

        # Print the row
        for col in range(len(plot_buckets)):
            print(chart[row][col], end="")

        print()

    # X-axis
    print("     +" + "-" * len(plot_buckets))

    # Time labels - distribute evenly across the width
    num_labels = min(10, len(plot_buckets) // 5)  # Show up to 10 labels
    if num_labels < 2:
        num_labels = min(2, len(plot_buckets))

    time_labels = []
    time_positions = []

    if num_labels > 0:
        for i in range(num_labels):
            pos = int((i / (num_labels - 1)) * (len(plot_buckets) - 1)) if num_labels > 1 else 0
            if pos < len(plot_buckets):
                time_labels.append(plot_buckets[pos][-5:])
                time_positions.append(pos)

    time_row = " " * y_axis_width
    for pos in time_positions:
        time_row += " " * (pos - len(time_row) + y_axis_width) + "|"
    print(time_row[:y_axis_width + len(plot_buckets)])

    # Time label row
    label_row = [" "] * (y_axis_width + len(plot_buckets))
    for i, pos in enumerate(time_positions):
        if i < len(time_labels):
            label = time_labels[i]
            start = y_axis_width + pos - len(label) // 2
            if start >= y_axis_width and start + len(label) <= len(label_row):
                for j, char in enumerate(label):
                    label_row[start + j] = char
    print(''.join(label_row))

    print(f"\nLegend: \033[34m●\033[0m Charging  \033[1;92m●\033[0m >50%  \033[33m●\033[0m 20-50%  \033[31m●\033[0m <20%")
    print()
