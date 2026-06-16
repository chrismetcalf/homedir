"""
Alert configuration and notification utilities for ping-monitor

Uses the centralized notify package for all notification delivery.
"""

import logging
import sys
from pathlib import Path
from typing import Optional, List, Dict

# Import from notify package
sys.path.insert(0, str(Path.home() / ".homedir" / "bin" / "notify-pkg"))
from notify import (
    AlertConfig, send_notification, AlertDebouncer,
    PRIORITY_NORMAL, PRIORITY_HIGH, PRIORITY_EMERGENCY
)
from notify.config import NotifyConfig

logger = logging.getLogger(__name__)

# Initialize debouncers for different alert types
# High latency: 5 minute cooldown
LATENCY_DEBOUNCER = AlertDebouncer(cooldown_seconds=300)

# Consecutive failures (target down): 10 minute cooldown
# We want to know quickly when it's down, but not spam if it stays down
DOWN_DEBOUNCER = AlertDebouncer(cooldown_seconds=600)

# Per-target debouncer cache
_target_debouncers: Dict[str, Dict[str, AlertDebouncer]] = {}


class PingAlertConfig(AlertConfig):
    """Ping monitor-specific alert configuration"""

    def __init__(self, config_path: Optional[Path] = None):
        super().__init__(config_path, app_name="ping-monitor")

    def _default_config(self):
        """Get default ping monitoring configuration"""
        config = super()._default_config()
        config['thresholds'] = {
            'downtime_pct_5m': 50.0,
            'downtime_pct_15m': 20.0,
            'latency_ms': 500.0,
            'consecutive_failures': 3
        }
        return config

    def format_config(self, thresholds_formatter=None):
        """Format ping alert configuration"""
        def format_thresholds(thresholds):
            lines = ["Thresholds:"]
            lines.append(f"  Downtime (5m):         {thresholds.get('downtime_pct_5m', 50.0)}%")
            lines.append(f"  Downtime (15m):        {thresholds.get('downtime_pct_15m', 20.0)}%")
            lines.append(f"  High latency:          {thresholds.get('latency_ms', 500.0)}ms")
            lines.append(f"  Consecutive failures:  {thresholds.get('consecutive_failures', 3)}")
            return "\n".join(lines)

        return super().format_config(format_thresholds)


def _get_target_debouncer(target_name: str, alert_type: str) -> AlertDebouncer:
    """
    Get or create a debouncer for a specific target and alert type

    Args:
        target_name: Target name
        alert_type: Type of alert (latency, down)

    Returns:
        AlertDebouncer instance
    """
    if target_name not in _target_debouncers:
        _target_debouncers[target_name] = {}

    if alert_type not in _target_debouncers[target_name]:
        # Create debouncer based on type
        if alert_type == 'latency':
            _target_debouncers[target_name][alert_type] = AlertDebouncer(cooldown_seconds=300)
        elif alert_type == 'down':
            _target_debouncers[target_name][alert_type] = AlertDebouncer(cooldown_seconds=600)
        else:
            _target_debouncers[target_name][alert_type] = AlertDebouncer(cooldown_seconds=300)

    return _target_debouncers[target_name][alert_type]


def check_and_alert(db, alert_config: PingAlertConfig, notify_config: NotifyConfig,
                    target_name: str, current_status: str,
                    ping_ms: Optional[float] = None) -> None:
    """
    Check thresholds and send alerts if needed (with debouncing)

    Args:
        db: Database instance
        alert_config: PingAlertConfig instance
        notify_config: NotifyConfig instance
        target_name: Target name
        current_status: Current status
        ping_ms: Current ping latency
    """
    if not alert_config.is_enabled():
        return

    thresholds = alert_config.alerts.get('thresholds', {})

    # Check latency threshold with debouncing
    if ping_ms and ping_ms > thresholds.get('latency_ms', 500.0):
        latency_debouncer = _get_target_debouncer(target_name, 'latency')

        if latency_debouncer.should_alert(f"{target_name}_latency", ping_ms):
            title = f"High Latency: {target_name}"
            message = f"Latency is {ping_ms:.1f}ms (threshold: {thresholds['latency_ms']}ms)"

            send_notification(
                notify_config,
                title,
                message,
                priority=PRIORITY_NORMAL,
                prefix="PING-MON"
            )
            latency_debouncer.record_alert(f"{target_name}_latency", ping_ms)
    else:
        # Latency normal, reset debouncer
        latency_debouncer = _get_target_debouncer(target_name, 'latency')
        latency_debouncer.reset(f"{target_name}_latency")

    # Check consecutive failures with debouncing
    if current_status in ('OFFLINE', 'TIMEOUT'):
        target_id = db.get_target_id(target_name)
        if target_id:
            # Get recent statuses
            cursor = db.conn.execute(
                """
                SELECT status
                FROM log
                WHERE target_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (target_id, thresholds.get('consecutive_failures', 3))
            )

            statuses = [row[0] for row in cursor.fetchall()]
            consecutive_threshold = thresholds.get('consecutive_failures', 3)

            if len(statuses) >= consecutive_threshold and \
               all(s in ('OFFLINE', 'TIMEOUT') for s in statuses):

                down_debouncer = _get_target_debouncer(target_name, 'down')

                if down_debouncer.should_alert(f"{target_name}_down"):
                    title = f"Target Down: {target_name}"
                    message = f"Target has been down for {consecutive_threshold} consecutive checks"

                    send_notification(
                        notify_config,
                        title,
                        message,
                        priority=PRIORITY_EMERGENCY,
                        prefix="PING-MON"
                    )
                    down_debouncer.record_alert(f"{target_name}_down")
    else:
        # Target is online, reset down debouncer
        down_debouncer = _get_target_debouncer(target_name, 'down')
        down_debouncer.reset(f"{target_name}_down")


# Backwards compatibility
format_alerts_config = lambda config: config.format_config()
