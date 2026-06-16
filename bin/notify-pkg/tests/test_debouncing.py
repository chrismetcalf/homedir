"""
Tests for alert debouncing functionality
"""

import pytest
import time

from notify.alerts import AlertDebouncer, HysteresisDebouncer


class TestAlertDebouncer:
    """Test AlertDebouncer class"""

    def test_first_alert_allowed(self):
        """First alert should always be allowed"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        assert debouncer.should_alert("test_alert") is True

    def test_alert_within_cooldown_blocked(self):
        """Alert within cooldown period should be blocked"""
        debouncer = AlertDebouncer(cooldown_seconds=2)

        # First alert
        assert debouncer.should_alert("test_alert") is True
        debouncer.record_alert("test_alert")

        # Immediate retry - should be blocked
        assert debouncer.should_alert("test_alert") is False

    def test_alert_after_cooldown_allowed(self):
        """Alert after cooldown should be allowed"""
        debouncer = AlertDebouncer(cooldown_seconds=1)

        # First alert
        assert debouncer.should_alert("test_alert") is True
        debouncer.record_alert("test_alert")

        # Wait for cooldown
        time.sleep(1.1)

        # Should be allowed now
        assert debouncer.should_alert("test_alert") is True

    def test_different_alerts_independent(self):
        """Different alert keys should be independent"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        assert debouncer.should_alert("alert1") is True
        debouncer.record_alert("alert1")

        # Different alert should be allowed
        assert debouncer.should_alert("alert2") is True

    def test_cooldown_override(self):
        """Cooldown override should work"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        assert debouncer.should_alert("test", cooldown_override=1) is True
        debouncer.record_alert("test")

        # With default cooldown (60s), should be blocked
        assert debouncer.should_alert("test") is False

        # With override (1s), wait and should be allowed
        time.sleep(1.1)
        assert debouncer.should_alert("test", cooldown_override=1) is True

    def test_record_alert_stores_value(self):
        """Recording alert should store the value"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        debouncer.record_alert("cpu", current_value=85.5)

        assert debouncer.last_alert_value["cpu"] == 85.5

    def test_reset_clears_alert(self):
        """Reset should allow immediate re-alert"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        assert debouncer.should_alert("test") is True
        debouncer.record_alert("test")

        # Should be blocked
        assert debouncer.should_alert("test") is False

        # Reset
        debouncer.reset("test")

        # Should be allowed again
        assert debouncer.should_alert("test") is True

    def test_reset_all(self):
        """Reset all should clear all alerts"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        debouncer.record_alert("alert1")
        debouncer.record_alert("alert2")
        debouncer.record_alert("alert3")

        assert len(debouncer.last_alert_time) == 3

        debouncer.reset_all()

        assert len(debouncer.last_alert_time) == 0
        assert debouncer.should_alert("alert1") is True
        assert debouncer.should_alert("alert2") is True

    def test_get_time_since_last(self):
        """Get time since last alert"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        # Never alerted
        assert debouncer.get_time_since_last("test") is None

        # Record and check
        debouncer.record_alert("test")
        time.sleep(0.1)

        time_since = debouncer.get_time_since_last("test")
        assert time_since is not None
        assert time_since >= 0.1

    def test_get_status(self):
        """Get debouncing status"""
        debouncer = AlertDebouncer(cooldown_seconds=60)

        debouncer.record_alert("alert1", current_value=100)
        debouncer.record_alert("alert2", current_value=200)

        status = debouncer.get_status()

        assert "alert1" in status
        assert "alert2" in status
        assert status["alert1"]["last_value"] == 100
        assert status["alert2"]["last_value"] == 200
        assert "seconds_ago" in status["alert1"]
        assert "can_alert_again_in" in status["alert1"]


class TestHysteresisDebouncer:
    """Test HysteresisDebouncer class"""

    def test_first_alert_when_threshold_exceeded(self):
        """First alert should fire when threshold exceeded"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=60,
            alert_threshold=80,
            reset_threshold=85,
            condition=lambda v, t: v >= t  # Alert when value >= threshold
        )

        # Value exceeds threshold
        assert debouncer.should_alert("cpu", current_value=90) is True

    def test_no_alert_when_threshold_not_exceeded(self):
        """No alert when threshold not exceeded"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=60,
            alert_threshold=80,
            reset_threshold=85,
            condition=lambda v, t: v >= t
        )

        # Value below threshold
        assert debouncer.should_alert("cpu", current_value=70) is False

    def test_hysteresis_prevents_immediate_reset(self):
        """Hysteresis should prevent immediate reset when value drops slightly"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=1,
            alert_threshold=80,
            reset_threshold=75,  # Must drop to 75 to reset
            condition=lambda v, t: v >= t
        )

        # Initial alert at 90
        assert debouncer.should_alert("cpu", current_value=90) is True
        debouncer.record_alert("cpu", current_value=90)

        # Drops to 78 (still above reset threshold of 75)
        time.sleep(1.1)
        assert debouncer.should_alert("cpu", current_value=78) is True

    def test_hysteresis_resets_when_crossing_threshold(self):
        """Alert should reset when value crosses reset threshold"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=60,
            alert_threshold=80,
            reset_threshold=75,
            condition=lambda v, t: v >= t
        )

        # Alert at 90
        assert debouncer.should_alert("cpu", current_value=90) is True
        debouncer.record_alert("cpu", current_value=90)

        # Drop to 70 (below reset threshold)
        assert debouncer.should_alert("cpu", current_value=70) is False

        # Alert should be reset now
        assert "cpu" not in debouncer.alerted_keys

        # Can alert again immediately when threshold exceeded
        assert debouncer.should_alert("cpu", current_value=85) is True

    def test_low_battery_scenario(self):
        """Test realistic low battery scenario"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=2,
            alert_threshold=20,  # Alert at 20%
            reset_threshold=25,  # Reset at 25%
            condition=lambda v, t: v <= t  # Alert when value <= threshold
        )

        # Battery drops to 19% - alert
        assert debouncer.should_alert("low_battery", current_value=19) is True
        debouncer.record_alert("low_battery", current_value=19)

        # Battery at 18% - no new alert (cooldown)
        assert debouncer.should_alert("low_battery", current_value=18) is False

        # Wait for cooldown
        time.sleep(2.1)

        # Battery still at 18% - alert again (cooldown elapsed)
        assert debouncer.should_alert("low_battery", current_value=18) is True
        debouncer.record_alert("low_battery", current_value=18)

        # Battery charged to 22% (above alert threshold but below reset)
        # Still in alert state
        time.sleep(2.1)
        assert debouncer.should_alert("low_battery", current_value=22) is True

        # Battery charged to 26% (above reset threshold)
        # Alert cleared
        assert debouncer.should_alert("low_battery", current_value=26) is False
        assert "low_battery" not in debouncer.alerted_keys

        # Battery drops again to 19% - new alert allowed immediately
        assert debouncer.should_alert("low_battery", current_value=19) is True

    def test_condition_cleared_resets_alert(self):
        """When condition clears, alert should reset"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=60,
            alert_threshold=80,
            reset_threshold=75,
            condition=lambda v, t: v >= t
        )

        # Alert at 90
        assert debouncer.should_alert("cpu", current_value=90) is True
        debouncer.record_alert("cpu", current_value=90)

        # Condition clears (value drops below alert threshold)
        assert debouncer.should_alert("cpu", current_value=70) is False

        # Alert state should be cleared
        assert "cpu" not in debouncer.alerted_keys

    def test_reset_clears_hysteresis_state(self):
        """Manual reset should clear hysteresis state"""
        debouncer = HysteresisDebouncer(
            cooldown_seconds=60,
            alert_threshold=80,
            reset_threshold=75,
            condition=lambda v, t: v >= t
        )

        assert debouncer.should_alert("cpu", current_value=90) is True
        debouncer.record_alert("cpu", current_value=90)

        assert "cpu" in debouncer.alerted_keys

        debouncer.reset("cpu")

        assert "cpu" not in debouncer.alerted_keys
        assert debouncer.should_alert("cpu", current_value=85) is True
