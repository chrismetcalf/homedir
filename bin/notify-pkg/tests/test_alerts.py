"""
Tests for notify.alerts module
"""

import pytest
from pathlib import Path
import tempfile
import shutil

from notify.alerts import AlertConfig, AlertThreshold, AlertManager


class TestAlertConfig:
    """Test AlertConfig class"""

    @pytest.fixture
    def temp_config_dir(self):
        """Create a temporary config directory"""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def config_path(self, temp_config_dir):
        """Return a temporary config file path"""
        return temp_config_dir / "test-app" / "alerts.toml"

    def test_default_config_creation(self, config_path):
        """Test default alert configuration"""
        config = AlertConfig(config_path, app_name="test-app")

        assert config.alerts['enabled'] is False
        assert config.alerts['notifications']['wall'] is False
        assert config.alerts['notifications']['pushover'] is False
        assert config.alerts['thresholds'] == {}

    def test_set_threshold(self, config_path):
        """Test setting a threshold"""
        config = AlertConfig(config_path, app_name="test-app")

        config.set_threshold('cpu_usage', 80.0)
        config.set_threshold('memory_usage', 90.0)

        assert config.get_threshold('cpu_usage') == 80.0
        assert config.get_threshold('memory_usage') == 90.0

    def test_get_threshold_with_default(self, config_path):
        """Test getting threshold with default value"""
        config = AlertConfig(config_path, app_name="test-app")

        value = config.get_threshold('nonexistent', default=50.0)

        assert value == 50.0

    def test_enable_disable_alerts(self, config_path):
        """Test enabling and disabling alerts"""
        config = AlertConfig(config_path, app_name="test-app")

        config.enable()
        assert config.is_enabled() is True

        config.disable()
        assert config.is_enabled() is False

    def test_enable_wall_notification(self, config_path):
        """Test enabling wall notifications"""
        config = AlertConfig(config_path, app_name="test-app")

        config.enable_notification('wall')

        assert config.alerts['notifications']['wall'] is True
        assert config.is_enabled() is True

    def test_enable_pushover_notification(self, config_path):
        """Test enabling Pushover notifications"""
        config = AlertConfig(config_path, app_name="test-app")

        config.enable_notification(
            'pushover',
            user_key='test_key',
            api_token='test_token'
        )

        assert config.alerts['notifications']['pushover'] is True
        user_key, api_token = config.get_pushover_credentials()
        assert user_key == 'test_key'
        assert api_token == 'test_token'

    def test_disable_notification(self, config_path):
        """Test disabling a notification method"""
        config = AlertConfig(config_path, app_name="test-app")
        config.enable_notification('wall')
        config.enable_notification('pushover', user_key='key', api_token='token')

        config.disable_notification('wall')

        assert config.alerts['notifications']['wall'] is False
        assert config.is_enabled() is True  # Pushover still enabled

    def test_disable_all_notifications_disables_alerts(self, config_path):
        """Test that disabling all methods disables alerts"""
        config = AlertConfig(config_path, app_name="test-app")
        config.enable_notification('wall')

        config.disable_notification('wall')

        assert config.is_enabled() is False

    def test_config_persistence(self, config_path):
        """Test that alert configuration persists"""
        config1 = AlertConfig(config_path, app_name="test-app")
        config1.set_threshold('test_threshold', 100.0)
        config1.enable_notification('wall')

        # Load in new instance
        config2 = AlertConfig(config_path, app_name="test-app")

        assert config2.get_threshold('test_threshold') == 100.0
        assert config2.alerts['notifications']['wall'] is True

    def test_format_config(self, config_path):
        """Test formatting configuration for display"""
        config = AlertConfig(config_path, app_name="test-app")
        config.enable_notification('pushover', user_key='key', api_token='token')
        config.set_threshold('threshold1', 50.0)

        output = config.format_config()

        assert "test-app" in output.lower()
        assert "ENABLED" in output
        assert "Pushover" in output
        assert "configured" in output


class TestAlertThreshold:
    """Test AlertThreshold class"""

    def test_threshold_check_exceeds(self):
        """Test threshold check when value exceeds"""
        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda current, limit: (
                "High CPU",
                f"CPU at {current}%",
                "high"
            )
        )

        result = threshold.check(85.0)

        assert result is not None
        title, message, priority = result
        assert title == "High CPU"
        assert "85" in message
        assert priority == "high"

    def test_threshold_check_not_exceeded(self):
        """Test threshold check when value is below threshold"""
        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda current, limit: (
                "High CPU",
                f"CPU at {current}%",
                "high"
            )
        )

        result = threshold.check(70.0)

        assert result is None


class TestAlertManager:
    """Test AlertManager class"""

    @pytest.fixture
    def temp_config_dir(self):
        """Create a temporary config directory"""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def alert_config(self, temp_config_dir):
        """Create an AlertConfig instance"""
        config_path = temp_config_dir / "test-app" / "alerts.toml"
        config = AlertConfig(config_path, app_name="test-app")
        config.enable()
        return config

    def test_add_threshold(self, alert_config):
        """Test adding a threshold"""
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="test",
            value=100.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: ("Title", "Message", "normal")
        )

        manager.add_threshold(threshold)

        assert len(manager.thresholds) == 1

    def test_check_all_with_exceeded_threshold(self, alert_config):
        """Test checking all thresholds with one exceeded"""
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: (
                "High CPU",
                f"CPU at {c}%",
                "high"
            )
        )
        manager.add_threshold(threshold)

        alerts = manager.check_all({'cpu': 90.0})

        assert len(alerts) == 1
        title, message, priority = alerts[0]
        assert title == "High CPU"
        assert "90" in message

    def test_check_all_no_exceeded_thresholds(self, alert_config):
        """Test checking all thresholds with none exceeded"""
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: ("Title", "Message", "normal")
        )
        manager.add_threshold(threshold)

        alerts = manager.check_all({'cpu': 70.0})

        assert len(alerts) == 0

    def test_check_all_alerts_disabled(self, alert_config):
        """Test that no alerts fire when globally disabled"""
        alert_config.disable()
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: ("Title", "Message", "normal")
        )
        manager.add_threshold(threshold)

        alerts = manager.check_all({'cpu': 90.0})

        assert len(alerts) == 0

    def test_suppress_alert(self, alert_config):
        """Test alert suppression"""
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: ("Title", "Message", "normal")
        )
        manager.add_threshold(threshold)

        # Suppress the alert
        manager.suppress_alert('cpu', True)

        alerts = manager.check_all({'cpu': 90.0})

        assert len(alerts) == 0

    def test_unsuppress_alert(self, alert_config):
        """Test unsuppressing an alert"""
        manager = AlertManager(alert_config)

        threshold = AlertThreshold(
            name="cpu",
            value=80.0,
            condition=lambda current, limit: current > limit,
            message_formatter=lambda c, l: ("Title", "Message", "normal")
        )
        manager.add_threshold(threshold)

        # Suppress then unsuppress
        manager.suppress_alert('cpu', True)
        manager.suppress_alert('cpu', False)

        alerts = manager.check_all({'cpu': 90.0})

        assert len(alerts) == 1
