# Battery Monitor v1.0

Modern battery monitoring system with historical tracking, event detection, and configurable alerts.

## Features

- **Multi-platform support**: Supports Linux (sysfs, acpi, acpitool) and UPS devices (apcaccess)
- **Comprehensive metrics**: Tracks percentage, voltage, current, power, temperature, and more
- **Event detection**: Automatically detects and logs charging events, low battery, critical battery
- **Automatic log rotation**: Configurable retention with automatic cleanup
- **Secure**: Uses parameterized SQL queries to prevent injection attacks
- **Modern Python**: Built with Python 3.10+ features
- **Flexible configuration**: TOML-based configuration with environment variable overrides
- **Systemd integration**: Run as a user service with auto-restart

## Quick Start

### Installation

The `bm` command is available in `~/.homedir/bin/` and ready to use (no pip install needed).

### Initial Setup

```bash
# Create default configuration
bm --init-config

# List available batteries on your system
bm --list-batteries

# Edit configuration if needed
vim ~/.config/battery-monitor/config.toml
```

## Configuration

Configuration file: `~/.config/battery-monitor/config.toml`

Example configuration:

```toml
[general]
database_path = "~/battery_monitor.db"
log_level = "INFO"
retention_days = 180  # Keep 6 months of data

[monitoring]
interval_seconds = 60  # Check battery every minute
battery_id = "BAT0"  # Battery identifier (BAT0, BAT1, etc.)
detection_method = "auto"  # Options: auto, sysfs, acpi, acpitool, apcaccess

[database]
rotation_enabled = true
rotation_interval_hours = 24
vacuum_after_rotation = true

[alerts]
enabled = true
low_battery_threshold = 20  # Alert when battery below 20%
critical_battery_threshold = 10  # Critical alert at 10%
# high_temperature_threshold = 60.0  # Uncomment to enable temperature alerts
```

## Usage

### Command Line Interface

The `bm` command provides a simple interface similar to `pm` (ping-monitor):

```bash
# Show current battery status (live reading)
bm status

# Show statistics (default: last 24 hours)
bm stats
bm stats 48  # Last 48 hours

# Show recent events (charge/discharge, low battery, etc.)
bm events
bm events 50  # Show last 50 events

# Run monitoring daemon
bm run

# Setup commands
bm --init-config      # Create default configuration
bm --list-batteries   # List available batteries
bm --help             # Show help
```

### Run as Daemon

```bash
# Foreground (for testing)
bm run

# Background
bm run &

# With systemd (recommended)
systemctl --user enable battery-monitor
systemctl --user start battery-monitor
systemctl --user status battery-monitor
```

### Monitor Logs

```bash
# View daemon logs (if using systemd)
journalctl --user -u battery-monitor -f

# Database statistics
sqlite3 ~/battery_monitor.db "SELECT COUNT(*) FROM battery_log"

# Recent battery readings
sqlite3 ~/battery_monitor.db "SELECT * FROM battery_log ORDER BY timestamp DESC LIMIT 10"

# Recent events
sqlite3 ~/battery_monitor.db "SELECT * FROM events ORDER BY timestamp DESC LIMIT 10"
```

### Reload Configuration

```bash
# Send SIGHUP to reload config without restart
killall -HUP battery-monitor
```

## Architecture

### Database Schema

```
battery_log   - Time-series battery readings (percentage, voltage, current, etc.)
battery_info  - Static battery information (manufacturer, model, capacity)
events        - Significant events (low battery, full charge, etc.)
```

### Key Components

- `battery.py`: Multi-platform battery information reader
- `config.py`: TOML configuration management
- `database.py`: SQLite operations with parameterized queries
- `monitor.py`: Main daemon with signal handling and event detection

### Detection Methods

1. **sysfs** (Linux): Reads from `/sys/class/power_supply/` - most reliable on modern Linux
2. **acpi**: Uses the `acpi` command - works on most Linux laptops
3. **acpitool**: Uses the `acpitool` command - alternative to acpi
4. **apcaccess**: For UPS devices using apcupsd

The tool auto-detects the best available method or you can specify one in the configuration.

## Battery Metrics Tracked

- **Percentage**: Battery charge level (0-100%)
- **Status**: Charging, Discharging, Full, Not charging, Unknown
- **Voltage**: Current voltage in volts
- **Current**: Current draw in amperes
- **Power**: Power consumption in watts
- **Temperature**: Battery temperature in Celsius (if available)
- **Time Remaining**: Estimated time remaining in minutes
- **Cycle Count**: Number of charge/discharge cycles (if available)

## Event Types

The monitor automatically detects and logs the following events:

- **full_charge**: Battery reached 100%
- **charging_started**: Battery started charging
- **discharging_started**: Battery started discharging
- **low_battery**: Battery below low threshold (default: 20%)
- **critical_battery**: Battery below critical threshold (default: 10%)
- **high_temperature**: Battery temperature above threshold (if configured)

## Querying Battery Data

### Recent Battery Status

```bash
sqlite3 ~/battery_monitor.db <<EOF
SELECT
  datetime(timestamp) as time,
  percentage || '%' as battery,
  status,
  ROUND(power, 2) || 'W' as power,
  ROUND(temperature, 1) || '°C' as temp
FROM battery_log
ORDER BY timestamp DESC
LIMIT 20;
EOF
```

### Battery Statistics (Last 24 Hours)

```bash
sqlite3 ~/battery_monitor.db <<EOF
SELECT
  ROUND(AVG(percentage), 1) as avg_pct,
  ROUND(MIN(percentage), 1) as min_pct,
  ROUND(MAX(percentage), 1) as max_pct,
  ROUND(AVG(power), 2) as avg_power,
  COUNT(*) as readings
FROM battery_log
WHERE timestamp >= datetime('now', '-24 hours');
EOF
```

### Charge/Discharge Cycles

```bash
sqlite3 ~/battery_monitor.db <<EOF
SELECT
  event_type,
  datetime(timestamp) as time,
  percentage || '%' as battery,
  description
FROM events
WHERE event_type IN ('charging_started', 'discharging_started', 'full_charge')
ORDER BY timestamp DESC
LIMIT 20;
EOF
```

### Low Battery Events

```bash
sqlite3 ~/battery_monitor.db <<EOF
SELECT
  event_type,
  datetime(timestamp) as time,
  percentage || '%' as battery,
  description
FROM events
WHERE event_type IN ('low_battery', 'critical_battery')
ORDER BY timestamp DESC
LIMIT 10;
EOF
```

## Systemd Service

Create `~/.config/systemd/user/battery-monitor.service`:

```ini
[Unit]
Description=Battery Monitor
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/battery-monitor
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Then enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable battery-monitor
systemctl --user start battery-monitor
```

## Troubleshooting

### No Battery Found

If you get "No battery found" errors:

1. Check available batteries:
   ```bash
   battery-monitor --list-batteries
   ls /sys/class/power_supply/
   ```

2. Update `battery_id` in your config to match an available battery

3. Try different detection methods:
   ```bash
   acpi -b
   acpitool -b
   ```

### Permission Errors

Most battery information is readable without root. If you encounter permission errors:

- For sysfs: Battery info in `/sys/class/power_supply/` should be world-readable
- For acpi/acpitool: These commands typically don't require root
- For UPS: You may need to be in the appropriate group for apcupsd

### Database Locked Errors

The database uses WAL mode for better concurrency. If you see "database is locked" errors:

```bash
sqlite3 ~/battery_monitor.db "PRAGMA journal_mode=WAL"
```

## Environment Variable Overrides

You can override configuration settings with environment variables:

```bash
# Override log level
export BATTERY_MONITOR_GENERAL_LOG_LEVEL=DEBUG

# Override interval
export BATTERY_MONITOR_MONITORING_INTERVAL_SECONDS=30

battery-monitor
```

## Similar to ping-monitor

This tool is modeled after `ping-monitor` and follows the same architecture:

- Modern Python package with setuptools
- TOML-based configuration
- SQLite with parameterized queries
- Signal handling (SIGTERM, SIGINT, SIGHUP)
- Automatic log rotation
- Systemd integration

## License

MIT License

## Contributing

Contributions welcome! This tool was built with Claude Code.

## Future Enhancements

Potential additions:
- Plotting battery history (like ping-monitor's plotting features)
- Health analysis and battery degradation tracking
- Notifications via desktop notifications or email
- Web dashboard for visualizing battery history
- Multiple battery support for systems with multiple batteries
- Export functionality (CSV, JSON)
- Integration with status bars (tmux, polybar, etc.)
