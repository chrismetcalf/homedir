"""
Target management utilities for ping-monitor

Provides functions for listing, adding, and removing monitoring targets.
"""

import logging
from pathlib import Path
from typing import List, Optional
import tomli
import tomli_w

from .config import Config, Target

logger = logging.getLogger(__name__)


def list_targets(config: Config) -> List[Target]:
    """
    List all configured targets

    Args:
        config: Config instance

    Returns:
        List of Target objects
    """
    return config.targets


def add_target(config_path: Optional[Path], name: str, host: str,
               description: Optional[str] = None) -> bool:
    """
    Add a new target to the configuration

    Args:
        config_path: Path to config file (None = default)
        name: Target name
        host: Target hostname or IP
        description: Optional description

    Returns:
        True if successful
    """
    if config_path is None:
        config_path = Path.home() / ".config" / "ping-monitor" / "config.toml"

    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        return False

    # Read existing config
    with open(config_path, 'rb') as f:
        data = tomli.load(f)

    # Check if target already exists
    for target in data.get('targets', []):
        if target['name'] == name:
            logger.error(f"Target '{name}' already exists")
            return False

    # Add new target
    new_target = {
        'name': name,
        'host': host,
    }
    if description:
        new_target['description'] = description

    if 'targets' not in data:
        data['targets'] = []
    data['targets'].append(new_target)

    # Write back to file
    with open(config_path, 'wb') as f:
        tomli_w.dump(data, f)

    logger.info(f"Added target '{name}' -> {host}")
    return True


def remove_target(config_path: Optional[Path], name: str) -> bool:
    """
    Remove a target from the configuration

    Args:
        config_path: Path to config file (None = default)
        name: Target name to remove

    Returns:
        True if successful
    """
    if config_path is None:
        config_path = Path.home() / ".config" / "ping-monitor" / "config.toml"

    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        return False

    # Read existing config
    with open(config_path, 'rb') as f:
        data = tomli.load(f)

    # Find and remove target
    targets = data.get('targets', [])
    original_count = len(targets)
    data['targets'] = [t for t in targets if t['name'] != name]

    if len(data['targets']) == original_count:
        logger.error(f"Target '{name}' not found")
        return False

    # Write back to file
    with open(config_path, 'wb') as f:
        tomli_w.dump(data, f)

    logger.info(f"Removed target '{name}'")
    return True


def format_targets_table(targets: List[Target]) -> str:
    """
    Format targets as a table

    Args:
        targets: List of Target objects

    Returns:
        Formatted string
    """
    if not targets:
        return "No targets configured"

    # Calculate column widths
    max_name = max(len(t.name) for t in targets)
    max_host = max(len(t.host) for t in targets)
    max_desc = max(len(t.description or "") for t in targets)

    # Header
    lines = []
    lines.append(f"{'NAME':<{max_name}}  {'HOST':<{max_host}}  DESCRIPTION")
    lines.append("-" * (max_name + max_host + max_desc + 4))

    # Rows
    for target in targets:
        desc = target.description or ""
        lines.append(f"{target.name:<{max_name}}  {target.host:<{max_host}}  {desc}")

    return "\n".join(lines)
