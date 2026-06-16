"""Tests for battery-monitor config module"""
import pytest
import tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from battmon.config import Config, GeneralConfig, MonitoringConfig

@pytest.fixture
def temp_config_file():
    with tempfile.NamedTemporaryFile(mode='w', suffix='.toml', delete=False) as f:
        f.write("""
[general]
database_path = "~/test.db"
log_level = "DEBUG"
retention_days = 60

[monitoring]
interval_seconds = 20
battery_id = "BAT0"
""")
        config_path = Path(f.name)
    yield config_path
    config_path.unlink(missing_ok=True)

class TestGeneralConfig:
    def test_valid_config(self):
        config = GeneralConfig(database_path=Path("~/test.db"), log_level="INFO")
        assert config.log_level == "INFO"

    def test_log_level_case_insensitive(self):
        config = GeneralConfig(database_path=Path("~/test.db"), log_level="debug")
        assert config.log_level == "DEBUG"

class TestMonitoringConfig:
    def test_valid_config(self):
        config = MonitoringConfig(interval_seconds=30, battery_id="BAT0")
        assert config.interval_seconds == 30
        assert config.battery_id == "BAT0"

    def test_interval_validation(self):
        with pytest.raises(ValueError):
            MonitoringConfig(interval_seconds=0, battery_id="BAT0")

class TestConfigLoading:
    def test_load_config(self, temp_config_file):
        config = Config.load(temp_config_file)
        assert config.general.log_level == "DEBUG"
        assert config.monitoring.interval_seconds == 20
        assert config.monitoring.battery_id == "BAT0"

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
