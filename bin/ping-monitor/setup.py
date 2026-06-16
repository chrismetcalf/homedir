"""
Setup script for ping-monitor

Install with: pip install --user -e .
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read long description from README
readme_file = Path(__file__).parent / "README.md"
long_description = ""
if readme_file.exists():
    long_description = readme_file.read_text()

setup(
    name="ping-monitor",
    version="2.0.0",
    author="Claude Code",
    description="Network connectivity monitoring with location tracking",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/ping-monitor",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "icmplib>=3.0",
        "requests>=2.28",
        "tomli>=2.0; python_version<'3.11'",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov>=4.0",
        ],
        "viz": [
            "plotext>=5.0",
            "rich>=13.0",
            "textual>=0.40",
        ],
    },
    entry_points={
        "console_scripts": [
            "ping-monitor=pingmon.monitor:main",
            "ping-monitor-migrate=pingmon.migrate:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: System Administrators",
        "Topic :: System :: Monitoring",
        "Topic :: System :: Networking :: Monitoring",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
