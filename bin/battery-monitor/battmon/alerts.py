"""
Alert configuration and notification utilities for battery-monitor

Uses the centralized notify package for all notification delivery.
"""

import logging
import sys
from pathlib import Path
from typing import Optional, Any, List

# Import from notify package
sys.path.insert(0, str(Path.home() / ".homedir" / "bin" / "notify-pkg"))
from notify import (
    AlertConfig, send_notification, HysteresisDebouncer,
    PRIORITY_QUIET, PRIORITY_NORMAL, PRIORITY_HIGH, PRIORITY_EMERGENCY
)
from notify.config import NotifyConfig

logger = logging.getLogger(__name__)

# Initialize debouncer with hysteresis for battery alerts
# Low battery: alert at 20%, reset at 25% (requires charging to 25% before clearing)
# Critical: alert at 10%, reset at 15%
LOW_BATTERY_DEBOUNCER = HysteresisDebouncer(
    cooldown_seconds=300,  # 5 minutes between repeat alerts
    alert_threshold=20,
    reset_threshold=25,
    condition=lambda v, t: v <= t  # Alert when battery <= threshold
)

CRITICAL_BATTERY_DEBOUNCER = HysteresisDebouncer(
    cooldown_seconds=180,  # 3 minutes for critical (more urgent)
    alert_threshold=10,
    reset_threshold=15,
    condition=lambda v, t: v <= t
)

# High temperature doesn't need hysteresis, just cooldown
from notify import AlertDebouncer
HIGH_TEMP_DEBOUNCER = AlertDebouncer(cooldown_seconds=600)  # 10 minutes


class BatteryAlertConfig(AlertConfig):
    """Battery-specific alert configuration"""

    def __init__(self, config_path: Optional[Path] = None):
        super().__init__(config_path, app_name="battery-monitor")

    def _default_config(self):
        """Get default battery monitoring configuration"""
        config = super()._default_config()
        config['thresholds'] = {
            'low_battery': 20.0,
            'critical_battery': 10.0,
            'high_temperature': 45.0,  # Celsius
            'full_charge': 95.0
        }
        return config

    def format_config(self, thresholds_formatter=None):
        """Format battery alert configuration"""
        def format_thresholds(thresholds):
            lines = ["Thresholds:"]
            lines.append(f"  Low battery:         {thresholds.get('low_battery', 20.0)}%")
            lines.append(f"  Critical battery:    {thresholds.get('critical_battery', 10.0)}%")
            lines.append(f"  Full charge:         {thresholds.get('full_charge', 95.0)}%")
            lines.append(f"  High temperature:    {thresholds.get('high_temperature', 45.0)}°C")
            return "\n".join(lines)

        return super().format_config(format_thresholds)


def check_battery_alerts(alert_config: BatteryAlertConfig, notify_config: NotifyConfig,
                        battery_info: Any, prev_status: Optional[str] = None) -> List[str]:
    """
    Check battery status and send alerts if needed

    Args:
        alert_config: BatteryAlertConfig instance
        notify_config: NotifyConfig instance
        battery_info: BatteryInfo object
        prev_status: Previous battery status

    Returns:
        List of alert types triggered
    """
    if not alert_config.is_enabled():
        return []

    thresholds = alert_config.alerts.get('thresholds', {})
    alerts_triggered = []

    # Check low battery (only when discharging)
    if battery_info.status == "Discharging" and battery_info.percentage is not None:
        critical_threshold = thresholds.get('critical_battery', 10.0)
        low_threshold = thresholds.get('low_battery', 20.0)

        # Update debouncer thresholds from config
        CRITICAL_BATTERY_DEBOUNCER.alert_threshold = critical_threshold
        CRITICAL_BATTERY_DEBOUNCER.reset_threshold = critical_threshold + 5
        LOW_BATTERY_DEBOUNCER.alert_threshold = low_threshold
        LOW_BATTERY_DEBOUNCER.reset_threshold = low_threshold + 5

        # Check critical battery with debouncing
        if CRITICAL_BATTERY_DEBOUNCER.should_alert('critical_battery', battery_info.percentage):
            send_notification(
                notify_config,
                "Critical Battery!",
                f"Battery at {battery_info.percentage:.1f}% - Charge immediately!",
                priority=PRIORITY_EMERGENCY,
                prefix="BATTERY"
            )
            CRITICAL_BATTERY_DEBOUNCER.record_alert('critical_battery', battery_info.percentage)
            alerts_triggered.append('critical_battery')

        # Check low battery with debouncing (only if not critical)
        elif LOW_BATTERY_DEBOUNCER.should_alert('low_battery', battery_info.percentage):
            send_notification(
                notify_config,
                "Low Battery",
                f"Battery at {battery_info.percentage:.1f}% - Please charge soon",
                priority=PRIORITY_NORMAL,
                prefix="BATTERY"
            )
            LOW_BATTERY_DEBOUNCER.record_alert('low_battery', battery_info.percentage)
            alerts_triggered.append('low_battery')

    # Check full charge (only when charging)
    if battery_info.status == "Charging" and battery_info.percentage is not None:
        full_threshold = thresholds.get('full_charge', 95.0)
        if battery_info.percentage >= full_threshold:
            send_notification(
                notify_config,
                "Battery Fully Charged",
                f"Battery at {battery_info.percentage:.1f}% - Fully charged",
                priority=PRIORITY_QUIET,
                prefix="BATTERY"
            )
            alerts_triggered.append('full_charge')

    # Check high temperature with debouncing
    if battery_info.temperature is not None:
        high_temp_threshold = thresholds.get('high_temperature', 45.0)
        if battery_info.temperature >= high_temp_threshold:
            if HIGH_TEMP_DEBOUNCER.should_alert('high_temperature', battery_info.temperature):
                send_notification(
                    notify_config,
                    "High Battery Temperature!",
                    f"Battery temperature at {battery_info.temperature:.1f}°C",
                    priority=PRIORITY_HIGH,
                    prefix="BATTERY"
                )
                HIGH_TEMP_DEBOUNCER.record_alert('high_temperature', battery_info.temperature)
                alerts_triggered.append('high_temperature')
        else:
            # Temperature normal, reset debouncer
            HIGH_TEMP_DEBOUNCER.reset('high_temperature')

    # Check status changes (power loss/restore)
    if prev_status and prev_status != battery_info.status:
        if prev_status == "Charging" and battery_info.status == "Discharging":
            send_notification(
                notify_config,
                "Power Disconnected",
                f"Battery now discharging ({battery_info.percentage:.1f}%)",
                priority=PRIORITY_QUIET,
                prefix="BATTERY"
            )
            alerts_triggered.append('power_lost')

        elif prev_status == "Discharging" and battery_info.status == "Charging":
            send_notification(
                notify_config,
                "Power Connected",
                f"Battery now charging ({battery_info.percentage:.1f}%)",
                priority=PRIORITY_QUIET,
                prefix="BATTERY"
            )
            alerts_triggered.append('power_restored')

    return alerts_triggered


# Backwards compatibility - use imports from notify instead
format_alerts_config = lambda config: config.format_config()
