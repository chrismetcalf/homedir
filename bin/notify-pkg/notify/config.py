"""
Configuration management for notify

Handles TOML configuration parsing, validation, and defaults.
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        raise ImportError("Please install tomli: pip install tomli")

try:
    import tomli_w
except ImportError:
    raise ImportError("Please install tomli_w: pip install tomli_w")

logger = logging.getLogger(__name__)


class NotifyConfig:
    """Notification configuration"""

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize notification configuration

        Args:
            config_path: Path to config file (default: ~/.config/notify/config.toml)
        """
        if config_path is None:
            config_path = Path.home() / ".config" / "notify" / "config.toml"

        self.config_path = Path(config_path)
        self.config = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        """Load notification configuration"""
        if not self.config_path.exists():
            return {
                'enabled': False,
                'notifications': {
                    'wall': False,
                    'pushover': False
                },
                'pushover': {}
            }

        with open(self.config_path, 'rb') as f:
            return tomllib.load(f)

    def save(self):
        """Save notification configuration"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'wb') as f:
            tomli_w.dump(self.config, f)

    def enable_notification(self, notification_type: str, **kwargs):
        """
        Enable a notification method

        Args:
            notification_type: Type of notification ('wall' or 'pushover')
            **kwargs: Additional configuration (user_key, api_token for pushover)
        """
        if 'notifications' not in self.config:
            self.config['notifications'] = {}

        if notification_type == 'wall':
            self.config['notifications']['wall'] = True
        elif notification_type == 'pushover':
            self.config['notifications']['pushover'] = True
            if 'pushover' not in self.config:
                self.config['pushover'] = {}
            if 'user_key' in kwargs:
                self.config['pushover']['user_key'] = kwargs['user_key']
            if 'api_token' in kwargs:
                self.config['pushover']['api_token'] = kwargs['api_token']

        self.config['enabled'] = True
        self.save()

    def disable_notification(self, notification_type: str):
        """Disable a notification method"""
        if 'notifications' not in self.config:
            return

        if notification_type == 'wall':
            self.config['notifications']['wall'] = False
        elif notification_type == 'pushover':
            self.config['notifications']['pushover'] = False

        # Check if any notifications are still enabled
        any_enabled = any(
            v for k, v in self.config['notifications'].items()
            if isinstance(v, bool) and v
        )
        if not any_enabled:
            self.config['enabled'] = False

        self.save()

    def is_enabled(self, notification_type: Optional[str] = None) -> bool:
        """
        Check if notifications are enabled

        Args:
            notification_type: Specific notification type to check, or None for any

        Returns:
            True if enabled
        """
        if not self.config.get('enabled', False):
            return False

        if notification_type is None:
            return True

        return self.config.get('notifications', {}).get(notification_type, False)

    def get_pushover_credentials(self) -> tuple[Optional[str], Optional[str]]:
        """Get Pushover credentials"""
        pushover = self.config.get('pushover', {})
        return pushover.get('user_key'), pushover.get('api_token')

    @classmethod
    def create_default(cls, path: Optional[Path] = None):
        """Create a default configuration file"""
        if path is None:
            path = Path.home() / ".config" / "notify" / "config.toml"

        path = Path(path).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)

        default_config = """# Notify Configuration

enabled = false

[notifications]
wall = false
pushover = false

[pushover]
# user_key = "YOUR_PUSHOVER_USER_KEY"
# api_token = "YOUR_PUSHOVER_API_TOKEN"
"""

        with open(path, "w") as f:
            f.write(default_config)

        print(f"Created default configuration at: {path}")
