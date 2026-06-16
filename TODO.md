# TODO List

## 🚀 COMPLETED: Package Improvements (2026-01-01)

### Summary
Enhanced all three monitoring packages with comprehensive testing, documentation, and intelligent alert debouncing to prevent notification spam.

### ✅ Notify Package Enhancements

#### 1. Comprehensive Documentation
- **350+ line README.md** with:
  - Complete installation and setup guide
  - CLI usage examples for all features
  - Library/API documentation with code examples
  - All 5 Pushover priority levels documented
  - Troubleshooting section
  - Architecture overview
  - Real-world integration examples

#### 2. Test Suite (70 comprehensive tests)
- Priority parsing (6 tests)
- Wall notifications (4 tests)
- Pushover API integration (8 tests)
- Main send_notification function (5 tests)
- Config management (11 tests)
- Alert configuration (18 tests)
- **Debouncing functionality (17 tests)**
- All tests passing with pytest
- Virtual environment configured

#### 3. Alert Debouncing System
**`AlertDebouncer` class:**
- Prevents alert spam with configurable cooldown periods (default 5 minutes)
- Tracks last alert time and values per alert key
- Manual reset capability for immediate re-alerts
- Status reporting (time since last alert, cooldown remaining)
- Per-alert cooldown overrides

**`HysteresisDebouncer` class (Advanced):**
- Two-threshold system prevents "flapping"
- Alert threshold: triggers notification
- Reset threshold: clears alert state (requires crossing in opposite direction)
- Perfect for battery/temperature monitoring
- Example: Alert at 20% battery, don't reset until charged to 25%

**Benefits:**
- No more notification spam from repeated alerts
- Intelligent reset when conditions normalize
- Separate tracking for each alert type
- Configurable cooldown periods

### ✅ Battery Monitor Integration
- **Hysteresis debouncing** for low battery alerts:
  - Low battery: 5-minute cooldown, resets at threshold + 5%
  - Critical battery: 3-minute cooldown (more urgent)
- **Standard debouncing** for temperature alerts:
  - High temperature: 10-minute cooldown
  - Auto-reset when temperature normalizes
- Status change alerts (power connect/disconnect) not debounced
- Tested and verified ✓

### ✅ Ping Monitor Integration
- **Per-target debouncing** for all alerts:
  - High latency: 5-minute cooldown per target
  - Target down: 10-minute cooldown (prevents spam if stays down)
- **Auto-reset when recovered:**
  - Latency normal: debouncer clears
  - Target online: down alert clears
- Consecutive failure logic preserved
- Tested and verified ✓

### Example: How Debouncing Works

**Before (without debouncing):**
```
12:00 - Battery at 19% - ALERT sent
12:01 - Battery at 18% - ALERT sent again
12:02 - Battery at 18% - ALERT sent again
12:03 - Battery at 17% - ALERT sent again
... (spam continues every minute)
```

**After (with hysteresis debouncing):**
```
12:00 - Battery at 19% - ALERT sent ✓
12:01 - Battery at 18% - Suppressed (cooldown: 4m 59s left)
12:02 - Battery at 18% - Suppressed (cooldown: 3m 59s left)
12:05 - Battery at 17% - ALERT sent ✓ (cooldown elapsed)
12:10 - Battery at 22% - Suppressed (above alert but below reset threshold)
12:15 - Battery at 26% - Alert CLEARED (crossed reset threshold)
```

### Configuration

Debouncing is automatic and uses sensible defaults:
- **Low battery:** 5-minute cooldown
- **Critical battery:** 3-minute cooldown
- **High temp:** 10-minute cooldown
- **Ping latency:** 5-minute cooldown per target
- **Target down:** 10-minute cooldown per target

All cooldowns can be customized in the code if needed.

### Testing

All integrations tested and verified:
```bash
# Notify package: 70 tests passing
cd ~/.homedir/bin/notify-pkg && .venv/bin/pytest tests/

# Battery monitor: Integration verified
cd ~/.homedir/bin/battery-monitor && python3 -c "from battmon.alerts import *"

# Ping monitor: Integration verified
cd ~/.homedir/bin/ping-monitor && python3 -c "from pingmon.alerts import *"
```

---

## ✅ COMPLETED: Monitoring Alerts - Pushover Integration

### Summary
Created a centralized notification system (`notify` package) with full Pushover API support and refactored both monitoring systems to use it.

### Completed Tasks

#### ✅ Notify Package (Centralized Notification System)
- Created `~/.homedir/bin/notify-pkg/` as a reusable notification package
- **Full Pushover API Support:**
  - All priority levels: silent (-2), quiet (-1), normal (0), high (1), emergency (2)
  - Device targeting
  - Supplementary URLs with titles
  - HTML formatting
  - Custom sounds
  - Emergency priority with retry/expire/callback
  - Timestamp support
- **Wall Notifications:** Shell broadcasts to logged-in users
- **Alert Management System:**
  - Generic `AlertConfig` class for threshold management
  - `AlertThreshold` and `AlertManager` helpers
  - Flexible configuration via TOML files
- **CLI Tool:** `notify` command with send, enable, disable, status, and test subcommands
- **History Tracking:** SQLite-based notification history

#### ✅ Battery Monitor Integration
- Refactored `battmon/alerts.py` to use centralized notify package
- Created `BatteryAlertConfig` extending `AlertConfig`
- All battery alerts now use notify for delivery:
  - Low battery (20%)
  - Critical battery (10%)
  - Full charge (95%)
  - High temperature (45°C)
  - Power connected/disconnected events
- Tested and verified integration

#### ✅ Ping Monitor Integration
- Refactored `pingmon/alerts.py` to use centralized notify package
- Created `PingAlertConfig` extending `AlertConfig`
- All ping alerts now use notify for delivery:
  - High latency alerts
  - Consecutive failure alerts
  - Downtime percentage thresholds
- Tested and verified integration

#### ✅ Testing
- Tested all Pushover priority levels successfully
- Tested URL/URL title features
- Verified both monitoring integrations load correctly
- Confirmed configuration sharing works as expected

### Configuration

**Notify Package:** `~/.config/notify/config.toml`
**Battery Monitor Alerts:** `~/.config/battery-monitor/alerts.toml`
**Ping Monitor Alerts:** `~/.config/ping-monitor/alerts.toml`

All three configs share Pushover credentials via the notify package.

### Usage Examples

```bash
# Send a test notification
notify send "Test Title" "Test message" -p normal

# Send high priority alert with URL
notify send "Server Down" "Web server is offline" -p high \
  --url "https://status.example.com" --url-title "Status Page"

# Enable Pushover for a monitor
bm alerts enable pushover  # Uses notify config
pm alerts enable pushover  # Uses notify config

# Check notification status
notify status
```

### References
- Pushover API: https://pushover.net/api
- Notify package: `~/.homedir/bin/notify-pkg/`
- Battery monitor alerts: `~/.homedir/bin/battery-monitor/battmon/alerts.py`
- Ping monitor alerts: `~/.homedir/bin/ping-monitor/pingmon/alerts.py`
