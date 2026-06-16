# Notify v1.1.0

Generic notification system for sending alerts via multiple channels with full Pushover API support and alert management.

## Features

- **Multiple Notification Backends:**
  - **Pushover**: Full API support with all priority levels, device targeting, URLs, HTML formatting
  - **Wall**: Shell broadcasts to all logged-in users

- **Complete Pushover Integration:**
  - All 5 priority levels: silent (-2), quiet (-1), normal (0), high (1), emergency (2)
  - Emergency notifications with retry/expire/callback
  - Device targeting (send to specific devices)
  - Supplementary URLs with custom titles
  - HTML message formatting
  - Custom notification sounds
  - Timestamp support

- **Alert Management System:**
  - Generic threshold configuration
  - Alert debouncing and suppression
  - TOML-based configuration
  - Reusable by monitoring applications

- **Notification History:**
  - SQLite-based tracking
  - Query sent notifications
  - Success/failure logging

- **CLI & Library:**
  - Use as command-line tool or Python library
  - Flexible configuration management
  - Status checking and testing

## Installation

The notify package is located in `~/.homedir/bin/notify-pkg/` and the CLI wrapper is available as `notify` in `~/.homedir/bin/`.

### Dependencies

```bash
cd ~/.homedir/bin/notify-pkg
pip install -r requirements.txt
```

Required packages:
- `requests` - For Pushover API calls
- `tomli` - For reading TOML config files
- `tomli-w` - For writing TOML config files

## Quick Start

### 1. Initialize Configuration

```bash
# Create default configuration file
notify --init-config

# Enable wall notifications
notify enable wall

# Enable Pushover (requires credentials)
notify enable pushover --user-key YOUR_USER_KEY --api-token YOUR_API_TOKEN
```

### 2. Send Your First Notification

```bash
# Simple notification
notify send "Hello" "This is a test notification"

# High priority notification
notify send "Alert!" "Something important happened" -p high

# Pushover-only notification with URL
notify send "Server Down" "Web server is offline" -P \
  --url "https://status.example.com" --url-title "Status Page"
```

### 3. Check Status

```bash
notify status
```

## Configuration

### Configuration File

Default location: `~/.config/notify/config.toml`

```toml
enabled = true

[notifications]
wall = true
pushover = true

[pushover]
user_key = "your_pushover_user_key"
api_token = "your_pushover_api_token"
```

### Environment Variables

You can override configuration with environment variables:
- `NOTIFY_USER_KEY` - Pushover user key
- `NOTIFY_API_TOKEN` - Pushover API token

## CLI Usage

### Send Notifications

```bash
# Basic notification
notify send "Title" "Message"

# With priority (silent, quiet, normal, high, emergency)
notify send "Alert" "High priority alert" -p high

# With custom sound
notify send "Alert" "Custom sound" -s "siren"

# Wall-only notification
notify send "Maintenance" "Server restarting in 5 minutes" -w

# Pushover-only notification
notify send "Mobile Alert" "Check your phone" -P

# With supplementary URL
notify send "Build Failed" "CI build #123 failed" \
  --url "https://ci.example.com/build/123" \
  --url-title "View Build"

# HTML formatted message
notify send "Report" "<b>Bold</b> and <i>italic</i> text" --html -P

# Emergency priority (requires acknowledgment)
notify send "CRITICAL" "Database server down!" -p emergency \
  --retry 60 --expire 3600 -P
```

### Priority Levels

| Priority | Value | Description |
|----------|-------|-------------|
| `silent` | -2 | No notification/alert (updates badge only) |
| `quiet` | -1 | No sound/vibration |
| `normal` | 0 | Default priority with sound |
| `high` | 1 | Bypasses user's quiet hours |
| `emergency` | 2 | Requires acknowledgment, repeats until acknowledged |

### Manage Notification Methods

```bash
# Enable wall notifications
notify enable wall

# Enable Pushover
notify enable pushover --user-key KEY --api-token TOKEN

# Disable a method
notify disable wall
notify disable pushover

# Check configuration status
notify status
```

### Test Notifications

```bash
# Test all enabled methods
notify test

# Test specific method
notify test -m wall
notify test -m pushover
```

## Library Usage

### Basic Notification

```python
from notify import NotifyConfig, send_notification

# Load configuration
config = NotifyConfig()

# Send notification
results = send_notification(
    config,
    title="Alert",
    message="Something happened",
    priority="high"
)

print(f"Wall: {'✓' if results.get('wall') else '✗'}")
print(f"Pushover: {'✓' if results.get('pushover') else '✗'}")
```

### Using Priority Constants

```python
from notify import (
    NotifyConfig,
    send_notification,
    PRIORITY_NORMAL,
    PRIORITY_HIGH,
    PRIORITY_EMERGENCY
)

config = NotifyConfig()

# Normal notification
send_notification(config, "Info", "Regular message", priority=PRIORITY_NORMAL)

# High priority
send_notification(config, "Warning", "Important!", priority=PRIORITY_HIGH)

# Emergency
send_notification(
    config,
    "CRITICAL",
    "Server down!",
    priority=PRIORITY_EMERGENCY,
    retry=30,
    expire=3600
)
```

### Advanced Pushover Features

```python
from notify import NotifyConfig, send_notification

config = NotifyConfig()

# Send with URL
send_notification(
    config,
    title="Build Failed",
    message="CI build #123 failed",
    url="https://ci.example.com/build/123",
    url_title="View Build",
    priority="high"
)

# Send to specific device
send_notification(
    config,
    title="Device-Specific",
    message="Only sent to your iPhone",
    device="iphone"
)

# HTML formatted
send_notification(
    config,
    title="Formatted Message",
    message="<b>Bold</b>, <i>italic</i>, <u>underline</u>",
    html=True
)
```

### Alert Management System

```python
from notify import AlertConfig, NotifyConfig, send_notification

# Create alert configuration for your app
alert_config = AlertConfig(app_name="my-monitor")

# Set thresholds
alert_config.set_threshold("cpu_usage", 80.0)
alert_config.set_threshold("memory_usage", 90.0)

# Enable notifications
alert_config.enable()

# Check if alerts are enabled
if alert_config.is_enabled():
    notify_config = NotifyConfig()

    # Send alert when threshold exceeded
    current_cpu = 85.0
    if current_cpu > alert_config.get_threshold("cpu_usage"):
        send_notification(
            notify_config,
            "CPU Warning",
            f"CPU usage at {current_cpu}%",
            priority="high"
        )
```

### Custom Alert Configuration

```python
from notify.alerts import AlertConfig

class MyAppAlertConfig(AlertConfig):
    """Custom alert configuration for my app"""

    def __init__(self):
        super().__init__(app_name="my-app")

    def _default_config(self):
        """Override default configuration"""
        config = super()._default_config()
        config['thresholds'] = {
            'response_time_ms': 500.0,
            'error_rate': 5.0,
            'queue_depth': 100
        }
        return config

    def format_config(self):
        """Custom formatting for status display"""
        def format_thresholds(thresholds):
            lines = ["Thresholds:"]
            lines.append(f"  Response time: {thresholds.get('response_time_ms')}ms")
            lines.append(f"  Error rate:    {thresholds.get('error_rate')}%")
            lines.append(f"  Queue depth:   {thresholds.get('queue_depth')}")
            return "\n".join(lines)

        return super().format_config(format_thresholds)

# Use it
config = MyAppAlertConfig()
print(config.format_config())
```

## Integration Examples

### Monitoring Script

```python
#!/usr/bin/env python3
import sys
from pathlib import Path

# Add notify to path
sys.path.insert(0, str(Path.home() / ".homedir" / "bin" / "notify-pkg"))

from notify import NotifyConfig, send_notification, PRIORITY_HIGH

def monitor_service():
    config = NotifyConfig()

    # Check service
    if not check_service_running():
        send_notification(
            config,
            "Service Down",
            "MyService is not running!",
            priority=PRIORITY_HIGH,
            prefix="MONITOR"
        )

if __name__ == "__main__":
    monitor_service()
```

### Cron Job

```bash
# Check disk space and alert if low
0 * * * * df -h / | awk 'NR==2 {if (substr($5,1,length($5)-1) > 90) system("notify send \"Disk Space\" \"Root partition at " $5 "\" -p high")}'
```

### System Alert

```python
import os
from notify import NotifyConfig, send_notification

config = NotifyConfig()

# Send notification on startup
send_notification(
    config,
    "System Startup",
    f"Host {os.uname().nodename} has started",
    priority="normal"
)
```

## Notification History

Notifications are logged to `~/.local/share/notify/history.db` (SQLite).

Query the history:

```python
from notify.history import NotificationHistory

history = NotificationHistory()

# Get recent notifications
recent = history.get_recent(limit=10)
for notif in recent:
    print(f"{notif['timestamp']}: {notif['title']} - {notif['method']}")

history.close()
```

## Pushover Setup

1. **Create a Pushover account**: https://pushover.net/
2. **Get your User Key**: Found on the Pushover dashboard
3. **Create an Application**:
   - Go to https://pushover.net/apps/build
   - Create a new application/API token
   - Copy the API Token/Key
4. **Configure notify**:
   ```bash
   notify enable pushover --user-key YOUR_USER_KEY --api-token YOUR_API_TOKEN
   ```

### Pushover Sounds

Available sounds (use with `-s` or `--sound`):
- `pushover` (default)
- `bike`, `bugle`, `cashregister`, `classical`, `cosmic`, `falling`, `gamelan`
- `incoming`, `intermission`, `magic`, `mechanical`, `pianobar`, `siren`
- `spacealarm`, `tugboat`, `alien`, `climb`, `persistent`, `echo`, `updown`
- `vibrate`, `none`

Example:
```bash
notify send "Alert" "Custom sound" -s "siren" -P
```

## Architecture

```
notify-pkg/
├── notify/
│   ├── __init__.py       # Public API exports
│   ├── cli.py            # Command-line interface
│   ├── config.py         # Configuration management
│   ├── notifiers.py      # Notification delivery (wall, pushover)
│   ├── alerts.py         # Alert configuration and management
│   └── history.py        # Notification history database
├── config/
│   └── config.toml.example  # Example configuration
├── tests/
│   └── (test files)
├── requirements.txt      # Dependencies
├── setup.py             # Package setup
└── README.md            # This file
```

## Troubleshooting

### Pushover not working

1. Check configuration:
   ```bash
   notify status
   ```

2. Verify credentials are set:
   ```bash
   # Should show "configured" for both
   notify status | grep Pushover
   ```

3. Test Pushover directly:
   ```bash
   notify test -m pushover
   ```

4. Check for errors in the output

### Wall notifications not appearing

1. Ensure you're logged in to a terminal (not just SSH)
2. Check if wall command is available:
   ```bash
   which wall
   ```
3. Test wall directly:
   ```bash
   echo "test" | wall
   ```

### Configuration not loading

1. Check config file exists:
   ```bash
   ls -la ~/.config/notify/config.toml
   ```

2. Validate TOML syntax:
   ```bash
   python3 -c "import tomli; tomli.load(open('~/.config/notify/config.toml', 'rb'))"
   ```

3. Check permissions:
   ```bash
   chmod 600 ~/.config/notify/config.toml
   ```

## API Reference

### Functions

#### `send_notification(config, title, message, **kwargs)`

Send notification via all enabled methods.

**Parameters:**
- `config` (NotifyConfig): Configuration instance
- `title` (str): Notification title
- `message` (str): Notification message
- `priority` (str|int): Priority level (default: 0/normal)
- `sound` (str): Pushover sound name
- `prefix` (str): Wall notification prefix (default: "ALERT")
- `device` (str): Pushover device name
- `url` (str): Supplementary URL
- `url_title` (str): URL title
- `html` (bool): Enable HTML formatting
- `retry` (int): Emergency retry interval (seconds)
- `expire` (int): Emergency expiration (seconds)
- `callback` (str): Emergency callback URL

**Returns:**
- `dict`: Success status for each method `{"wall": bool, "pushover": bool}`

### Classes

#### `NotifyConfig(config_path=None)`

Configuration management for notifications.

**Methods:**
- `enable()` - Enable notifications globally
- `disable()` - Disable notifications globally
- `enable_notification(method, **kwargs)` - Enable specific method
- `disable_notification(method)` - Disable specific method
- `get_pushover_credentials()` - Get Pushover credentials

#### `AlertConfig(config_path=None, app_name="notify")`

Alert threshold configuration.

**Methods:**
- `set_threshold(name, value)` - Set threshold value
- `get_threshold(name, default)` - Get threshold value
- `enable()` / `disable()` - Enable/disable alerts
- `is_enabled()` - Check if alerts enabled
- `format_config()` - Format configuration for display

## Contributing

This is a personal dotfiles repository, but suggestions and improvements are welcome!

## License

MIT License - See repository root for details

## Related Projects

- **battery-monitor**: Uses notify for battery alerts
- **ping-monitor**: Uses notify for network connectivity alerts

## Version History

### v1.1.0 (Current)
- Added full Pushover API support
- Added alert management system
- Added notification history
- Refactored for library use

### v1.0.0
- Initial release
- Basic wall and Pushover support
- CLI interface
