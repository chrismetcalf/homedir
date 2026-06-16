"""
Battery information reader with multi-platform support

Supports:
- Linux /sys/class/power_supply/ interface
- acpi/acpitool commands
- UPS devices via apcaccess
- PiSugar battery packs via TCP socket
"""

import logging
import re
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List

logger = logging.getLogger(__name__)


@dataclass
class BatteryInfo:
    """Battery status information"""
    percentage: Optional[float] = None  # Battery percentage (0-100)
    status: str = "Unknown"  # Charging, Discharging, Full, Not charging, Unknown
    voltage: Optional[float] = None  # Voltage in volts
    current: Optional[float] = None  # Current in amperes
    power: Optional[float] = None  # Power in watts
    capacity: Optional[float] = None  # Capacity in Wh or Ah
    temperature: Optional[float] = None  # Temperature in Celsius
    time_remaining: Optional[int] = None  # Time remaining in minutes
    cycle_count: Optional[int] = None  # Battery cycle count
    health: Optional[str] = None  # Battery health status
    manufacturer: Optional[str] = None
    model: Optional[str] = None


class BatteryReader:
    """Read battery information from various sources"""

    def __init__(self, battery_id: str = "BAT0", method: str = "auto", pisugar_host: str = "localhost", pisugar_port: int = 8423):
        """
        Initialize battery reader

        Args:
            battery_id: Battery identifier (e.g., BAT0, BAT1, pisugar, or "auto" for auto-detection)
            method: Detection method: auto, sysfs, acpi, acpitool, apcaccess, pisugar
            pisugar_host: PiSugar server host (default: localhost)
            pisugar_port: PiSugar server TCP port (default: 8423)
        """
        # Auto-detect battery ID if requested
        if battery_id == "auto":
            detected_id = self.auto_detect_battery()
            if detected_id is None:
                logger.error("No battery found during auto-detection")
                self.battery_id = "BAT0"  # Fallback
            else:
                self.battery_id = detected_id
                logger.info(f"Auto-detected battery: {self.battery_id}")
        else:
            self.battery_id = battery_id

        self.method = method
        self.pisugar_host = pisugar_host
        self.pisugar_port = pisugar_port
        self.sysfs_path = Path(f"/sys/class/power_supply/{self.battery_id}")

        # Auto-detect method if not specified
        if self.method == "auto":
            self.method = self._detect_method()

        logger.info(f"Battery reader initialized: method={self.method}, id={self.battery_id}")

    def _detect_method(self) -> str:
        """Auto-detect the best method to read battery info"""
        # Check for sysfs first (most reliable on Linux)
        if self.sysfs_path.exists():
            return "sysfs"

        # Check for acpitool
        try:
            subprocess.run(["acpitool", "-V"], capture_output=True, check=True, timeout=2)
            return "acpitool"
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Check for acpi
        try:
            subprocess.run(["acpi", "-V"], capture_output=True, check=True, timeout=2)
            return "acpi"
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Check for apcaccess (UPS)
        try:
            subprocess.run(["apcaccess", "status"], capture_output=True, check=True, timeout=2)
            return "apcaccess"
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

        # Check for PiSugar server
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.connect((self.pisugar_host, self.pisugar_port))
            sock.close()
            return "pisugar"
        except (socket.error, socket.timeout):
            pass

        logger.warning("No battery detection method available")
        return "none"

    def _read_sysfs(self) -> BatteryInfo:
        """Read battery info from /sys/class/power_supply/"""
        info = BatteryInfo()

        try:
            # Read status
            status_file = self.sysfs_path / "status"
            if status_file.exists():
                info.status = status_file.read_text().strip()

            # Read percentage (capacity)
            capacity_file = self.sysfs_path / "capacity"
            if capacity_file.exists():
                info.percentage = float(capacity_file.read_text().strip())

            # Read voltage (in microvolts)
            voltage_file = self.sysfs_path / "voltage_now"
            if voltage_file.exists():
                voltage_uv = int(voltage_file.read_text().strip())
                info.voltage = voltage_uv / 1_000_000  # Convert to volts

            # Read current (in microamperes)
            current_file = self.sysfs_path / "current_now"
            if current_file.exists():
                current_ua = int(current_file.read_text().strip())
                info.current = current_ua / 1_000_000  # Convert to amperes

            # Read power (in microwatts)
            power_file = self.sysfs_path / "power_now"
            if power_file.exists():
                power_uw = int(power_file.read_text().strip())
                info.power = power_uw / 1_000_000  # Convert to watts

            # Read energy (in microwatt-hours)
            energy_now = self.sysfs_path / "energy_now"
            energy_full = self.sysfs_path / "energy_full"
            if energy_now.exists() and energy_full.exists():
                energy_now_uwh = int(energy_now.read_text().strip())
                energy_full_uwh = int(energy_full.read_text().strip())
                info.capacity = energy_full_uwh / 1_000_000  # Convert to Wh
                # Calculate percentage from energy if not available from capacity
                if info.percentage is None:
                    info.percentage = (energy_now_uwh / energy_full_uwh) * 100

            # Read temperature (may not be available on all systems)
            temp_file = self.sysfs_path / "temp"
            if temp_file.exists():
                temp_decideg = int(temp_file.read_text().strip())
                info.temperature = temp_decideg / 10  # Convert to Celsius

            # Read cycle count
            cycle_file = self.sysfs_path / "cycle_count"
            if cycle_file.exists():
                info.cycle_count = int(cycle_file.read_text().strip())

            # Read manufacturer
            manufacturer_file = self.sysfs_path / "manufacturer"
            if manufacturer_file.exists():
                info.manufacturer = manufacturer_file.read_text().strip()

            # Read model
            model_file = self.sysfs_path / "model_name"
            if model_file.exists():
                info.model = model_file.read_text().strip()

            # Calculate time remaining if we have current and capacity
            if info.current and info.capacity and info.current > 0:
                if info.status == "Discharging":
                    hours_remaining = info.capacity / info.current
                    info.time_remaining = int(hours_remaining * 60)  # Convert to minutes
                elif info.status == "Charging" and info.percentage is not None:
                    # Estimate charging time based on remaining capacity
                    remaining_capacity = info.capacity * ((100 - info.percentage) / 100)
                    hours_remaining = remaining_capacity / info.current
                    info.time_remaining = int(hours_remaining * 60)  # Convert to minutes

        except Exception as e:
            logger.error(f"Error reading sysfs battery info: {e}")

        return info

    def _read_acpi(self) -> BatteryInfo:
        """Read battery info using acpi command"""
        info = BatteryInfo()

        try:
            result = subprocess.run(
                ["acpi", "-b", "-i"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return info

            output = result.stdout

            # Parse percentage: "Battery 0: Discharging, 85%, 02:30:00 remaining"
            pct_match = re.search(r'(\d+)%', output)
            if pct_match:
                info.percentage = float(pct_match.group(1))

            # Parse status
            if 'Charging' in output:
                info.status = 'Charging'
            elif 'Discharging' in output:
                info.status = 'Discharging'
            elif 'Full' in output:
                info.status = 'Full'
            elif 'Not charging' in output:
                info.status = 'Not charging'

            # Parse time remaining: "02:30:00"
            time_match = re.search(r'(\d+):(\d+):(\d+)', output)
            if time_match:
                hours = int(time_match.group(1))
                minutes = int(time_match.group(2))
                info.time_remaining = hours * 60 + minutes

        except Exception as e:
            logger.error(f"Error reading acpi battery info: {e}")

        return info

    def _read_acpitool(self) -> BatteryInfo:
        """Read battery info using acpitool command"""
        info = BatteryInfo()

        try:
            result = subprocess.run(
                ["acpitool", "-b"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return info

            output = result.stdout

            # Parse output: "Battery #1: Discharging, 85.5%, 02:30:15"
            pct_match = re.search(r'([\d.]+)%', output)
            if pct_match:
                info.percentage = float(pct_match.group(1))

            # Parse status
            if 'Charging' in output:
                info.status = 'Charging'
            elif 'Discharging' in output:
                info.status = 'Discharging'
            elif 'Full' in output:
                info.status = 'Full'

            # Parse time remaining
            time_match = re.search(r'(\d+):(\d+):(\d+)', output)
            if time_match:
                hours = int(time_match.group(1))
                minutes = int(time_match.group(2))
                info.time_remaining = hours * 60 + minutes

        except Exception as e:
            logger.error(f"Error reading acpitool battery info: {e}")

        return info

    def _read_apcaccess(self) -> BatteryInfo:
        """Read UPS battery info using apcaccess"""
        info = BatteryInfo()

        try:
            result = subprocess.run(
                ["apcaccess", "status"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return info

            output = result.stdout

            # Parse key-value pairs
            for line in output.split('\n'):
                if ':' not in line:
                    continue

                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()

                if key == 'BCHARGE':
                    # Battery charge percentage
                    pct_match = re.search(r'([\d.]+)', value)
                    if pct_match:
                        info.percentage = float(pct_match.group(1))

                elif key == 'STATUS':
                    # UPS status
                    if 'ONLINE' in value:
                        info.status = 'Charging' if info.percentage and info.percentage < 100 else 'Full'
                    elif 'ONBATT' in value:
                        info.status = 'Discharging'

                elif key == 'LINEV':
                    # Line voltage
                    volt_match = re.search(r'([\d.]+)', value)
                    if volt_match:
                        info.voltage = float(volt_match.group(1))

                elif key == 'LOADPCT':
                    # Load percentage -> can estimate power
                    pass

                elif key == 'TIMELEFT':
                    # Time left in minutes
                    time_match = re.search(r'([\d.]+)', value)
                    if time_match:
                        info.time_remaining = int(float(time_match.group(1)))

                elif key == 'BATTV':
                    # Battery voltage
                    volt_match = re.search(r'([\d.]+)', value)
                    if volt_match:
                        info.voltage = float(volt_match.group(1))

        except Exception as e:
            logger.error(f"Error reading apcaccess battery info: {e}")

        return info

    def _read_pisugar(self) -> BatteryInfo:
        """Read battery info from PiSugar server via TCP"""
        info = BatteryInfo()
        info.manufacturer = "PiSugar"

        def query_pisugar(command: str) -> Optional[str]:
            """Send command to PiSugar server and get response"""
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                sock.connect((self.pisugar_host, self.pisugar_port))
                sock.sendall((command + "\n").encode())
                response = sock.recv(1024).decode().strip()
                sock.close()
                return response
            except Exception as e:
                logger.debug(f"PiSugar query '{command}' failed: {e}")
                return None

        try:
            # Get battery percentage
            response = query_pisugar("get battery")
            if response and ":" in response:
                _, value = response.split(":", 1)
                info.percentage = float(value.strip())

            # Get battery voltage
            response = query_pisugar("get battery_v")
            if response and ":" in response:
                _, value = response.split(":", 1)
                info.voltage = float(value.strip())

            # Get battery current
            response = query_pisugar("get battery_i")
            if response and ":" in response:
                _, value = response.split(":", 1)
                info.current = abs(float(value.strip()))  # Make positive

            # Calculate power if we have voltage and current
            if info.voltage and info.current:
                info.power = info.voltage * info.current

            # Get charging status
            response = query_pisugar("get battery_charging")
            if response and ":" in response:
                _, value = response.split(":", 1)
                is_charging = value.strip().lower() == "true"

                # Get power plugged status
                response_plugged = query_pisugar("get battery_power_plugged")
                is_plugged = False
                if response_plugged and ":" in response_plugged:
                    _, value_plugged = response_plugged.split(":", 1)
                    is_plugged = value_plugged.strip().lower() == "true"

                # Determine status
                if info.percentage and info.percentage >= 99.5:
                    info.status = "Full"
                elif is_charging or is_plugged:
                    info.status = "Charging"
                else:
                    info.status = "Discharging"

            # Get model
            response = query_pisugar("get model")
            if response and ":" in response:
                _, value = response.split(":", 1)
                info.model = value.strip()

        except Exception as e:
            logger.error(f"Error reading PiSugar battery info: {e}")

        return info

    def read(self) -> BatteryInfo:
        """
        Read current battery information

        Returns:
            BatteryInfo object with current battery state
        """
        if self.method == "sysfs":
            return self._read_sysfs()
        elif self.method == "acpi":
            return self._read_acpi()
        elif self.method == "acpitool":
            return self._read_acpitool()
        elif self.method == "apcaccess":
            return self._read_apcaccess()
        elif self.method == "pisugar":
            return self._read_pisugar()
        else:
            logger.warning("No battery reading method available")
            return BatteryInfo(status="Unknown")

    def is_available(self) -> bool:
        """Check if battery information is available"""
        return self.method != "none"

    @staticmethod
    def list_batteries() -> List[str]:
        """List all available battery devices"""
        batteries = []

        # Check /sys/class/power_supply/
        power_supply_path = Path("/sys/class/power_supply")
        if power_supply_path.exists():
            for device in power_supply_path.iterdir():
                # Check if it's a battery (not AC adapter)
                type_file = device / "type"
                if type_file.exists():
                    device_type = type_file.read_text().strip()
                    if device_type == "Battery":
                        batteries.append(device.name)

        # Check for PiSugar server
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.connect(("localhost", 8423))
            sock.close()
            batteries.append("pisugar")
        except (socket.error, socket.timeout):
            pass

        return batteries

    @staticmethod
    def auto_detect_battery() -> Optional[str]:
        """
        Auto-detect the first available battery

        Returns:
            Battery ID string, or None if no battery found
        """
        batteries = BatteryReader.list_batteries()
        return batteries[0] if batteries else None
