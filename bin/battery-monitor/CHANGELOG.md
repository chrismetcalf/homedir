# Changelog

All notable changes to battery-monitor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Quality of Life Improvements**
  - Added `--no-color` flag to disable colored terminal output (useful for scripting)
  - Sets standard `NO_COLOR` environment variable (respected by plotext and other tools)
  - Improved error messages with specific exception handling and actionable guidance
  - Better error messages for common issues (missing config, permissions, invalid values)
  - Enhanced reload command with systemd hints and process checking instructions
- Test suite with 12 tests achieving 14% initial code coverage
  - Database operations testing (`tests/test_database.py`)
  - Configuration validation testing (`tests/test_config.py`)
  - Battery info testing (`tests/test_battery.py`)
- Test dependencies in `requirements-test.txt` (pytest, pytest-cov, pytest-mock, freezegun)
- Security enhancements
  - Path traversal protection for database paths
  - Input validation for battery_id (alphanumeric, underscore, hyphen only)
  - Comprehensive path validation against suspicious patterns
- Virtual environment support (.venv added to .gitignore)
- CONTRIBUTING.md with development guidelines
- CHANGELOG.md for tracking project changes

### Changed
- **BREAKING**: Fixed transaction context manager in Database class
  - Removed manual BEGIN/COMMIT statements that caused nested transaction errors
  - Now uses SQLite's implicit transactions with explicit commit()/rollback()
  - Fixes `OperationalError: cannot start a transaction within a transaction`
- Enhanced configuration validation
  - Stricter path validation in GeneralConfig
  - Battery ID validation with regex pattern
  - Better error messages for invalid configurations

### Fixed
- **SQL Syntax Errors**
  - Fixed missing f-string prefix in plot.py (line 27)
  - Fixed missing f-string prefix in waterfall.py (line 29)
  - Resolved "unrecognized token" errors when running `bm plot` and `bm waterfall`
  - Queries now properly interpolate bucket_minutes parameter
- **CRITICAL**: Cycle detection logic uninitialized variable bug (database.py:334)
  - Properly initialize `current_cycle` before loop
  - Append last cycle after loop ends
  - Prevents loss of first charging/discharging cycle
- **CRITICAL**: Notification reset logic bug (monitor.py:141-143)
  - Separate critical and low battery notification reset
  - Critical notifications now reset at critical threshold (not low threshold)
  - Fixes premature notification re-triggering
- **CRITICAL**: Division by zero in time remaining calculation (battery.py:171)
  - Check `if info.current > 0` before calculating time remaining
  - Return None for time_remaining if current is 0
  - Prevents crashes when current draw is unavailable
- Transaction context manager SQLite errors
  - Removed conflicting isolation_level=None setting
  - Fixed manual transaction management

### Security
- Added path traversal protection in GeneralConfig.__post_init__
  - Blocks paths containing '..'
  - Blocks system directories (/etc, /sys)
  - Restricts paths to home directory, /tmp, or current working directory
- Added battery_id validation in MonitoringConfig.__post_init__
  - Regex pattern: `^[a-zA-Z0-9_\-]+$`
  - Prevents path traversal and command injection
  - Validates battery identifier contains only safe characters
- All SQL queries use parameterized queries (no f-string interpolation)

### Removed
- None

## [1.0.0] - Previous Version

### Added
- Initial battery monitoring daemon for Linux systems
- Support for multiple battery detection methods:
  - sysfs (native Linux kernel interface)
  - ACPI command-line tool
  - acpitool command-line tool
  - apcaccess (for UPS monitoring)
  - PiSugar integration via TCP
- Database logging with SQLite
- Configuration via TOML files
- Battery event detection:
  - Charging started/stopped
  - Discharging started/stopped
  - Full charge reached
  - Low battery warning
  - Critical battery warning
- Visualization tools:
  - Line chart (plot)
  - Waterfall chart showing battery state over time
- Database rotation and log management
- Signal handling (SIGTERM, SIGINT, SIGHUP)
- Environment variable overrides for configuration
- Desktop notifications for battery events
- Cycle detection and counting
- Temperature monitoring (where available)

### Changed
- Initial release structure with modular design
- TOML-based configuration

## Known Issues

### To Be Fixed
- Test coverage needs improvement (currently 14%)
- Missing export functionality (CSV, JSON)
- Missing reporting system (daily, weekly, monthly reports)
- Missing alert notification system integration
- No CLI reload command (SIGHUP handler exists but no command)
- PiSugar protocol not fully documented

### Feature Gaps (vs ping-monitor)
- No export command for data extraction
- No reporting command for statistics
- No alert notifications (only logging)
- No live/watch mode for real-time monitoring

## Future Enhancements

### Planned Features
- Export functionality (CSV, JSON, summary)
  - Export battery readings with time filtering
  - Export charge/discharge cycles
  - Export statistics summary
- Reporting system
  - Daily battery statistics
  - Weekly charge/discharge patterns
  - Monthly battery health trends
  - Temperature statistics
- Alert notification system
  - Desktop notifications (libnotify)
  - ntfy.sh push notifications
  - Pushover integration
  - Configurable thresholds
- Live monitoring mode
  - Real-time battery status display
  - Automatic refresh
  - Terminal-based dashboard
- Reload command
  - CLI command to send SIGHUP to daemon
  - Hot-reload configuration without restart
- Enhanced battery health tracking
  - Capacity degradation over time
  - Cycle count analysis
  - Voltage trend analysis
- Performance optimizations
  - Database query optimization
  - Index creation for faster queries
  - Connection pooling

### Testing Improvements
- Increase test coverage to 80%+
- Add integration tests for full monitoring workflow
- Add tests for all battery detection methods
- Add tests for PiSugar TCP communication
- Add CI/CD pipeline with GitHub Actions

### Documentation Improvements
- Document PiSugar API protocol
- Add examples for each detection method
- Add troubleshooting guide
- Add performance tuning guide

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and how to contribute to this project.

## License

[License information here]
