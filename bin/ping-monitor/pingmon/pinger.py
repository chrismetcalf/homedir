"""
Ping functionality for network connectivity monitoring

Uses icmplib for pure Python ICMP pings with fallback to fping.
"""

import logging
import subprocess
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import icmplib
try:
    from icmplib import ping as icmp_ping
    from icmplib.exceptions import NameLookupError, ICMPLibError
    HAS_ICMPLIB = True
except ImportError:
    HAS_ICMPLIB = False
    logger.warning("icmplib not available, will use fping fallback")


@dataclass
class PingResult:
    """Result of a ping operation"""
    host: str
    status: str  # 'ONLINE', 'OFFLINE', or 'TIMEOUT'
    latency_ms: Optional[float] = None
    packets_sent: int = 1
    packets_received: int = 0
    error: Optional[str] = None


class Pinger:
    """Network ping functionality"""

    def __init__(self, host: str, timeout: int = 5, count: int = 1):
        """
        Initialize pinger for a specific host

        Args:
            host: Hostname or IP address to ping
            timeout: Ping timeout in seconds
            count: Number of pings to send
        """
        self.host = host
        self.timeout = timeout
        self.count = count

    def ping(self) -> PingResult:
        """
        Ping the host and return result

        Returns:
            PingResult with status and latency information
        """
        if HAS_ICMPLIB:
            return self._ping_icmplib()
        else:
            return self._ping_fping()

    def _ping_icmplib(self) -> PingResult:
        """
        Ping using icmplib (pure Python)

        Returns:
            PingResult
        """
        try:
            # Perform ping (privileged=False uses UDP on port 55; may require setup)
            # In practice, icmplib will try to use raw sockets first
            host_info = icmp_ping(
                self.host,
                count=self.count,
                timeout=self.timeout,
                privileged=False  # Try unprivileged first
            )

            if host_info.is_alive:
                return PingResult(
                    host=self.host,
                    status='ONLINE',
                    latency_ms=host_info.avg_rtt,
                    packets_sent=host_info.packets_sent,
                    packets_received=host_info.packets_received
                )
            else:
                return PingResult(
                    host=self.host,
                    status='OFFLINE',
                    packets_sent=host_info.packets_sent,
                    packets_received=host_info.packets_received
                )

        except NameLookupError as e:
            logger.error(f"DNS lookup failed for {self.host}: {e}")
            return PingResult(
                host=self.host,
                status='OFFLINE',
                error=f"DNS lookup failed: {e}"
            )

        except ICMPLibError as e:
            logger.error(f"ICMP error pinging {self.host}: {e}")
            return PingResult(
                host=self.host,
                status='TIMEOUT',
                error=f"ICMP error: {e}"
            )

        except PermissionError:
            logger.warning(f"Permission error with icmplib, falling back to fping")
            return self._ping_fping()

        except Exception as e:
            logger.error(f"Unexpected error pinging {self.host}: {e}")
            return PingResult(
                host=self.host,
                status='TIMEOUT',
                error=f"Unexpected error: {e}"
            )

    def _ping_fping(self) -> PingResult:
        """
        Ping using fping command (fallback)

        Returns:
            PingResult
        """
        try:
            # Run fping command
            cmd = [
                'fping',
                '-c', str(self.count),
                '-t', str(self.timeout * 1000),  # fping uses milliseconds
                '-q',  # Quiet mode
                self.host
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout + 1
            )

            # Parse fping output from stderr
            # Format: "8.8.8.8 : xmt/rcv/%loss = 1/1/0%, min/avg/max = 14.2/14.2/14.2"
            stderr = result.stderr.strip()

            if result.returncode == 0:
                # Parse latency from output
                latency = None
                if 'min/avg/max' in stderr:
                    try:
                        parts = stderr.split('=')[-1].strip().split('/')
                        latency = float(parts[1])  # avg latency
                    except (IndexError, ValueError) as e:
                        logger.warning(f"Could not parse fping latency: {e}")

                return PingResult(
                    host=self.host,
                    status='ONLINE',
                    latency_ms=latency,
                    packets_sent=self.count,
                    packets_received=self.count
                )
            else:
                # Host unreachable or timeout
                return PingResult(
                    host=self.host,
                    status='OFFLINE',
                    packets_sent=self.count,
                    packets_received=0
                )

        except subprocess.TimeoutExpired:
            logger.warning(f"fping timeout for {self.host}")
            return PingResult(
                host=self.host,
                status='TIMEOUT',
                error="fping timeout"
            )

        except FileNotFoundError:
            logger.error("fping command not found - please install fping or icmplib")
            return PingResult(
                host=self.host,
                status='OFFLINE',
                error="fping not installed"
            )

        except Exception as e:
            logger.error(f"Error running fping: {e}")
            return PingResult(
                host=self.host,
                status='TIMEOUT',
                error=f"fping error: {e}"
            )


def get_public_ip() -> Optional[str]:
    """
    Get current public IP address using external service

    Returns:
        Public IP address or None if unavailable
    """
    try:
        import requests
        # Use fast, reliable service
        response = requests.get('https://api.ipify.org', timeout=5)
        if response.status_code == 200:
            ip = response.text.strip()
            logger.debug(f"Public IP: {ip}")
            return ip
    except Exception as e:
        logger.warning(f"Could not determine public IP: {e}")

    return None


def get_geolocation(ip: str, provider: str = "ipapi.co") -> Optional[dict]:
    """
    Get geolocation data for an IP address

    Args:
        ip: IP address to lookup
        provider: Geolocation provider ('ipapi.co' or 'ip-api.com')

    Returns:
        Dictionary with location data or None if unavailable
    """
    try:
        import requests

        if provider == "ipapi.co":
            url = f"https://ipapi.co/{ip}/json/"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return {
                    'isp': data.get('org', ''),
                    'city': data.get('city', ''),
                    'region': data.get('region', ''),
                    'country': data.get('country_name', ''),
                    'latitude': data.get('latitude'),
                    'longitude': data.get('longitude')
                }

        elif provider == "ip-api.com":
            url = f"https://ip-api.com/json/{ip}"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success':
                    return {
                        'isp': data.get('isp', ''),
                        'city': data.get('city', ''),
                        'region': data.get('regionName', ''),
                        'country': data.get('country', ''),
                        'latitude': data.get('lat'),
                        'longitude': data.get('lon')
                    }

    except Exception as e:
        logger.warning(f"Geolocation lookup failed for {ip}: {e}")

    return None
