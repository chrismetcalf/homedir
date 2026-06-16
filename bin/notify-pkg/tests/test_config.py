"""
Tests for notify.config module
"""

import pytest
from pathlib import Path
import tempfile
import shutil

from notify.config import NotifyConfig


class TestNotifyConfig:
    """Test NotifyConfig class"""

    @pytest.fixture
    def temp_config_dir(self):
        """Create a temporary config directory"""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def config_path(self, temp_config_dir):
        """Return a temporary config file path"""
        return temp_config_dir / "config.toml"

    def test_default_config_creation(self, config_path):
        """Test default configuration creation"""
        config = NotifyConfig(config_path)

        assert config.config['enabled'] is False
        assert config.config['notifications']['wall'] is False
        assert config.config['notifications']['pushover'] is False

    def test_load_existing_config(self, config_path):
        """Test loading an existing configuration"""
        # Create a config file
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text("""
enabled = true

[notifications]
wall = true
pushover = true

[pushover]
user_key = "test_user_key"
api_token = "test_api_token"
""")

        config = NotifyConfig(config_path)

        assert config.config['enabled'] is True
        assert config.config['notifications']['wall'] is True
        assert config.config['notifications']['pushover'] is True
        assert config.config['pushover']['user_key'] == "test_user_key"
        assert config.config['pushover']['api_token'] == "test_api_token"

    def test_enable_disable_notifications(self, config_path):
        """Test enabling and disabling notifications globally"""
        config = NotifyConfig(config_path)

        # Enable by setting directly
        config.config['enabled'] = True
        assert config.config['enabled'] is True

        # Disable
        config.config['enabled'] = False
        assert config.config['enabled'] is False

    def test_enable_wall_notification(self, config_path):
        """Test enabling wall notifications"""
        config = NotifyConfig(config_path)

        config.enable_notification('wall')

        assert config.config['notifications']['wall'] is True
        assert config.config['enabled'] is True

    def test_enable_pushover_notification(self, config_path):
        """Test enabling Pushover notifications"""
        config = NotifyConfig(config_path)

        config.enable_notification(
            'pushover',
            user_key='test_key',
            api_token='test_token'
        )

        assert config.config['notifications']['pushover'] is True
        assert config.config['pushover']['user_key'] == 'test_key'
        assert config.config['pushover']['api_token'] == 'test_token'
        assert config.config['enabled'] is True

    def test_disable_wall_notification(self, config_path):
        """Test disabling wall notifications"""
        config = NotifyConfig(config_path)
        config.enable_notification('wall')
        config.enable_notification('pushover', user_key='key', api_token='token')

        config.disable_notification('wall')

        assert config.config['notifications']['wall'] is False
        # Pushover still enabled, so global enabled should be True
        assert config.config['enabled'] is True

    def test_disable_all_notifications(self, config_path):
        """Test that disabling all methods disables globally"""
        config = NotifyConfig(config_path)
        config.enable_notification('wall')
        config.enable_notification('pushover', user_key='key', api_token='token')

        # Disable both
        config.disable_notification('wall')
        config.disable_notification('pushover')

        assert config.config['enabled'] is False

    def test_get_pushover_credentials(self, config_path):
        """Test retrieving Pushover credentials"""
        config = NotifyConfig(config_path)
        config.enable_notification(
            'pushover',
            user_key='my_key',
            api_token='my_token'
        )

        user_key, api_token = config.get_pushover_credentials()

        assert user_key == 'my_key'
        assert api_token == 'my_token'

    def test_get_pushover_credentials_not_set(self, config_path):
        """Test retrieving credentials when not set"""
        config = NotifyConfig(config_path)

        user_key, api_token = config.get_pushover_credentials()

        assert user_key is None
        assert api_token is None

    def test_config_persistence(self, config_path):
        """Test that configuration persists to file"""
        config1 = NotifyConfig(config_path)
        config1.enable_notification('wall')
        config1.enable_notification('pushover', user_key='key', api_token='token')

        # Create a new instance and verify it loads saved config
        config2 = NotifyConfig(config_path)

        assert config2.config['enabled'] is True
        assert config2.config['notifications']['wall'] is True
        assert config2.config['notifications']['pushover'] is True
        user_key, api_token = config2.get_pushover_credentials()
        assert user_key == 'key'
        assert api_token == 'token'

    def test_create_default_config_file(self, config_path):
        """Test creating a default config file"""
        NotifyConfig.create_default(config_path)

        assert config_path.exists()
        config = NotifyConfig(config_path)
        assert config.config['enabled'] is False

    def test_invalid_toml_raises_error(self, config_path):
        """Test that invalid TOML raises an error"""
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text("invalid toml content {[}]")

        # Should raise a TOML decode error
        with pytest.raises(Exception):  # tomllib.TOMLDecodeError or tomli.TOMLDecodeError
            config = NotifyConfig(config_path)
