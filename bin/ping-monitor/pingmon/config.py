"""
Configuration management for ping-monitor

Handles TOML configuration parsing, validation, and defaults.
"""

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

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
    interval_seconds: int = 10
    ping_timeout: int = 5
    ping_count: int = 1

    def __post_init__(self):
        if self.interval_seconds < 1 or self.interval_seconds > 3600:
            raise ValueError("interval_seconds must be between 1 and 3600")
        if self.ping_timeout < 1 or self.ping_timeout > 30:
            raise ValueError("ping_timeout must be between 1 and 30")
        if self.ping_count < 1 or self.ping_count > 10:
            raise ValueError("ping_count must be between 1 and 10")


@dataclass
class LocationConfig:
    """Location tracking settings"""
    enabled: bool = True
    check_interval_minutes: int = 5
    geolocation_provider: str = "ipapi.co"
    cache_ttl_hours: int = 24

    def __post_init__(self):
        valid_providers = ["ipapi.co", "ip-api.com"]
        if self.geolocation_provider not in valid_providers:
            raise ValueError(f"geolocation_provider must be one of {valid_providers}")
        if self.check_interval_minutes < 1 or self.check_interval_minutes > 1440:
            raise ValueError("check_interval_minutes must be between 1 and 1440 (24 hours)")


@dataclass
class Target:
    """Target configuration (ping or HTTP)"""
    name: str
    host: str  # For ping: hostname/IP, for HTTP: full URL
    description: str = ""
    enabled: bool = True
    # HTTP-specific fields (optional)
    type: str = "ping"  # "ping" or "http"
    http_method: str = "GET"  # HTTP method for HTTP targets
    http_expected_status: Optional[int] = None  # Expected status code (None = any 2xx)
    http_verify_ssl: bool = True  # Verify SSL certificates
    http_timeout: int = 10  # HTTP request timeout in seconds

    def __post_init__(self):
        if not self.name:
            raise ValueError("Target name cannot be empty")
        if not self.host:
            raise ValueError("Target host cannot be empty")

        # Validate type
        if self.type not in ('ping', 'http'):
            raise ValueError(f"Invalid target type: {self.type}. Must be 'ping' or 'http'.")

        # Validate based on type
        if self.type == 'ping':
            self._validate_ping_host()
        elif self.type == 'http':
            self._validate_http_url()

    def _validate_ping_host(self):
        """Validate ping target host"""
        import re
        # IPv4: 1.2.3.4
        ipv4_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
        # IPv6: 2001:db8::1
        ipv6_pattern = r'^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$'
        # Hostname: example.com, sub.example.com, localhost
        hostname_pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$'

        if not (re.match(ipv4_pattern, self.host) or
                re.match(ipv6_pattern, self.host) or
                re.match(hostname_pattern, self.host)):
            raise ValueError(f"Invalid ping host: {self.host}. Must be valid IP or hostname.")

    def _validate_http_url(self):
        """Validate HTTP target URL"""
        from urllib.parse import urlparse

        parsed = urlparse(self.host)
        if not parsed.scheme:
            raise ValueError(f"HTTP target must include scheme (http:// or https://): {self.host}")
        if parsed.scheme not in ('http', 'https'):
            raise ValueError(f"HTTP target scheme must be http or https: {parsed.scheme}")
        if not parsed.netloc:
            raise ValueError(f"HTTP target must include hostname: {self.host}")

    @property
    def is_http(self) -> bool:
        """Check if this is an HTTP target"""
        return self.type == 'http'

    @property
    def is_ping(self) -> bool:
        """Check if this is a ping target"""
        return self.type == 'ping'


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
class PlottingConfig:
    """Visualization settings"""
    downtime_window_hours: int = 24
    bucket_minutes: int = 15
    terminal_width: int = 100
    terminal_height: int = 25
    downtime_y_max: int = 20
    use_color: bool = True
    visualization_library: str = "plotext"

    def __post_init__(self):
        valid_libs = ["plotext", "gnuplot", "rich"]
        if self.visualization_library not in valid_libs:
            raise ValueError(f"visualization_library must be one of {valid_libs}")
        if self.bucket_minutes < 1 or self.bucket_minutes > 1440:
            raise ValueError("bucket_minutes must be between 1 and 1440")


@dataclass
class Config:
    """Main configuration class"""
    general: GeneralConfig
    monitoring: MonitoringConfig
    location: LocationConfig
    targets: List[Target]
    database: DatabaseConfig
    plotting: PlottingConfig

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Config":
        """
        Load configuration from TOML file

        Args:
            path: Path to config file (defaults to ~/.config/ping-monitor/config.toml)

        Returns:
            Config object

        Raises:
            FileNotFoundError: If config file doesn't exist
            ValueError: If configuration is invalid
        """
        if path is None:
            path = Path.home() / ".config" / "ping-monitor" / "config.toml"

        path = Path(path).expanduser()

        if not path.exists():
            raise FileNotFoundError(
                f"Configuration file not found: {path}\n"
                f"Run 'ping-monitor --init-config' to create a default configuration."
            )

        # Read TOML file
        with open(path, "rb") as f:
            data = tomllib.load(f)

        # Apply environment variable overrides
        cls._apply_env_overrides(data)

        # Parse sections
        general = GeneralConfig(**data.get("general", {}))
        monitoring = MonitoringConfig(**data.get("monitoring", {}))
        location = LocationConfig(**data.get("location", {}))
        database = DatabaseConfig(**data.get("database", {}))
        plotting = PlottingConfig(**data.get("plotting", {}))

        # Parse targets
        targets_data = data.get("targets", [])
        if not targets_data:
            raise ValueError("At least one target must be defined")

        targets = [Target(**t) for t in targets_data]

        return cls(
            general=general,
            monitoring=monitoring,
            location=location,
            targets=targets,
            database=database,
            plotting=plotting
        )

    @staticmethod
    def _apply_env_overrides(data: dict) -> None:
        """Apply environment variable overrides to configuration"""
        # Example: PING_MONITOR_GENERAL_LOG_LEVEL=DEBUG
        prefix = "PING_MONITOR_"

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
                    else:
                        data[section][setting] = value

    @classmethod
    def create_default(cls, path: Optional[Path] = None) -> None:
        """
        Create a default configuration file

        Args:
            path: Path to create config file (defaults to ~/.config/ping-monitor/config.toml)
        """
        if path is None:
            path = Path.home() / ".config" / "ping-monitor" / "config.toml"

        path = Path(path).expanduser()

        # Create parent directory if it doesn't exist
        path.parent.mkdir(parents=True, exist_ok=True)

        # Default configuration
        default_config = """# Ping Monitor Configuration

[general]
database_path = "~/connectivity.db"
log_level = "INFO"
retention_days = 180

[monitoring]
interval_seconds = 10
ping_timeout = 5
ping_count = 1

[location]
enabled = true
check_interval_minutes = 5
geolocation_provider = "ipapi.co"  # Options: ipapi.co, ip-api.com
cache_ttl_hours = 24

[[targets]]
name = "default"
host = "8.8.8.8"
type = "ping"
description = "Google DNS"
enabled = true

# Example ping target:
# [[targets]]
# name = "router"
# host = "192.168.1.1"
# type = "ping"
# description = "Home Router"
# enabled = true

# Example HTTP/HTTPS target:
# [[targets]]
# name = "website"
# host = "https://example.com"
# type = "http"
# description = "Example Website"
# enabled = true
# http_method = "GET"               # Optional: GET, POST, HEAD, etc. (default: GET)
# http_expected_status = 200        # Optional: Expected status code (default: any 2xx)
# http_verify_ssl = true            # Optional: Verify SSL certificates (default: true)
# http_timeout = 10                 # Optional: Request timeout in seconds (default: 10)

[database]
rotation_enabled = true
rotation_interval_hours = 24
vacuum_after_rotation = true

[plotting]
downtime_window_hours = 24
bucket_minutes = 15
terminal_width = 100
terminal_height = 25
downtime_y_max = 20
use_color = true
visualization_library = "plotext"  # Options: plotext, gnuplot, rich
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

        # Check that at least one target is enabled
        if not any(t.enabled for t in self.targets):
            raise ValueError("At least one target must be enabled")

        # Check for duplicate target names
        names = [t.name for t in self.targets]
        if len(names) != len(set(names)):
            raise ValueError("Target names must be unique")
