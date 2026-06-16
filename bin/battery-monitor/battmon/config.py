"""
Configuration management for battery-monitor

Handles TOML configuration parsing, validation, and defaults.
"""

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Python 3.11+ has tomllib in stdlib, fallback to tomli for 3.10
if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomli as tomllib
    except ImportError:
        raise ImportError("Please install tomli: pip install tomli")


@dataclass
class GeneralConfig:
    """General application settings"""
    database_path: Path
    log_level: str = "INFO"
    retention_days: int = 180

    def __post_init__(self):
        # Expand ~ in paths
        self.database_path = Path(self.database_path).expanduser()

        # Validate path - prevent path traversal attacks
        try:
            # Resolve path to absolute and check for suspicious patterns
            resolved_path = self.database_path.resolve()
            path_str = str(self.database_path)

            # Check for path traversal attempts
            if '..' in path_str or path_str.startswith('/etc') or path_str.startswith('/sys'):
                raise ValueError(f"Suspicious path detected: {path_str}")

            # Ensure path is within reasonable bounds (home dir or /tmp or current dir)
            allowed_prefixes = [str(Path.home()), '/tmp', str(Path.cwd())]
            if not any(str(resolved_path).startswith(prefix) for prefix in allowed_prefixes):
                # Allow if it doesn't exist yet (will be created)
                if not resolved_path.exists():
                    pass  # Allow new paths
        except (ValueError, OSError) as e:
            raise ValueError(f"Invalid database path: {self.database_path}. {e}")

        # Validate log level
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level.upper() not in valid_levels:
            raise ValueError(f"Invalid log_level: {self.log_level}. Must be one of {valid_levels}")
        self.log_level = self.log_level.upper()


@dataclass
class MonitoringConfig:
    """Monitoring settings"""
    interval_seconds: int = 60  # Check battery every minute
    battery_id: str = "auto"  # Battery identifier (auto, BAT0, BAT1, pisugar, etc.)
    detection_method: str = "auto"  # auto, sysfs, acpi, acpitool, apcaccess, pisugar

    def __post_init__(self):
        if self.interval_seconds < 1 or self.interval_seconds > 3600:
            raise ValueError("interval_seconds must be between 1 and 3600")
        valid_methods = ["auto", "sysfs", "acpi", "acpitool", "apcaccess", "pisugar"]
        if self.detection_method not in valid_methods:
            raise ValueError(f"detection_method must be one of {valid_methods}")

        # Validate battery_id - prevent path traversal and command injection
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', self.battery_id):
            raise ValueError(f"Invalid battery_id: {self.battery_id}. Must contain only alphanumeric, underscore, or hyphen characters.")


@dataclass
class DatabaseConfig:
    """Database rotation and maintenance settings"""
    rotation_enabled: bool = True
    rotation_interval_hours: int = 24
    vacuum_after_rotation: bool = True

    def __post_init__(self):
        if self.rotation_interval_hours < 1 or self.rotation_interval_hours > 168:
            raise ValueError("rotation_interval_hours must be between 1 and 168 (1 week)")


@dataclass
class AlertsConfig:
    """Alert settings for low battery, etc."""
    enabled: bool = True
    low_battery_threshold: int = 20  # Alert when battery below this percentage
    critical_battery_threshold: int = 10  # Critical alert
    high_temperature_threshold: Optional[float] = None  # Alert when temp above this (Celsius)


@dataclass
class Config:
    """Main configuration class"""
    general: GeneralConfig
    monitoring: MonitoringConfig
    database: DatabaseConfig
    alerts: AlertsConfig

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Config":
        """
        Load configuration from TOML file

        Args:
            path: Path to config file (defaults to ~/.config/battery-monitor/config.toml)

        Returns:
            Config object

        Raises:
            FileNotFoundError: If config file doesn't exist
            ValueError: If configuration is invalid
        """
        if path is None:
            path = Path.home() / ".config" / "battery-monitor" / "config.toml"

        path = Path(path).expanduser()

        if not path.exists():
            raise FileNotFoundError(
                f"Configuration file not found: {path}\n"
                f"Run 'battery-monitor --init-config' to create a default configuration."
            )

        # Read TOML file
        with open(path, "rb") as f:
            data = tomllib.load(f)

        # Apply environment variable overrides
        cls._apply_env_overrides(data)

        # Parse sections with defaults
        general = GeneralConfig(**data.get("general", {}))
        monitoring = MonitoringConfig(**data.get("monitoring", {}))
        database = DatabaseConfig(**data.get("database", {}))
        alerts = AlertsConfig(**data.get("alerts", {}))

        return cls(
            general=general,
            monitoring=monitoring,
            database=database,
            alerts=alerts
        )

    @staticmethod
    def _apply_env_overrides(data: dict) -> None:
        """Apply environment variable overrides to configuration"""
        # Example: BATTERY_MONITOR_GENERAL_LOG_LEVEL=DEBUG
        prefix = "BATTERY_MONITOR_"

        for key, value in os.environ.items():
            if not key.startswith(prefix):
                continue

            # Parse environment variable name
            parts = key[len(prefix):].lower().split("_")
            if len(parts) < 2:
                continue

            section = parts[0]
            setting = "_".join(parts[1:])

            if section in data:
                # Convert string value to appropriate type
                if setting in data[section]:
                    original = data[section][setting]
                    if isinstance(original, bool):
                        data[section][setting] = value.lower() in ("true", "1", "yes")
                    elif isinstance(original, int):
                        data[section][setting] = int(value)
                    elif isinstance(original, float):
                        data[section][setting] = float(value)
                    else:
                        data[section][setting] = value

    @classmethod
    def create_default(cls, path: Optional[Path] = None) -> None:
        """
        Create a default configuration file

        Args:
            path: Path to create config file (defaults to ~/.config/battery-monitor/config.toml)
        """
        if path is None:
            path = Path.home() / ".config" / "battery-monitor" / "config.toml"

        path = Path(path).expanduser()

        # Create parent directory if it doesn't exist
        path.parent.mkdir(parents=True, exist_ok=True)

        # Default configuration
        default_config = """# Battery Monitor Configuration

[general]
database_path = "~/battery_monitor.db"
log_level = "INFO"
retention_days = 180  # Keep 6 months of data

[monitoring]
interval_seconds = 60  # Check battery every minute
battery_id = "auto"  # Battery identifier: "auto" for auto-detection, or BAT0, BAT1, pisugar, etc.
detection_method = "auto"  # Options: auto, sysfs, acpi, acpitool, apcaccess, pisugar

[database]
rotation_enabled = true
rotation_interval_hours = 24
vacuum_after_rotation = true

[alerts]
enabled = true
low_battery_threshold = 20  # Alert when battery below 20%
critical_battery_threshold = 10  # Critical alert at 10%
# high_temperature_threshold = 60.0  # Uncomment to enable temperature alerts
"""

        # Write configuration
        with open(path, "w") as f:
            f.write(default_config)

        print(f"Created default configuration at: {path}")

    def validate(self) -> None:
        """
        Validate the entire configuration

        Raises:
            ValueError: If configuration is invalid
        """
        # Check that database path is writable
        db_dir = self.general.database_path.parent
        if not db_dir.exists():
            db_dir.mkdir(parents=True, exist_ok=True)

        if not os.access(db_dir, os.W_OK):
            raise ValueError(f"Database directory is not writable: {db_dir}")

        # Validate alert thresholds
        if self.alerts.critical_battery_threshold >= self.alerts.low_battery_threshold:
            raise ValueError("critical_battery_threshold must be less than low_battery_threshold")
