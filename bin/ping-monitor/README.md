# Ping Monitor v2.0

Modern network connectivity monitoring system with location tracking and beautiful visualizations.

## Features

- **Multi-target monitoring**: Monitor multiple hosts simultaneously
- **Location tracking**: Automatically track ISP, public IP, and geolocation
- **Automatic log rotation**: Configurable retention with automatic cleanup
- **Secure**: Uses parameterized SQL queries (fixes SQL injection vulnerability)
- **Modern Python**: Built with Python 3.11+ features
- **Pure Python ICMP**: Uses icmplib (no root required) with fping fallback
- **Rich visualizations**: Terminal plots with color support
- **Systemd integration**: Run as a user service with auto-restart

## Quick Start

### Installation

```bash
cd ~/.homedir/bin/ping-monitor
pip install --user -e .
```

### Initial Setup

```bash
# Create default configuration
ping-monitor --init-config

# Edit configuration
vim ~/.config/ping-monitor/config.toml

# Start monitoring
ping-monitor
```

### Migration from v1.x

If you have existing data from the bash-based version:

```bash
# Backup your database
cp ~/connectivity.db ~/connectivity.db.backup

# Run migration
ping-monitor-migrate --backup

# Verify migration
ping-monitor-migrate --verify
```

## Configuration

Configuration file: `~/.config/ping-monitor/config.toml`

Example configuration:

```toml
[general]
database_path = "~/connectivity.db"
log_level = "INFO"
retention_days = 180

[monitoring]
interval_seconds = 10
ping_timeout = 5

[location]
enabled = true
check_interval_minutes = 5
geolocation_provider = "ipapi.co"

[[targets]]
name = "default"
host = "8.8.8.8"
description = "Google DNS"
enabled = true

[[targets]]
name = "router"
host = "192.168.1.1"
description = "Home Router"
enabled = true
```

## Usage

### Run as Daemon

```bash
# Foreground (for testing)
ping-monitor

# Background
ping-monitor &

# With systemd (recommended)
systemctl --user enable ping-monitor
systemctl --user start ping-monitor
systemctl --user status ping-monitor
```

### Monitor Logs

```bash
# View daemon logs
journalctl --user -u ping-monitor -f

# Database statistics
sqlite3 ~/connectivity.db "SELECT COUNT(*) FROM log"
```

### Reload Configuration

```bash
# Send SIGHUP to reload config without restart
killall -HUP ping-monitor
```

## Architecture

### Database Schema

```
targets          - Ping targets (hosts to monitor)
locations        - Location data (IP, ISP, geolocation)
log              - Ping results with location tracking
legacy_log (view) - Backward compatibility view
```

### Key Components

- `config.py`: TOML configuration management
- `database.py`: SQLite operations with parameterized queries
- `pinger.py`: ICMP ping with icmplib/fping
- `monitor.py`: Main daemon with signal handling
- `utils.py`: Shared utilities (bucketing, formatting)

## Security Improvements

### SQL Injection Fix

**Old (vulnerable) code:**
```bash
sqlite3 "$DBFILE" <<EOF
INSERT INTO log VALUES ('$TIMESTAMP', 'ONLINE', $PING_MS);
EOF
```

**New (secure) code:**
```python
db.execute(
    "INSERT INTO log (timestamp, status, ping_ms) VALUES (?, ?, ?)",
    (timestamp, status, ping_ms)
)
```

## Development

### Running Tests

```bash
pytest
pytest --cov=pingmon
```

### Project Structure

```
ping-monitor/
├── pingmon/           # Python package
│   ├── config.py
│   ├── database.py
│   ├── monitor.py
│   ├── pinger.py
│   └── utils.py
├── tests/             # Unit tests
├── config/            # Example configs
├── systemd/           # Service files
├── setup.py
├── requirements.txt
└── README.md
```

## Troubleshooting

### icmplib Permission Errors

If you see permission errors with icmplib, either:

1. Install fping as fallback: `sudo apt-get install fping`
2. Grant capabilities: `sudo setcap cap_net_raw+ep $(which python3)`

### Database Locked Errors

The database uses WAL mode for better concurrency. If you see "database is locked" errors:

```bash
sqlite3 ~/connectivity.db "PRAGMA journal_mode=WAL"
```

### Location Tracking Not Working

Check that you have network connectivity and the geolocation API is accessible:

```bash
curl https://ipapi.co/json/
```

## Roadmap

### Phase 2: Multi-Target + Rotation ✅
- Multi-target support
- Log rotation
- Config hot-reload

### Phase 3: Migration Tool (In Progress)
- Safe migration from v1.x
- Validation and rollback

### Phase 4: Visualization Tools (Planned)
- Downtime plots
- Latency graphs
- Status bar integration

### Phase 5: System Integration (Planned)
- Systemd service
- Production deployment

### Phase 6: Enhanced Visualization (Planned)
- Interactive dashboard (textual)
- Rich formatted reports
- Location-based analysis
- Heatmaps

## License

MIT License

## Contributing

Contributions welcome! Please ensure:
- Code passes pytest
- Follows PEP 8 style
- Includes tests for new features

## Credits

Built with Claude Code as a modernization of the original bash-based ping-monitor scripts.
