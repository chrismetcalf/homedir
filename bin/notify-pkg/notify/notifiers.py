"""
Notification delivery methods for notify

Provides functions for sending notifications via various channels.
"""

import logging
import subprocess
from typing import Optional, Union

logger = logging.getLogger(__name__)

# Pushover priority levels
PRIORITY_SILENT = -2     # No notification/alert
PRIORITY_QUIET = -1      # No sound/vibration
PRIORITY_NORMAL = 0      # Normal priority
PRIORITY_HIGH = 1        # High priority (bypasses quiet hours)
PRIORITY_EMERGENCY = 2   # Emergency (requires acknowledgment)

PRIORITY_NAMES = {
    'silent': PRIORITY_SILENT,
    'quiet': PRIORITY_QUIET,
    'normal': PRIORITY_NORMAL,
    'high': PRIORITY_HIGH,
    'emergency': PRIORITY_EMERGENCY,
}


def parse_priority(priority: Union[str, int]) -> int:
    """
    Parse priority from name or number

    Args:
        priority: Priority level (name or number)

    Returns:
        Priority as integer (-2 to 2)
    """
    if isinstance(priority, int):
        return max(-2, min(2, priority))

    if isinstance(priority, str):
        return PRIORITY_NAMES.get(priority.lower(), PRIORITY_NORMAL)

    return PRIORITY_NORMAL


def send_wall_notification(title: str, message: str, prefix: str = "ALERT") -> bool:
    """
    Send wall notification to all logged-in users

    Args:
        title: Notification title
        message: Notification message
        prefix: Message prefix (default: "ALERT")

    Returns:
        True if successful
    """
    try:
        full_message = f"[{prefix}] {title}: {message}"
        subprocess.run(
            ['wall'],
            input=full_message.encode('utf-8'),
            check=True,
            capture_output=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.warning(f"Failed to send wall notification: {e}")
        return False


def send_pushover_notification(user_key: str, api_token: str, title: str,
                               message: str, priority: int = 0, sound: Optional[str] = None,
                               device: Optional[str] = None, url: Optional[str] = None,
                               url_title: Optional[str] = None, html: bool = False,
                               timestamp: Optional[int] = None, retry: int = 30,
                               expire: int = 3600, callback: Optional[str] = None) -> bool:
    """
    Send notification via Pushover

    Args:
        user_key: Pushover user key
        api_token: Pushover API token
        title: Notification title
        message: Notification message (max 1024 chars, supports HTML if html=True)
        priority: Priority level:
            -2 (silent)    - No notification/alert
            -1 (quiet)     - No sound/vibration
             0 (normal)    - Normal priority (default)
             1 (high)      - High priority (bypasses quiet hours)
             2 (emergency) - Requires acknowledgment (needs retry/expire)
        sound: Optional notification sound (see Pushover docs for available sounds)
        device: Optional device name to send to (omit for all devices)
        url: Optional supplementary URL to include
        url_title: Optional title for the URL
        html: Enable HTML formatting in message (default: False)
        timestamp: Optional Unix timestamp (defaults to current time)
        retry: For emergency priority: how often (seconds) to retry (min 30, default 30)
        expire: For emergency priority: how long (seconds) to retry (max 10800, default 3600)
        callback: Optional callback URL for emergency acknowledgment

    Returns:
        True if successful

    Note:
        - Icons must be set at the application level in Pushover web interface
        - Emergency priority (2) requires retry and expire parameters
        - Emergency priority will keep notifying until acknowledged or expired
    """
    try:
        import requests

        data = {
            'token': api_token,
            'user': user_key,
            'title': title,
            'message': message,
            'priority': priority
        }

        # Optional parameters
        if sound:
            data['sound'] = sound
        if device:
            data['device'] = device
        if url:
            data['url'] = url
        if url_title:
            data['url_title'] = url_title
        if html:
            data['html'] = 1
        if timestamp:
            data['timestamp'] = timestamp

        # Emergency priority requires retry and expire
        if priority == PRIORITY_EMERGENCY:
            data['retry'] = max(30, retry)  # Minimum 30 seconds
            data['expire'] = min(10800, expire)  # Maximum 10800 seconds (3 hours)
            if callback:
                data['callback'] = callback

        response = requests.post(
            'https://api.pushover.net/1/messages.json',
            data=data,
            timeout=10
        )

        if response.status_code == 200:
            return True
        else:
            logger.warning(f"Pushover API returned status {response.status_code}: {response.text}")
            return False

    except ImportError:
        logger.warning("requests library not installed, cannot send Pushover notification")
        return False
    except Exception as e:
        logger.warning(f"Failed to send Pushover notification: {e}")
        return False


def send_notification(config, title: str, message: str,
                     priority: Union[str, int] = 0, sound: Optional[str] = None,
                     prefix: str = "ALERT", log_history: bool = True,
                     device: Optional[str] = None, url: Optional[str] = None,
                     url_title: Optional[str] = None, html: bool = False,
                     timestamp: Optional[int] = None, retry: int = 30,
                     expire: int = 3600, callback: Optional[str] = None) -> dict:
    """
    Send notification via all enabled methods

    Args:
        config: NotifyConfig instance
        title: Notification title
        message: Notification message
        priority: Priority for pushover (name or -2 to 2, default 0/normal)
        sound: Optional sound for pushover
        prefix: Prefix for wall notifications (default: "ALERT")
        log_history: Whether to log to history database (default: True)
        device: Pushover device name to send to
        url: Supplementary URL for pushover
        url_title: Title for the URL
        html: Enable HTML formatting for pushover
        timestamp: Unix timestamp for pushover
        retry: Emergency priority retry interval (seconds)
        expire: Emergency priority expiration (seconds)
        callback: Emergency priority callback URL

    Returns:
        Dict with success status for each method
    """
    results = {}
    notifications = config.config.get('notifications', {})

    # Parse priority
    priority_int = parse_priority(priority)

    # Import history only if needed
    history = None
    if log_history:
        try:
            from .history import NotificationHistory
            history = NotificationHistory()
        except Exception as e:
            logger.warning(f"Failed to initialize history: {e}")

    if notifications.get('wall'):
        success = send_wall_notification(title, message, prefix=prefix)
        results['wall'] = success
        if history:
            history.log_notification(title, message, 'wall', success, priority_int, prefix)

    if notifications.get('pushover'):
        user_key, api_token = config.get_pushover_credentials()
        if user_key and api_token:
            success = send_pushover_notification(
                user_key,
                api_token,
                title,
                message,
                priority=priority_int,
                sound=sound,
                device=device,
                url=url,
                url_title=url_title,
                html=html,
                timestamp=timestamp,
                retry=retry,
                expire=expire,
                callback=callback
            )
            results['pushover'] = success
            if history:
                history.log_notification(title, message, 'pushover', success, priority_int)
        else:
            results['pushover'] = False
            logger.warning("Pushover enabled but credentials not configured")
            if history:
                history.log_notification(title, message, 'pushover', False, priority_int)

    if history:
        history.close()

    return results
