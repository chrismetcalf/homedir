"""
Main monitoring daemon for ping-monitor

Coordinates pinging, logging, location tracking, log rotation, and alerts.
"""

import asyncio
import logging
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict

from .config import Config
from .database import Database
from .pinger import Pinger, get_public_ip, get_geolocation
from .alerts import PingAlertConfig, check_and_alert
from .http_checker import HTTPChecker, check_http_endpoint

# Import notify config for notifications
sys.path.insert(0, str(Path.home() / ".homedir" / "bin" / "notify-pkg"))
from notify.config import NotifyConfig

logger = logging.getLogger(__name__)


class Monitor:
    """Main monitoring daemon"""

    def __init__(self, config: Config):
        """
        Initialize monitor

        Args:
            config: Configuration object
        """
        self.config = config
        self.running = False
        self.db = Database(config.general.database_path)

        # Initialize targets in database and create checkers (ping or HTTP)
        self.target_map = {}  # name -> (id, checker, target_obj)
        for target in config.targets:
            if not target.enabled:
                continue

            target_id = self.db.insert_target(
                name=target.name,
                host=target.host,
                description=target.description,
                enabled=target.enabled
            )

            # Create appropriate checker based on target type
            if target.is_http:
                checker = HTTPChecker(
                    url=target.host,
                    method=target.http_method,
                    timeout=target.http_timeout,
                    expected_status=target.http_expected_status,
                    verify_ssl=target.http_verify_ssl
                )
                logger.info(f"HTTP target '{target.name}': {target.host}")
            else:
                checker = Pinger(
                    host=target.host,
                    timeout=config.monitoring.ping_timeout,
                    count=config.monitoring.ping_count
                )
                logger.info(f"Ping target '{target.name}': {target.host}")

            self.target_map[target.name] = (target_id, checker, target)

        if not self.target_map:
            raise ValueError("No enabled targets configured")

        # Location tracking state
        self.current_ip = None
        self.current_location_id = None
        self.last_location_check = None

        # Rotation tracking
        self.last_rotation = datetime.utcnow()

        # Alert and notification system
        try:
            self.alert_config = PingAlertConfig()
            self.notify_config = NotifyConfig()
            if self.alert_config.alerts.get('enabled', False):
                logger.info("Alert system enabled")
        except Exception as e:
            logger.warning(f"Could not load alert config: {e}")
            self.alert_config = None
            self.notify_config = None

        # Signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGHUP, self._sighup_handler)

        logger.info(f"Monitor initialized with {len(self.target_map)} target(s)")

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

            # Rebuild target map with new targets
            old_targets = set(self.target_map.keys())
            new_target_map = {}

            for target in new_config.targets:
                if not target.enabled:
                    continue

                target_id = self.db.insert_target(
                    name=target.name,
                    host=target.host,
                    description=target.description,
                    enabled=target.enabled
                )

                # Create appropriate checker based on target type
                if target.is_http:
                    checker = HTTPChecker(
                        url=target.host,
                        method=target.http_method,
                        timeout=target.http_timeout,
                        expected_status=target.http_expected_status,
                        verify_ssl=target.http_verify_ssl
                    )
                else:
                    checker = Pinger(
                        host=target.host,
                        timeout=new_config.monitoring.ping_timeout,
                        count=new_config.monitoring.ping_count
                    )

                new_target_map[target.name] = (target_id, checker, target)

            if not new_target_map:
                logger.warning("No enabled targets in new config, keeping old configuration")
                return

            self.target_map = new_target_map
            new_targets = set(new_target_map.keys())

            # Log changes
            added = new_targets - old_targets
            removed = old_targets - new_targets
            if added:
                logger.info(f"Added targets: {', '.join(added)}")
            if removed:
                logger.info(f"Removed targets: {', '.join(removed)}")

            logger.info(f"Configuration reloaded successfully ({len(new_target_map)} target(s))")
        except Exception as e:
            logger.error(f"Failed to reload configuration: {e}")

    def _check_location(self) -> None:
        """Check and update location if needed"""
        if not self.config.location.enabled:
            return

        # Check if it's time to update location
        now = datetime.utcnow()
        if self.last_location_check:
            minutes_since_check = (now - self.last_location_check).total_seconds() / 60
            if minutes_since_check < self.config.location.check_interval_minutes:
                return  # Too soon to check again

        self.last_location_check = now

        # Get public IP
        try:
            public_ip = get_public_ip()
            if not public_ip:
                logger.warning("Could not determine public IP")
                return

            # Check if IP changed
            if public_ip == self.current_ip:
                # IP hasn't changed, just update last_seen
                if self.current_location_id:
                    self.db.conn.execute(
                        "UPDATE locations SET last_seen = ? WHERE id = ?",
                        (now.isoformat(), self.current_location_id)
                    )
                return

            # IP changed, get geolocation
            logger.info(f"Public IP changed: {self.current_ip} -> {public_ip}")
            self.current_ip = public_ip

            geo = get_geolocation(public_ip, self.config.location.geolocation_provider)
            if geo:
                self.current_location_id = self.db.upsert_location(
                    public_ip=public_ip,
                    isp=geo.get('isp'),
                    city=geo.get('city'),
                    region=geo.get('region'),
                    country=geo.get('country'),
                    latitude=geo.get('latitude'),
                    longitude=geo.get('longitude')
                )
                logger.info(f"Location updated: {geo.get('city')}, {geo.get('region')} (ISP: {geo.get('isp')})")
            else:
                # No geolocation data, just store IP
                self.current_location_id = self.db.upsert_location(public_ip=public_ip)

        except Exception as e:
            logger.error(f"Error checking location: {e}")

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

    def _check_single_target(self, target_name: str, target_id: int, checker, target) -> Dict:
        """
        Check a single target (ping or HTTP) and return results (runs in thread pool)

        Args:
            target_name: Name of target for logging
            target_id: Database ID of target
            checker: Pinger or HTTPChecker instance
            target: Target configuration object

        Returns:
            Dictionary with check result and metadata
        """
        try:
            # Check based on target type
            if target.is_http:
                result = checker.check()

                # Log to application logger
                if result.success and result.status == 'ONLINE':
                    logger.debug(f"[{target_name}] HTTP {result.status_code} ({result.response_time_ms:.2f}ms)")
                else:
                    logger.warning(f"[{target_name}] {result.status}: {result.error or result.status_code}")

                return {
                    'target_name': target_name,
                    'target_id': target_id,
                    'status': result.status,
                    'ping_ms': result.response_time_ms,
                    'error': result.error,
                    'http_status_code': result.status_code
                }
            else:
                # Ping target
                result = checker.ping()

                # Log to application logger
                if result.status == 'ONLINE':
                    logger.debug(f"[{target_name}] ONLINE ({result.latency_ms:.2f}ms)")
                else:
                    logger.warning(f"[{target_name}] {result.status}")

                return {
                    'target_name': target_name,
                    'target_id': target_id,
                    'status': result.status,
                    'ping_ms': result.latency_ms,
                    'error': None
                }

        except Exception as e:
            logger.error(f"Error checking {target_name}: {e}")
            return {
                'target_name': target_name,
                'target_id': target_id,
                'status': 'TIMEOUT',
                'ping_ms': None,
                'error': str(e)
            }

    async def _ping_all_targets_async(self) -> None:
        """Check all enabled targets concurrently and log results to database"""
        loop = asyncio.get_event_loop()

        # Use ThreadPoolExecutor to run checks concurrently (ping/HTTP requests block)
        with ThreadPoolExecutor(max_workers=len(self.target_map)) as executor:
            tasks = []
            for target_name, (target_id, checker, target) in self.target_map.items():
                task = loop.run_in_executor(
                    executor,
                    self._check_single_target,
                    target_name, target_id, checker, target
                )
                tasks.append(task)

            # Wait for all checks to complete and collect results
            results = await asyncio.gather(*tasks)

        # Write all results to database and check alerts
        for result in results:
            try:
                self.db.log_ping(
                    target_id=result['target_id'],
                    status=result['status'],
                    ping_ms=result['ping_ms'],
                    location_id=self.current_location_id,
                    http_status_code=result.get('http_status_code')
                )

                # Check if alert should be triggered
                if self.alert_config and self.notify_config:
                    check_and_alert(
                        self.db,
                        self.alert_config,
                        self.notify_config,
                        result['target_name'],
                        result['status'],
                        result['ping_ms']
                    )
            except Exception as e:
                logger.error(f"Failed to log ping for {result['target_name']}: {e}")

    def start(self) -> None:
        """Start the monitoring daemon"""
        logger.info("Starting ping monitor daemon")
        logger.info(f"Monitoring targets: {', '.join(self.target_map.keys())}")
        logger.info(f"Interval: {self.config.monitoring.interval_seconds}s")
        logger.info(f"Database: {self.config.general.database_path}")
        logger.info(f"Location tracking: {'enabled' if self.config.location.enabled else 'disabled'}")

        self.running = True

        # Initial location check
        if self.config.location.enabled:
            self._check_location()

        try:
            while self.running:
                iteration_start = time.time()

                # Check location periodically
                self._check_location()

                # Ping all targets concurrently
                asyncio.run(self._ping_all_targets_async())

                # Check if rotation needed
                self._check_rotation()

                # Sleep until next interval, accounting for execution time
                elapsed = time.time() - iteration_start
                sleep_time = max(0, self.config.monitoring.interval_seconds - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)

        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
        finally:
            self.stop()

    def stop(self) -> None:
        """Stop the monitoring daemon"""
        logger.info("Stopping ping monitor daemon")
        self.running = False

        if self.db:
            self.db.close()

        logger.info("Daemon stopped")


def main(config_path: Optional[Path] = None):
    """
    Main entry point for ping-monitor daemon

    Args:
        config_path: Optional path to config file
    """
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
        config = Config.load(config_path)
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
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
