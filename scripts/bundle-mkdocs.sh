#!/usr/bin/env bash
# Bundle mkdocs + mkdocs-material + pymdown-extensions into a standalone
# binary using PyInstaller. The output goes to src-tauri/binaries/ with the
# Tauri sidecar naming convention: mkdocs-<target-triple>
#
# Requirements: python3, python3-venv (or virtualenv)
# Usage: ./scripts/bundle-mkdocs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
err()   { printf "${RED}[ERR]${NC}   %s\n" "$*"; exit 1; }

# ── Platform detection ──────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64)  TRIPLE="x86_64-unknown-linux-gnu" ;;
      aarch64) TRIPLE="aarch64-unknown-linux-gnu" ;;
      *) err "Unsupported architecture: $ARCH" ;;
    esac
    ;;
  Darwin)
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-apple-darwin" ;;
      arm64)  TRIPLE="aarch64-apple-darwin" ;;
      *) err "Unsupported architecture: $ARCH" ;;
    esac
    ;;
  *)
    err "Unsupported OS: $OS (use bundle-mkdocs.ps1 on Windows)"
    ;;
esac

info "Bundling mkdocs for ${TRIPLE}"

VENV_DIR="$PROJECT_DIR/.mkdocs-venv"
BINARIES_DIR="$PROJECT_DIR/src-tauri/binaries"
WORK_DIR="$PROJECT_DIR/.pyinstaller-work"

mkdir -p "$BINARIES_DIR"

# ── Virtual environment ─────────────────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
  info "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── Install dependencies ────────────────────────────────────────────────────
info "Installing mkdocs and PyInstaller into venv..."
pip install --upgrade pip --quiet
pip install mkdocs mkdocs-material pymdown-extensions pyinstaller --quiet

# ── Run PyInstaller ─────────────────────────────────────────────────────────
info "Running PyInstaller (--onefile) ..."
cd "$PROJECT_DIR"

pyinstaller --onefile \
  --name mkdocs \
  --distpath "$BINARIES_DIR" \
  --workpath "$WORK_DIR" \
  --specpath "$WORK_DIR" \
  --collect-all mkdocs \
  --collect-all mkdocs_material \
  --collect-all material \
  --collect-all pymdownx \
  --collect-all markdown \
  --collect-all pygments \
  --collect-all jinja2 \
  --collect-all yaml \
  --collect-all mergedeep \
  --collect-all ghp_import \
  --collect-all pyyaml_env_tag \
  --collect-all pathspec \
  --collect-all paginate \
  --collect-all babel \
  --collect-all colorama \
  --clean \
  --noconfirm \
  "$SCRIPT_DIR/mkdocs_entry.py"

# ── Rename to Tauri sidecar convention ──────────────────────────────────────
mv "$BINARIES_DIR/mkdocs" "$BINARIES_DIR/mkdocs-${TRIPLE}"
chmod +x "$BINARIES_DIR/mkdocs-${TRIPLE}"

deactivate

ok "Sidecar ready: src-tauri/binaries/mkdocs-${TRIPLE}"
info "Size: $(du -h "$BINARIES_DIR/mkdocs-${TRIPLE}" | cut -f1)"
