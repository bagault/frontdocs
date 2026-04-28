#!/usr/bin/env python3
"""Frontdocs: bundled MkDocs entry point for PyInstaller."""
import sys
from mkdocs.__main__ import cli

if __name__ == "__main__":
    sys.exit(cli())
