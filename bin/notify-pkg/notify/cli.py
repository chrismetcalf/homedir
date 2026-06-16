"""
Command-line interface for notify

Provides CLI for sending notifications from the command line.
"""

import argparse
import logging
import sys
from pathlib import Path

from .config import NotifyConfig
from .notifiers import send_notification


def main():
    """Main entry point for notify CLI"""
    parser = argparse.ArgumentParser(
        description="Notify - Generic notification system"
    )

    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file"
    )
    parser.add_argument(
        "--init-config",
        action="store_true",
        help="Create default configuration file and exit"
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # send command
    send_parser = subparsers.add_parser("send", help="Send a notification")
    send_parser.add_argument("title", help="Notification title")
    send_parser.add_argument("message", help="Notification message")
    send_parser.add_argument(
        "-p", "--priority",
        default="normal",
        help="Priority level: silent, quiet, normal, high, emergency (or -2 to 2, default: normal)"
    )
    send_parser.add_argument(
        "-s", "--sound",
        help="Pushover notification sound"
    )
    send_parser.add_argument(
        "--prefix",
        default="NOTIFY",
        help="Wall notification prefix (default: NOTIFY)"
    )
    send_parser.add_argument(
        "-w", "--wall-only",
        action="store_true",
        help="Send wall notification only"
    )
    send_parser.add_argument(
        "-P", "--pushover-only",
        action="store_true",
        help="Send Pushover notification only"
    )
    # Pushover-specific options
    send_parser.add_argument(
        "--device",
        help="Pushover device name to send to (omit for all devices)"
    )
    send_parser.add_argument(
        "--url",
        help="Supplementary URL to include in notification"
    )
    send_parser.add_argument(
        "--url-title",
        help="Title for the URL"
    )
    send_parser.add_argument(
        "--html",
        action="store_true",
        help="Enable HTML formatting in message"
    )
    send_parser.add_argument(
        "--retry",
        type=int,
        default=30,
        help="Emergency priority: retry interval in seconds (min 30, default 30)"
    )
    send_parser.add_argument(
        "--expire",
        type=int,
        default=3600,
        help="Emergency priority: expiration in seconds (max 10800, default 3600)"
    )
    send_parser.add_argument(
        "--callback",
        help="Emergency priority: callback URL for acknowledgment"
    )

    # enable command
    enable_parser = subparsers.add_parser("enable", help="Enable notification method")
    enable_parser.add_argument(
        "method",
        choices=["wall", "pushover"],
        help="Notification method to enable"
    )
    enable_parser.add_argument(
        "--user-key",
        help="Pushover user key (required for pushover)"
    )
    enable_parser.add_argument(
        "--api-token",
        help="Pushover API token (required for pushover)"
    )

    # disable command
    disable_parser = subparsers.add_parser("disable", help="Disable notification method")
    disable_parser.add_argument(
        "method",
        choices=["wall", "pushover"],
        help="Notification method to disable"
    )

    # status command
    status_parser = subparsers.add_parser("status", help="Show configuration status")

    # test command
    test_parser = subparsers.add_parser("test", help="Send test notification")
    test_parser.add_argument(
        "-m", "--method",
        choices=["wall", "pushover", "all"],
        default="all",
        help="Which method to test (default: all)"
    )

    args = parser.parse_args()

    # Set up logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s: %(message)s'
    )

    # Handle --init-config
    if args.init_config:
        NotifyConfig.create_default(args.config)
        return 0

    # Load configuration
    config = NotifyConfig(args.config)

    # Handle commands
    if args.command == "send":
        # Temporarily override config if wall-only or pushover-only
        if args.wall_only:
            config.config['notifications']['pushover'] = False
        if args.pushover_only:
            config.config['notifications']['wall'] = False

        results = send_notification(
            config,
            args.title,
            args.message,
            priority=args.priority,
            sound=args.sound,
            prefix=args.prefix,
            device=args.device,
            url=args.url,
            url_title=args.url_title,
            html=args.html,
            retry=args.retry,
            expire=args.expire,
            callback=args.callback
        )

        if not results:
            print("No notification methods enabled", file=sys.stderr)
            return 1

        for method, success in results.items():
            status = "✓" if success else "✗"
            print(f"{status} {method}")

        # Return 0 if any succeeded
        return 0 if any(results.values()) else 1

    elif args.command == "enable":
        if args.method == "pushover":
            if not args.user_key or not args.api_token:
                print("Error: --user-key and --api-token required for pushover", file=sys.stderr)
                return 1
            config.enable_notification(
                args.method,
                user_key=args.user_key,
                api_token=args.api_token
            )
        else:
            config.enable_notification(args.method)
        print(f"Enabled {args.method} notifications")
        return 0

    elif args.command == "disable":
        config.disable_notification(args.method)
        print(f"Disabled {args.method} notifications")
        return 0

    elif args.command == "status":
        enabled = config.config.get('enabled', False)
        print(f"Notifications: {'ENABLED' if enabled else 'DISABLED'}")
        print()
        print("Methods:")
        notifications = config.config.get('notifications', {})
        print(f"  Wall:     {'✓' if notifications.get('wall') else '✗'}")
        print(f"  Pushover: {'✓' if notifications.get('pushover') else '✗'}")

        if notifications.get('pushover'):
            user_key, api_token = config.get_pushover_credentials()
            print()
            print("Pushover:")
            print(f"  User key:  {'configured' if user_key else 'NOT SET'}")
            print(f"  API token: {'configured' if api_token else 'NOT SET'}")

        return 0

    elif args.command == "test":
        if args.method == "wall":
            config.config['notifications']['pushover'] = False
        elif args.method == "pushover":
            config.config['notifications']['wall'] = False

        results = send_notification(
            config,
            "Notify Test",
            "This is a test notification from notify",
            priority=0
        )

        if not results:
            print("No notification methods enabled", file=sys.stderr)
            return 1

        for method, success in results.items():
            status = "✓" if success else "✗"
            print(f"{status} {method} test notification sent")

        return 0 if any(results.values()) else 1

    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
