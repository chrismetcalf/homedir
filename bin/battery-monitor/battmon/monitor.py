"""
Main monitoring daemon for battery-monitor

Coordinates battery reading, logging, event detection, and log rotation.
"""

import logging
import signal
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .config import Config
from .database import Database
from .battery import BatteryReader, BatteryInfo
from .alerts import BatteryAlertConfig, check_battery_alerts

# Import notify config for notifications
import sys
from pathlib import Path as _Path
sys.path.insert(0, str(_Path.home() / ".homedir" / "bin" / "notify-pkg"))
from notify.config import NotifyConfig

logger = logging.getLogger(__name__)


class Monitor:
    """Main battery monitoring daemon"""

    def __init__(self, config: Config):
        """
        Initialize monitor

        Args:
            config: Configuration object
        """
        self.config = config
        self.running = False
        self.db = Database(config.general.database_path)

        # Initialize battery reader
        self.battery = BatteryReader(
            battery_id=config.monitoring.battery_id,
            method=config.monitoring.detection_method
        )

        if not self.battery.is_available():
            raise RuntimeError(
                f"No battery found with ID '{config.monitoring.battery_id}'. "
                f"Available batteries: {BatteryReader.list_batteries()}"
            )

        # Track state for event detection
        self.last_status = None
        self.last_percentage = None
        self.low_battery_notified = False
        self.critical_battery_notified = False

        # Initialize alerts and notifications
        try:
            self.alert_config = BatteryAlertConfig()
            self.notify_config = NotifyConfig()
        except Exception as e:
            logger.warning(f"Failed to load alert config: {e}, alerts disabled")
            self.alert_config = None
            self.notify_config = None

        # Rotation tracking
        self.last_rotation = datetime.utcnow()

        # Signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGHUP, self._sighup_handler)

        logger.info(f"Monitor initialized for battery: {config.monitoring.battery_id}")

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals (SIGTERM, SIGINT)"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False

    def _sighup_handler(self, signum, frame):
        """Handle SIGHUP (reload configuration)"""
        logger.info("Received SIGHUP, reloading configuration...")
        try:
            # Reload config (same path as original)
            new_config = Config.load()
            new_config.validate()
            self.config = new_config
            logger.info("Configuration reloaded successfully")
        except Exception as e:
            logger.error(f"Failed to reload configuration: {e}")

    def _detect_events(self, info: BatteryInfo) -> None:
        """Detect and log battery events"""
        if not self.config.alerts.enabled:
            return

        # Detect status changes
        if self.last_status != info.status:
            if info.status == "Full":
                self.db.log_event(
                    "full_charge",
                    "Battery fully charged",
                    info.percentage
                )
                logger.info("Battery fully charged")

            elif info.status == "Charging" and self.last_status == "Discharging":
                self.db.log_event(
                    "charging_started",
                    "Battery charging started",
                    info.percentage
                )
                logger.info(f"Battery charging started at {info.percentage}%")
                # Reset low battery notifications
                self.low_battery_notified = False
                self.critical_battery_notified = False

            elif info.status == "Discharging" and self.last_status == "Charging":
                self.db.log_event(
                    "discharging_started",
                    "Battery discharging started",
                    info.percentage
                )
                logger.info(f"Battery discharging started at {info.percentage}%")

            self.last_status = info.status

        # Detect low battery
        if info.percentage is not None:
            if (info.percentage <= self.config.alerts.critical_battery_threshold and
                not self.critical_battery_notified):
                self.db.log_event(
                    "critical_battery",
                    f"Critical battery level: {info.percentage}%",
                    info.percentage
                )
                logger.critical(f"CRITICAL: Battery at {info.percentage}%!")
                self.critical_battery_notified = True

            elif (info.percentage <= self.config.alerts.low_battery_threshold and
                  not self.low_battery_notified and
                  not self.critical_battery_notified):
                self.db.log_event(
                    "low_battery",
                    f"Low battery level: {info.percentage}%",
                    info.percentage
                )
                logger.warning(f"WARNING: Battery low at {info.percentage}%")
                self.low_battery_notified = True

            # Reset notifications when battery goes above their respective thresholds
            if info.percentage > self.config.alerts.low_battery_threshold:
                self.low_battery_notified = False
            if info.percentage > self.config.alerts.critical_battery_threshold:
                self.critical_battery_notified = False

        # Detect high temperature
        if (info.temperature is not None and
            self.config.alerts.high_temperature_threshold is not None):
            if info.temperature >= self.config.alerts.high_temperature_threshold:
                self.db.log_event(
                    "high_temperature",
                    f"High battery temperature: {info.temperature}°C",
                    info.percentage
                )
                logger.warning(f"WARNING: Battery temperature high: {info.temperature}°C")

        # Send notifications via alert system
        if self.alert_config and self.notify_config:
            try:
                check_battery_alerts(self.alert_config, self.notify_config, info, self.last_status)
            except Exception as e:
                logger.error(f"Failed to check alerts: {e}")

    def _check_rotation(self) -> None:
        """Check if log rotation is needed"""
        if not self.config.database.rotation_enabled:
            return

        now = datetime.utcnow()
        hours_since_rotation = (now - self.last_rotation).total_seconds() / 3600

        if hours_since_rotation >= self.config.database.rotation_interval_hours:
            logger.info("Starting log rotation...")
            try:
                deleted = self.db.rotate_logs(
                    retention_days=self.config.general.retention_days,
                    vacuum=self.config.database.vacuum_after_rotation
                )
                self.last_rotation = now
                logger.info(f"Log rotation complete: {deleted} records deleted")
            except Exception as e:
                logger.error(f"Log rotation failed: {e}")

    def _read_and_log_battery(self) -> None:
        """Read battery status and log to database"""
        try:
            # Read battery info
            info = self.battery.read()

            # Log to database
            self.db.log_battery_reading(
                percentage=info.percentage,
                status=info.status,
                voltage=info.voltage,
                current=info.current,
                power=info.power,
                temperature=info.temperature,
                time_remaining=info.time_remaining,
                cycle_count=info.cycle_count
            )

            # Update battery info if we have new data
            if info.manufacturer or info.model or info.capacity:
                self.db.upsert_battery_info(
                    battery_id=self.config.monitoring.battery_id,
                    manufacturer=info.manufacturer,
                    model=info.model,
                    capacity=info.capacity
                )

            # Detect events
            self._detect_events(info)

            # Log to application logger
            log_msg = f"Battery: {info.percentage or 'N/A'}%, {info.status}"
            if info.power:
                log_msg += f", {info.power:.1f}W"
            if info.temperature:
                log_msg += f", {info.temperature:.1f}°C"
            if info.time_remaining and info.status == "Discharging":
                hours = info.time_remaining // 60
                minutes = info.time_remaining % 60
                log_msg += f", {hours:02d}:{minutes:02d} remaining"

            logger.debug(log_msg)

        except Exception as e:
            logger.error(f"Error reading battery: {e}")
            # Log error status
            try:
                self.db.log_battery_reading(
                    percentage=None,
                    status="Error"
                )
            except Exception as db_error:
                logger.error(f"Failed to log error to database: {db_error}")

    def start(self) -> None:
        """Start the monitoring daemon"""
        logger.info("Starting battery monitor daemon")
        logger.info(f"Monitoring battery: {self.config.monitoring.battery_id}")
        logger.info(f"Interval: {self.config.monitoring.interval_seconds}s")
        logger.info(f"Database: {self.config.general.database_path}")
        logger.info(f"Detection method: {self.battery.method}")

        self.running = True

        try:
            while self.running:
                # Read and log battery
                self._read_and_log_battery()

                # Check if rotation needed
                self._check_rotation()

                # Sleep until next interval
                time.sleep(self.config.monitoring.interval_seconds)

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
        finally:
            self.stop()

    def stop(self) -> None:
        """Stop the monitoring daemon"""
        logger.info("Stopping battery monitor daemon")
        self.running = False

        if self.db:
            self.db.close()

        logger.info("Daemon stopped")


def main(config_path: Optional[Path] = None):
    """
    Main entry point for battery-monitor daemon

    Args:
        config_path: Optional path to config file
    """
    import argparse

    parser = argparse.ArgumentParser(
        description="Battery Monitor - Track battery metrics over time"
    )
    parser.add_argument(
        "--init-config",
        action="store_true",
        help="Create default configuration file and exit"
    )
    parser.add_argument(
        "--list-batteries",
        action="store_true",
        help="List available batteries and exit"
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file"
    )

    args = parser.parse_args()

    # Handle --init-config
    if args.init_config:
        Config.create_default(args.config)
        return

    # Handle --list-batteries
    if args.list_batteries:
        batteries = BatteryReader.list_batteries()
        if batteries:
            print("Available batteries:")
            for bat in batteries:
                print(f"  - {bat}")
        else:
            print("No batteries found")
        return

    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

    try:
        # Load configuration
        config = Config.load(args.config or config_path)
        config.validate()

        # Update log level from config
        logging.getLogger().setLevel(getattr(logging, config.general.log_level))

        # Create and start monitor
        monitor = Monitor(config)
        monitor.start()

    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
