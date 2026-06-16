"""Tests for battery-monitor battery module"""
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from battmon.battery import BatteryInfo

class TestBatteryInfo:
    def test_battery_info_creation(self):
        info = BatteryInfo(
            percentage=75.0,
            status='charging',
            voltage=12.6,
            current=2.5,
            power=31.5,
            temperature=25.0
        )
        assert info.percentage == 75.0
        assert info.status == 'charging'
        assert info.voltage == 12.6

    def test_battery_info_defaults(self):
        info = BatteryInfo(50.0, 'discharging')
        assert info.percentage == 50.0
        assert info.status == 'discharging'

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
