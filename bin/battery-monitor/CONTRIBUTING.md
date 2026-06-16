# Contributing to battery-monitor

Thank you for considering contributing to battery-monitor! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and constructive in all interactions
- Focus on what is best for the community and the project
- Show empathy towards other community members

## Getting Started

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd battery-monitor
   ```

2. **Create a virtual environment**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt -r requirements-test.txt
   ```

4. **Run tests**
   ```bash
   pytest tests/
   ```

## Development Guidelines

### Code Style

- Follow PEP 8 guidelines for Python code
- Use type hints where appropriate
- Keep functions focused and single-purpose
- Write docstrings for all public functions and classes

### Testing

- All new features must include tests
- Maintain test coverage above 80% for core modules
- Run the full test suite before submitting: `pytest tests/ --cov=battmon`
- Test both success and failure cases
- Mock external dependencies (PiSugar TCP, ACPI, sysfs)

### Security

- **Always use parameterized SQL queries** - Never use f-strings or string concatenation for SQL
- **Validate all user inputs** - Check paths for traversal attacks, validate battery IDs
- **Avoid hardcoded credentials** - Use configuration files or environment variables
- **Sanitize battery_id** - Only allow alphanumeric, underscore, and hyphen characters

### Commit Messages

Write clear, descriptive commit messages:
- Use present tense ("Add feature" not "Added feature")
- Capitalize the first line
- Keep the first line under 50 characters
- Provide detailed description after a blank line if needed

Example:
```
Add PiSugar3 support to battery detection

- Import socket for TCP communication
- Add detect_pisugar() method with configurable host/port
- Parse JSON response from PiSugar API
- Add PiSugar detection to auto detection chain
- Add logging for connection attempts
```

## Submitting Changes

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code following the guidelines above
   - Add tests for new functionality
   - Update documentation if needed

3. **Run the test suite**
   ```bash
   pytest tests/ -v
   pytest tests/ --cov=battmon --cov-report=term-missing
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "Brief description of changes"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Provide a clear description of the changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Wait for code review

### Pull Request Checklist

- [ ] Code follows style guidelines
- [ ] Tests added for new functionality
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No unnecessary dependencies added
- [ ] Security best practices followed

## Reporting Bugs

### Before Submitting a Bug Report

- Check if the bug has already been reported
- Ensure you're using the latest version
- Try to reproduce the issue with minimal configuration

### Bug Report Template

```markdown
**Description**
A clear description of the bug.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure '...'
2. Run '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**Environment**
- OS: [e.g., Ubuntu 22.04]
- Python version: [e.g., 3.11.2]
- battery-monitor version: [e.g., 2.0.0]
- Hardware: [e.g., Raspberry Pi 4, PiSugar3]

**Logs**
Relevant log output (if applicable).
```

## Feature Requests

We welcome feature requests! Please provide:

- **Use case**: Why is this feature needed?
- **Proposed solution**: How should it work?
- **Alternatives considered**: What other approaches did you consider?
- **Additional context**: Screenshots, mockups, examples

## Development Tips

### Running Specific Tests

```bash
# Run single test file
pytest tests/test_database.py -v

# Run single test
pytest tests/test_database.py::TestDatabaseInit::test_creates_tables -v

# Run with coverage for specific module
pytest tests/test_battery.py --cov=battmon.battery --cov-report=term-missing
```

### Debugging

```bash
# Run with verbose logging
BATTERY_MONITOR_GENERAL_LOG_LEVEL=DEBUG bm monitor

# Run tests with output
pytest tests/ -v -s

# Use pdb for debugging
import pdb; pdb.set_trace()
```

### Database Schema Changes

If modifying the database schema:

1. Update `battmon/database.py` with schema changes
2. Add migration logic to handle existing databases
3. Update tests in `tests/test_database.py`
4. Document the change in CHANGELOG.md

### Testing PiSugar Integration

To test PiSugar without hardware:

```python
# Create a mock PiSugar server for testing
import socket
import json

def mock_pisugar_server(port=8423):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', port))
    sock.listen(1)

    conn, addr = sock.accept()
    response = {
        'battery': 85.5,
        'battery_v': 4.1,
        'battery_i': 0.5
    }
    conn.sendall(json.dumps(response).encode() + b'\n')
    conn.close()
```

### Testing Battery Detection Methods

Each detection method should be tested independently:

- **sysfs**: Mock file reads from `/sys/class/power_supply/BAT0/`
- **ACPI**: Mock subprocess calls to `acpi` command
- **acpitool**: Mock subprocess calls to `acpitool` command
- **apcaccess**: Mock subprocess calls to `apcaccess` for UPS
- **PiSugar**: Mock TCP socket connections

## Project Structure

```
battery-monitor/
├── battmon/               # Main package
│   ├── __init__.py
│   ├── database.py        # Database operations
│   ├── config.py          # Configuration management
│   ├── battery.py         # Battery detection
│   ├── monitor.py         # Main monitoring daemon
│   ├── plot.py            # Line chart visualization
│   ├── waterfall.py       # Waterfall chart
│   └── ...
├── tests/                 # Test suite
│   ├── test_database.py
│   ├── test_config.py
│   ├── test_battery.py
│   └── ...
├── bin/                   # CLI entry points
│   └── bm
├── requirements.txt       # Production dependencies
├── requirements-test.txt  # Test dependencies
└── README.md
```

## Adding New Battery Detection Methods

To add a new battery detection method:

1. **Add method to `battmon/battery.py`**:
   ```python
   def detect_new_method() -> Optional[BatteryInfo]:
       """Detect battery using new method"""
       try:
           # Implementation here
           return BatteryInfo(
               percentage=75.5,
               status='charging',
               voltage=4.1,
               current=0.5,
               power=2.05
           )
       except Exception as e:
           logger.debug(f"New method detection failed: {e}")
           return None
   ```

2. **Add to detection chain in `get_battery_info()`**:
   ```python
   if method == "auto" or method == "new_method":
       info = detect_new_method()
       if info:
           return info
   ```

3. **Add configuration option** to `MonitoringConfig` in `config.py`:
   ```python
   valid_methods = ["auto", "sysfs", "acpi", "acpitool", "apcaccess", "pisugar", "new_method"]
   ```

4. **Write comprehensive tests** in `tests/test_battery.py`:
   ```python
   def test_detect_new_method_success(self, mock_new_api):
       info = detect_new_method()
       assert info is not None
       assert info.percentage == 75.5
   ```

5. **Update documentation** in README.md and this file

## Questions?

If you have questions about contributing, feel free to:
- Open an issue for discussion
- Check existing documentation
- Look at recent pull requests for examples

Thank you for contributing to battery-monitor!
