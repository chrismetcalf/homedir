"""
notify - Generic notification system

A reusable Python package for sending notifications via multiple channels:
- Wall (shell announcements)
- Pushover (mobile/desktop push notifications)

Includes alert/threshold management for monitoring applications.

Can be used as a library or from the command line.
"""

__version__ = "1.1.0"

from .config import NotifyConfig
from .notifiers import (
    send_notification,
    send_wall_notification,
    send_pushover_notification,
    PRIORITY_SILENT,
    PRIORITY_QUIET,
    PRIORITY_NORMAL,
    PRIORITY_HIGH,
    PRIORITY_EMERGENCY
)
from .alerts import AlertConfig, AlertThreshold, AlertManager, AlertDebouncer, HysteresisDebouncer

__all__ = [
    'NotifyConfig',
    'send_notification',
    'send_wall_notification',
    'send_pushover_notification',
    'PRIORITY_SILENT',
    'PRIORITY_QUIET',
    'PRIORITY_NORMAL',
    'PRIORITY_HIGH',
    'PRIORITY_EMERGENCY',
    'AlertConfig',
    'AlertThreshold',
    'AlertManager',
    'AlertDebouncer',
    'HysteresisDebouncer'
]
