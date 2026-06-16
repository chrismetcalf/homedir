#!/usr/bin/env python3
"""Setup script for notify package"""

from setuptools import setup, find_packages
from pathlib import Path

# Read version from package
version = {}
with open("notify/__init__.py") as f:
    for line in f:
        if line.startswith("__version__"):
            exec(line, version)

# Read README if it exists
readme_file = Path(__file__).parent / "README.md"
long_description = ""
if readme_file.exists():
    long_description = readme_file.read_text()

setup(
    name="notify",
    version=version.get("__version__", "1.0.0"),
    description="Generic notification system supporting wall and Pushover",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Your Name",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "requests>=2.25.0",
        "tomli>=2.0.0; python_version<'3.11'",
        "tomli-w>=1.0.0",
    ],
    entry_points={
        "console_scripts": [
            "notify=notify.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
