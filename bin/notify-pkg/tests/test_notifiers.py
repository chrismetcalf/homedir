"""
Tests for notify.notifiers module
"""

import pytest
import responses
from unittest.mock import patch, Mock
import subprocess

from notify.notifiers import (
    parse_priority,
    send_wall_notification,
    send_pushover_notification,
    send_notification,
    PRIORITY_SILENT,
    PRIORITY_QUIET,
    PRIORITY_NORMAL,
    PRIORITY_HIGH,
    PRIORITY_EMERGENCY
)


class TestParsePriority:
    """Test priority parsing"""

    def test_parse_priority_from_name(self):
        assert parse_priority('silent') == PRIORITY_SILENT
        assert parse_priority('quiet') == PRIORITY_QUIET
        assert parse_priority('normal') == PRIORITY_NORMAL
        assert parse_priority('high') == PRIORITY_HIGH
        assert parse_priority('emergency') == PRIORITY_EMERGENCY

    def test_parse_priority_case_insensitive(self):
        assert parse_priority('SILENT') == PRIORITY_SILENT
        assert parse_priority('High') == PRIORITY_HIGH

    def test_parse_priority_from_int(self):
        assert parse_priority(-2) == -2
        assert parse_priority(-1) == -1
        assert parse_priority(0) == 0
        assert parse_priority(1) == 1
        assert parse_priority(2) == 2

    def test_parse_priority_clamping(self):
        """Test that values outside -2 to 2 are clamped"""
        assert parse_priority(-10) == -2
        assert parse_priority(10) == 2

    def test_parse_priority_invalid_name(self):
        """Unknown names default to normal"""
        assert parse_priority('invalid') == PRIORITY_NORMAL

    def test_parse_priority_none(self):
        """None defaults to normal"""
        assert parse_priority(None) == PRIORITY_NORMAL


class TestWallNotification:
    """Test wall notification sending"""

    @patch('notify.notifiers.subprocess.run')
    def test_send_wall_notification_success(self, mock_run):
        """Test successful wall notification"""
        mock_run.return_value = Mock(returncode=0)

        result = send_wall_notification("Test Title", "Test message")

        assert result is True
        mock_run.assert_called_once()
        args, kwargs = mock_run.call_args
        assert args[0] == ['wall']
        assert kwargs['input'] == b'[ALERT] Test Title: Test message'

    @patch('notify.notifiers.subprocess.run')
    def test_send_wall_notification_custom_prefix(self, mock_run):
        """Test wall notification with custom prefix"""
        mock_run.return_value = Mock(returncode=0)

        send_wall_notification("Title", "Message", prefix="CUSTOM")

        args, kwargs = mock_run.call_args
        assert kwargs['input'] == b'[CUSTOM] Title: Message'

    @patch('notify.notifiers.subprocess.run')
    def test_send_wall_notification_failure(self, mock_run):
        """Test wall notification failure"""
        mock_run.side_effect = subprocess.CalledProcessError(1, 'wall')

        result = send_wall_notification("Title", "Message")

        assert result is False

    @patch('notify.notifiers.subprocess.run')
    def test_send_wall_notification_command_not_found(self, mock_run):
        """Test when wall command doesn't exist"""
        mock_run.side_effect = FileNotFoundError()

        result = send_wall_notification("Title", "Message")

        assert result is False


class TestPushoverNotification:
    """Test Pushover notification sending"""

    @responses.activate
    def test_send_pushover_notification_success(self):
        """Test successful Pushover notification"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Test Title",
            "Test message"
        )

        assert result is True
        assert len(responses.calls) == 1
        request = responses.calls[0].request
        request_body = request.body if isinstance(request.body, str) else request.body.decode()
        assert 'user_key' in request_body
        assert 'api_token' in request_body

    @responses.activate
    def test_send_pushover_notification_with_priority(self):
        """Test Pushover notification with priority"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Title",
            "Message",
            priority=PRIORITY_HIGH
        )

        assert result is True
        request_body = responses.calls[0].request.body if isinstance(responses.calls[0].request.body, str) else responses.calls[0].request.body.decode()
        assert 'priority=1' in request_body

    @responses.activate
    def test_send_pushover_notification_with_sound(self):
        """Test Pushover notification with custom sound"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Title",
            "Message",
            sound="siren"
        )

        assert result is True
        request_body = responses.calls[0].request.body if isinstance(responses.calls[0].request.body, str) else responses.calls[0].request.body.decode()
        assert 'sound=siren' in request_body

    @responses.activate
    def test_send_pushover_notification_with_url(self):
        """Test Pushover notification with URL"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Title",
            "Message",
            url="https://example.com",
            url_title="Example"
        )

        assert result is True
        request_body = responses.calls[0].request.body if isinstance(responses.calls[0].request.body, str) else responses.calls[0].request.body.decode()
        assert 'url=https' in request_body
        assert 'url_title=Example' in request_body

    @responses.activate
    def test_send_pushover_notification_emergency_priority(self):
        """Test emergency priority with retry and expire"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "CRITICAL",
            "Server down!",
            priority=PRIORITY_EMERGENCY,
            retry=60,
            expire=3600
        )

        assert result is True
        request_body = responses.calls[0].request.body if isinstance(responses.calls[0].request.body, str) else responses.calls[0].request.body.decode()
        assert 'priority=2' in request_body
        assert 'retry=60' in request_body
        assert 'expire=3600' in request_body

    @responses.activate
    def test_send_pushover_notification_html(self):
        """Test HTML formatted message"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 1},
            status=200
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Title",
            "<b>Bold</b> text",
            html=True
        )

        assert result is True
        request_body = responses.calls[0].request.body if isinstance(responses.calls[0].request.body, str) else responses.calls[0].request.body.decode()
        assert 'html=1' in request_body

    @responses.activate
    def test_send_pushover_notification_failure(self):
        """Test Pushover API failure"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            json={'status': 0, 'errors': ['invalid token']},
            status=400
        )

        result = send_pushover_notification(
            "invalid_key",
            "invalid_token",
            "Title",
            "Message"
        )

        assert result is False

    @responses.activate
    def test_send_pushover_notification_network_error(self):
        """Test network error"""
        responses.add(
            responses.POST,
            'https://api.pushover.net/1/messages.json',
            body=Exception("Network error")
        )

        result = send_pushover_notification(
            "user_key",
            "api_token",
            "Title",
            "Message"
        )

        assert result is False


class TestSendNotification:
    """Test the main send_notification function"""

    @patch('notify.notifiers.send_wall_notification')
    @patch('notify.notifiers.send_pushover_notification')
    def test_send_notification_both_enabled(self, mock_pushover, mock_wall):
        """Test sending to both methods when both enabled"""
        mock_wall.return_value = True
        mock_pushover.return_value = True

        # Mock config
        config = Mock()
        config.config = {
            'notifications': {
                'wall': True,
                'pushover': True
            }
        }
        config.get_pushover_credentials.return_value = ('user_key', 'api_token')

        results = send_notification(
            config,
            "Title",
            "Message",
            priority="normal"
        )

        assert results['wall'] is True
        assert results['pushover'] is True
        mock_wall.assert_called_once()
        mock_pushover.assert_called_once()

    @patch('notify.notifiers.send_wall_notification')
    def test_send_notification_wall_only(self, mock_wall):
        """Test wall-only notification"""
        mock_wall.return_value = True

        config = Mock()
        config.config = {
            'notifications': {
                'wall': True,
                'pushover': False
            }
        }

        results = send_notification(config, "Title", "Message")

        assert results['wall'] is True
        assert 'pushover' not in results
        mock_wall.assert_called_once()

    @patch('notify.notifiers.send_pushover_notification')
    def test_send_notification_pushover_only(self, mock_pushover):
        """Test Pushover-only notification"""
        mock_pushover.return_value = True

        config = Mock()
        config.config = {
            'notifications': {
                'wall': False,
                'pushover': True
            }
        }
        config.get_pushover_credentials.return_value = ('user_key', 'api_token')

        results = send_notification(config, "Title", "Message")

        assert 'wall' not in results
        assert results['pushover'] is True
        mock_pushover.assert_called_once()

    @patch('notify.notifiers.send_pushover_notification')
    def test_send_notification_missing_credentials(self, mock_pushover):
        """Test Pushover enabled but no credentials"""
        config = Mock()
        config.config = {
            'notifications': {
                'pushover': True
            }
        }
        config.get_pushover_credentials.return_value = (None, None)

        results = send_notification(config, "Title", "Message")

        assert results['pushover'] is False
        mock_pushover.assert_not_called()

    @patch('notify.notifiers.send_pushover_notification')
    def test_send_notification_with_all_options(self, mock_pushover):
        """Test notification with all optional parameters"""
        mock_pushover.return_value = True

        config = Mock()
        config.config = {
            'notifications': {
                'pushover': True
            }
        }
        config.get_pushover_credentials.return_value = ('user_key', 'api_token')

        send_notification(
            config,
            "Title",
            "Message",
            priority="high",
            sound="siren",
            prefix="TEST",
            device="iphone",
            url="https://example.com",
            url_title="Example",
            html=True,
            retry=60,
            expire=3600,
            callback="https://callback.example.com"
        )

        mock_pushover.assert_called_once()
        # Verify all parameters were passed
        args, kwargs = mock_pushover.call_args
        assert kwargs['sound'] == 'siren'
        assert kwargs['device'] == 'iphone'
        assert kwargs['url'] == 'https://example.com'
        assert kwargs['url_title'] == 'Example'
        assert kwargs['html'] is True
        assert kwargs['retry'] == 60
        assert kwargs['expire'] == 3600
        assert kwargs['callback'] == 'https://callback.example.com'
