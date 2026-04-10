#!/usr/bin/env bash
# Frontdocs build script for Linux and macOS
# Usage: ./scripts/build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
err()   { printf "${RED}[ERR]${NC}   %s\n" "$*"; }

# ── Platform detection ──────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    PLATFORM="linux"
    case "$ARCH" in
      x86_64)  TRIPLE="x86_64-unknown-linux-gnu" ;;
      aarch64) TRIPLE="aarch64-unknown-linux-gnu" ;;
      *) err "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  Darwin)
    PLATFORM="macos"
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-apple-darwin" ;;
      arm64)  TRIPLE="aarch64-apple-darwin" ;;
      *) err "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    err "Unsupported OS: $OS (use build.ps1 for Windows)"
    exit 1
    ;;
esac

info "Platform: ${PLATFORM} (${TRIPLE})"

# ── Mode selection ──────────────────────────────────────────────────────────
if [[ "${1:-}" == "dev" || "${1:-}" == "prod" ]]; then
  MODE="$1"
else
  printf "\n${BOLD}Select build mode:${NC}\n"
  printf "  ${CYAN}1)${NC} dev   — Development build (debug, fast compile, dev tools)\n"
  printf "  ${CYAN}2)${NC} prod  — Production build (optimized, bundled for distribution)\n"
  printf "\n"
  read -rp "Choice [1/2]: " choice
  case "${choice}" in
    1|dev)  MODE="dev" ;;
    2|prod) MODE="prod" ;;
    *)
      err "Invalid choice: ${choice}"
      exit 1
      ;;
  esac
fi

printf "\n${BOLD}Building Frontdocs — ${MODE}${NC}\n\n"

# ── Prerequisites check ────────────────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command not found: $1"
    echo "  Install it and try again."
    exit 1
  fi
}

check_cmd node
check_cmd npm
check_cmd cargo
check_cmd rustc

NODE_VER="$(node -v)"
RUST_VER="$(rustc --version | awk '{print $2}')"
info "Node ${NODE_VER}, Rust ${RUST_VER}"

# ── Linux system dependencies ──────────────────────────────────────────────
if [[ "$PLATFORM" == "linux" ]]; then
  MISSING_LIBS=()
  for lib in libwebkit2gtk-4.1 libgtk-3 libsoup-3.0 libjavascriptcoregtk-4.1; do
    if ! pkg-config --exists "${lib}-0" 2>/dev/null && ! pkg-config --exists "$lib" 2>/dev/null; then
      MISSING_LIBS+=("$lib")
    fi
  done
  if [[ ${#MISSING_LIBS[@]} -gt 0 ]]; then
    warn "Possibly missing system libraries: ${MISSING_LIBS[*]}"
    warn "On Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev"
    warn "On Fedora: sudo dnf install webkit2gtk4.1-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel"
  fi
fi

# ── Install npm dependencies ───────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
  info "Installing npm dependencies..."
  npm install
  ok "npm dependencies installed"
else
  info "node_modules/ exists, skipping npm install (run npm install manually if needed)"
fi

# ── Ensure mdBook sidecar ─────────────────────────────────────────────────────
MDBOOK_SIDECAR="src-tauri/binaries/mdbook-${TRIPLE}"
if [[ ! -f "$MDBOOK_SIDECAR" ]]; then
  info "mdBook sidecar not found, downloading..."
  bash scripts/download-mdbook.sh
  ok "mdBook sidecar ready"
else
  info "mdBook sidecar found: ${MDBOOK_SIDECAR}"
fi

# ── Build ───────────────────────────────────────────────────────────────────
if [[ "$MODE" == "dev" ]]; then
  info "Starting development build..."
  info "Running: npm run tauri dev"
  echo ""
  npm run tauri dev
else
  info "Starting production build..."

  # Type-check frontend
  info "Type-checking Vue frontend..."
  npx vue-tsc --noEmit
  ok "TypeScript checks passed"

  # Build with Tauri
  info "Running: npm run tauri build"
  echo ""
  npm run tauri build

  echo ""
  ok "Production build complete!"

  # ── Locate artifacts ──────────────────────────────────────────────────
  BUNDLE_DIR="src-tauri/target/release/bundle"
  printf "\n${BOLD}Build artifacts:${NC}\n"

  if [[ "$PLATFORM" == "linux" ]]; then
    for fmt in deb rpm appimage; do
      DIR="${BUNDLE_DIR}/${fmt}"
      if [[ -d "$DIR" ]]; then
        while IFS= read -r f; do
          printf "  ${GREEN}•${NC} %s\n" "$f"
        done < <(find "$DIR" -maxdepth 1 -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \))
      fi
    done
  elif [[ "$PLATFORM" == "macos" ]]; then
    for fmt in dmg macos; do
      DIR="${BUNDLE_DIR}/${fmt}"
      if [[ -d "$DIR" ]]; then
        while IFS= read -r f; do
          printf "  ${GREEN}•${NC} %s\n" "$f"
        done < <(find "$DIR" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.app' \))
      fi
    done
  fi

  echo ""
  info "Artifacts are in: ${BUNDLE_DIR}/"
fi
