"""
Alert configuration and management for notify

Provides a generic alert configuration system that can be used by
monitoring applications (battery-monitor, ping-monitor, etc.)
"""

import logging
import time
from pathlib import Path
from typing import Optional, Dict, Any, Callable, List
import tomli
import tomli_w

logger = logging.getLogger(__name__)


class AlertConfig:
    """Generic alert configuration manager"""

    def __init__(self, config_path: Optional[Path] = None, app_name: str = "notify"):
        """
        Initialize alert configuration

        Args:
            config_path: Path to alert configuration file
            app_name: Application name for default config path
        """
        if config_path is None:
            config_path = Path.home() / ".config" / app_name / "alerts.toml"

        self.config_path = config_path
        self.app_name = app_name
        self.alerts = self._load_alerts()

    def _load_alerts(self) -> Dict[str, Any]:
        """Load alert configuration"""
        if not self.config_path.exists():
            return self._default_config()

        try:
            with open(self.config_path, 'rb') as f:
                return tomli.load(f)
        except Exception as e:
            logger.warning(f"Failed to load alerts config: {e}, using defaults")
            return self._default_config()

    def _default_config(self) -> Dict[str, Any]:
        """Get default configuration"""
        return {
            'enabled': False,
            'notifications': {
                'wall': False,
                'pushover': False
            },
            'thresholds': {}
        }

    def save(self):
        """Save alert configuration"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'wb') as f:
            tomli_w.dump(self.alerts, f)

    def set_threshold(self, threshold_name: str, value: float):
        """Set alert threshold"""
        if 'thresholds' not in self.alerts:
            self.alerts['thresholds'] = {}
        self.alerts['thresholds'][threshold_name] = value
        self.save()

    def get_threshold(self, threshold_name: str, default: float = 0.0) -> float:
        """Get alert threshold value"""
        return self.alerts.get('thresholds', {}).get(threshold_name, default)

    def enable(self):
        """Enable alerts globally"""
        self.alerts['enabled'] = True
        self.save()

    def disable(self):
        """Disable alerts globally"""
        self.alerts['enabled'] = False
        self.save()

    def is_enabled(self) -> bool:
        """Check if alerts are enabled"""
        return self.alerts.get('enabled', False)

    def enable_notification(self, notification_type: str, **kwargs):
        """
        Enable a notification method

        Args:
            notification_type: Type of notification (wall, pushover)
            **kwargs: Additional configuration (e.g., user_key, api_token for pushover)
        """
        if 'notifications' not in self.alerts:
            self.alerts['notifications'] = {}

        if notification_type == 'wall':
            self.alerts['notifications']['wall'] = True
        elif notification_type == 'pushover':
            self.alerts['notifications']['pushover'] = True
            if 'user_key' in kwargs:
                self.alerts['notifications']['pushover_user_key'] = kwargs['user_key']
            if 'api_token' in kwargs:
                self.alerts['notifications']['pushover_api_token'] = kwargs['api_token']

        self.alerts['enabled'] = True
        self.save()

    def disable_notification(self, notification_type: str):
        """Disable a notification method"""
        if 'notifications' not in self.alerts:
            return

        if notification_type == 'wall':
            self.alerts['notifications']['wall'] = False
        elif notification_type == 'pushover':
            self.alerts['notifications']['pushover'] = False

        # Check if any notifications are still enabled
        any_enabled = any(
            v for k, v in self.alerts['notifications'].items()
            if k not in ('pushover_user_key', 'pushover_api_token') and isinstance(v, bool)
        )
        if not any_enabled:
            self.alerts['enabled'] = False

        self.save()

    def get_pushover_credentials(self) -> tuple:
        """Get Pushover credentials"""
        notifications = self.alerts.get('notifications', {})
        return (
            notifications.get('pushover_user_key'),
            notifications.get('pushover_api_token')
        )

    def format_config(self, thresholds_formatter: Optional[Callable] = None) -> str:
        """
        Format alerts configuration for terminal output

        Args:
            thresholds_formatter: Optional function to format threshold section

        Returns:
            Formatted string
        """
        lines = []
        lines.append(f"\n=== {self.app_name.title()} Alert Configuration ===\n")

        enabled = self.alerts.get('enabled', False)
        lines.append(f"Alerts: {'ENABLED' if enabled else 'DISABLED'}")

        lines.append("\nNotifications:")
        notifications = self.alerts.get('notifications', {})
        lines.append(f"  Wall:     {'✓' if notifications.get('wall') else '✗'}")
        pushover_enabled = notifications.get('pushover', False)
        lines.append(f"  Pushover: {'✓' if pushover_enabled else '✗'}")

        if pushover_enabled:
            user_key, api_token = self.get_pushover_credentials()
            lines.append("")
            lines.append("Pushover:")
            lines.append(f"  User key:  {'configured' if user_key else 'NOT SET'}")
            lines.append(f"  API token: {'configured' if api_token else 'NOT SET'}")

        if thresholds_formatter:
            lines.append("\n" + thresholds_formatter(self.alerts.get('thresholds', {})))
        else:
            lines.append("\nThresholds:")
            thresholds = self.alerts.get('thresholds', {})
            for name, value in thresholds.items():
                lines.append(f"  {name}: {value}")

        return "\n".join(lines)


class AlertThreshold:
    """
    Helper class for defining and checking alert thresholds
    """

    def __init__(self, name: str, value: float, condition: Callable[[float, float], bool],
                 message_formatter: Callable[[float, float], tuple]):
        """
        Initialize alert threshold

        Args:
            name: Threshold name
            value: Threshold value
            condition: Function(current, threshold) -> bool to check if alert should fire
            message_formatter: Function(current, threshold) -> (title, message, priority)
        """
        self.name = name
        self.value = value
        self.condition = condition
        self.message_formatter = message_formatter

    def check(self, current_value: float) -> Optional[tuple]:
        """
        Check if threshold is exceeded

        Args:
            current_value: Current value to check

        Returns:
            (title, message, priority) if threshold exceeded, None otherwise
        """
        if self.condition(current_value, self.value):
            return self.message_formatter(current_value, self.value)
        return None


class AlertManager:
    """
    Manages alerts and integrates with notify configuration
    """

    def __init__(self, alert_config: AlertConfig):
        """
        Initialize alert manager

        Args:
            alert_config: AlertConfig instance
        """
        self.alert_config = alert_config
        self.thresholds: List[AlertThreshold] = []
        self.suppress_alerts: Dict[str, bool] = {}  # For debouncing

    def add_threshold(self, threshold: AlertThreshold):
        """Add an alert threshold"""
        self.thresholds.append(threshold)

    def check_all(self, values: Dict[str, float]) -> List[tuple]:
        """
        Check all thresholds against current values

        Args:
            values: Dict of {threshold_name: current_value}

        Returns:
            List of (title, message, priority) tuples for alerts to send
        """
        if not self.alert_config.is_enabled():
            return []

        alerts = []
        for threshold in self.thresholds:
            if threshold.name in values:
                # Check if we should suppress this alert (debouncing)
                if self.suppress_alerts.get(threshold.name, False):
                    continue

                result = threshold.check(values[threshold.name])
                if result:
                    alerts.append(result)

        return alerts

    def send_alerts(self, from_notify_config, alerts: List[tuple], **kwargs):
        """
        Send alerts using notify configuration

        Args:
            from_notify_config: NotifyConfig instance
            alerts: List of (title, message, priority) tuples
            **kwargs: Additional parameters for send_notification
        """
        from .notifiers import send_notification

        for title, message, priority in alerts:
            send_notification(
                from_notify_config,
                title,
                message,
                priority=priority,
                **kwargs
            )

    def suppress_alert(self, threshold_name: str, suppress: bool = True):
        """
        Suppress/unsuppress an alert (for debouncing)

        Args:
            threshold_name: Name of threshold to suppress
            suppress: Whether to suppress (True) or unsuppress (False)
        """
        self.suppress_alerts[threshold_name] = suppress


class AlertDebouncer:
    """
    Prevents alert spam by tracking when alerts were last sent
    and enforcing cooldown periods.

    Usage:
        debouncer = AlertDebouncer(cooldown_seconds=300)  # 5 minutes

        # Check if we should send an alert
        if debouncer.should_alert("low_battery", current_value=15):
            send_notification(...)
            debouncer.record_alert("low_battery", current_value=15)

        # Reset when condition clears (e.g., battery charged)
        debouncer.reset("low_battery")
    """

    def __init__(self, cooldown_seconds: int = 300):
        """
        Initialize debouncer

        Args:
            cooldown_seconds: Minimum seconds between repeat alerts (default: 5 minutes)
        """
        self.cooldown_seconds = cooldown_seconds
        self.last_alert_time: Dict[str, float] = {}
        self.last_alert_value: Dict[str, Any] = {}

    def should_alert(self, alert_key: str, current_value: Any = None,
                     cooldown_override: Optional[int] = None) -> bool:
        """
        Check if an alert should be sent

        Args:
            alert_key: Unique identifier for this alert type
            current_value: Current value triggering the alert
            cooldown_override: Override cooldown for this specific check

        Returns:
            True if alert should be sent, False if still in cooldown
        """
        now = time.time()
        cooldown = cooldown_override if cooldown_override is not None else self.cooldown_seconds

        # First time seeing this alert
        if alert_key not in self.last_alert_time:
            return True

        # Check if cooldown has elapsed
        time_since_last = now - self.last_alert_time[alert_key]
        if time_since_last < cooldown:
            logger.debug(
                f"Alert '{alert_key}' suppressed: {time_since_last:.0f}s since last "
                f"(cooldown: {cooldown}s)"
            )
            return False

        return True

    def record_alert(self, alert_key: str, current_value: Any = None):
        """
        Record that an alert was sent

        Args:
            alert_key: Unique identifier for this alert type
            current_value: Value that triggered the alert
        """
        self.last_alert_time[alert_key] = time.time()
        if current_value is not None:
            self.last_alert_value[alert_key] = current_value

        logger.debug(f"Recorded alert: {alert_key} = {current_value}")

    def reset(self, alert_key: str):
        """
        Reset debouncing for an alert (allow immediate re-send)

        Use when condition clears (e.g., battery charged, server back online)

        Args:
            alert_key: Alert to reset
        """
        if alert_key in self.last_alert_time:
            del self.last_alert_time[alert_key]
        if alert_key in self.last_alert_value:
            del self.last_alert_value[alert_key]

        logger.debug(f"Reset debouncer for: {alert_key}")

    def reset_all(self):
        """Reset all alert debouncing"""
        self.last_alert_time.clear()
        self.last_alert_value.clear()
        logger.debug("Reset all alert debouncing")

    def get_time_since_last(self, alert_key: str) -> Optional[float]:
        """
        Get seconds since alert was last sent

        Args:
            alert_key: Alert to check

        Returns:
            Seconds since last alert, or None if never sent
        """
        if alert_key not in self.last_alert_time:
            return None

        return time.time() - self.last_alert_time[alert_key]

    def get_status(self) -> Dict[str, Dict[str, Any]]:
        """
        Get debouncing status for all alerts

        Returns:
            Dict of {alert_key: {last_time, last_value, seconds_ago}}
        """
        now = time.time()
        status = {}

        for alert_key, last_time in self.last_alert_time.items():
            status[alert_key] = {
                'last_time': last_time,
                'last_value': self.last_alert_value.get(alert_key),
                'seconds_ago': now - last_time,
                'can_alert_again_in': max(0, self.cooldown_seconds - (now - last_time))
            }

        return status


class HysteresisDebouncer(AlertDebouncer):
    """
    Debouncer with hysteresis - requires value to cross a recovery
    threshold before resetting.

    Useful for preventing flapping when value hovers near threshold.

    Example:
        # Low battery: alert at 20%, reset when charged to 25%
        debouncer = HysteresisDebouncer(
            cooldown_seconds=300,
            alert_threshold=20,
            reset_threshold=25,
            condition=lambda v, t: v <= t  # Alert when value <= threshold
        )
    """

    def __init__(self, cooldown_seconds: int = 300,
                 alert_threshold: float = 0,
                 reset_threshold: float = 0,
                 condition: Callable[[float, float], bool] = lambda v, t: v >= t):
        """
        Initialize hysteresis debouncer

        Args:
            cooldown_seconds: Minimum seconds between repeat alerts
            alert_threshold: Threshold that triggers alert
            reset_threshold: Threshold that clears alert state
            condition: Function(value, threshold) -> bool for checking alert
        """
        super().__init__(cooldown_seconds)
        self.alert_threshold = alert_threshold
        self.reset_threshold = reset_threshold
        self.condition = condition
        self.alerted_keys: set = set()  # Track which alerts are active

    def should_alert(self, alert_key: str, current_value: float,
                     cooldown_override: Optional[int] = None) -> bool:
        """
        Check if alert should fire with hysteresis

        Args:
            alert_key: Alert identifier
            current_value: Current measured value
            cooldown_override: Optional cooldown override

        Returns:
            True if should alert
        """
        # If we're in alerted state, check if we should exit (hysteresis)
        if alert_key in self.alerted_keys:
            # Check if we've crossed the reset threshold (in opposite direction)
            # For >= condition: reset when value < reset_threshold (reset_threshold > value)
            # For <= condition: reset when value > reset_threshold (value > reset_threshold)
            should_reset = self.condition(self.reset_threshold, current_value)

            if should_reset:
                # Crossed reset threshold, exit alerted state
                self.alerted_keys.remove(alert_key)
                self.reset(alert_key)
                logger.debug(
                    f"Alert '{alert_key}' reset via hysteresis at value={current_value}"
                )
                # After reset, check if we should immediately re-alert
                if self.condition(current_value, self.alert_threshold):
                    # Condition still met, allow immediate re-alert
                    return True
                else:
                    # Condition cleared
                    return False

            # Still in alerted state, check cooldown
            # We remain alerted even if current_value is between alert and reset thresholds
            return super().should_alert(alert_key, current_value, cooldown_override)

        # Not in alerted state - check if we should enter it
        if self.condition(current_value, self.alert_threshold):
            # Condition met, standard debounce check
            return super().should_alert(alert_key, current_value, cooldown_override)

        # Condition not met and not in alerted state
        return False

    def record_alert(self, alert_key: str, current_value: Any = None):
        """Record alert and mark as active"""
        super().record_alert(alert_key, current_value)
        self.alerted_keys.add(alert_key)

    def reset(self, alert_key: str):
        """Reset with hysteresis tracking"""
        super().reset(alert_key)
        if alert_key in self.alerted_keys:
            self.alerted_keys.remove(alert_key)

    def reset_all(self):
        """Reset all including hysteresis tracking"""
        super().reset_all()
        self.alerted_keys.clear()
