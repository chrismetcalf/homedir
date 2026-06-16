"""
Pytest configuration and fixtures for notify tests
"""

import pytest
import sys
from pathlib import Path

# Add notify package to path
sys.path.insert(0, str(Path(__file__).parent.parent))
