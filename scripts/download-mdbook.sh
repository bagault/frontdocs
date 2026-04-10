#!/usr/bin/env bash
# Download mdBook binary for the current platform as a Tauri sidecar
# Usage: ./scripts/download-mdbook.sh

set -euo pipefail

MDBOOK_VERSION="${MDBOOK_VERSION:-0.4.40}"
BINARIES_DIR="src-tauri/binaries"

mkdir -p "$BINARIES_DIR"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-unknown-linux-gnu" ;;
      aarch64) TRIPLE="aarch64-unknown-linux-gnu" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    URL="https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/mdbook-v${MDBOOK_VERSION}-${TRIPLE}.tar.gz"
    ;;
  Darwin)
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-apple-darwin" ;;
      arm64) TRIPLE="aarch64-apple-darwin" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    URL="https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/mdbook-v${MDBOOK_VERSION}-${TRIPLE}.tar.gz"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    TRIPLE="x86_64-pc-windows-msvc"
    URL="https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/mdbook-v${MDBOOK_VERSION}-${TRIPLE}.zip"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

BINARY_NAME="mdbook-${TRIPLE}"
TARGET_PATH="${BINARIES_DIR}/${BINARY_NAME}"

echo "Downloading mdBook ${MDBOOK_VERSION} for ${TRIPLE}..."

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

if [[ "$URL" == *.zip ]]; then
  curl -sL "$URL" -o "$TMPDIR/mdbook.zip"
  unzip -q "$TMPDIR/mdbook.zip" -d "$TMPDIR"
  mv "$TMPDIR/mdbook.exe" "$TARGET_PATH.exe"
  echo "Downloaded: ${TARGET_PATH}.exe"
else
  curl -sL "$URL" -o "$TMPDIR/mdbook.tar.gz"
  tar -xzf "$TMPDIR/mdbook.tar.gz" -C "$TMPDIR"
  mv "$TMPDIR/mdbook" "$TARGET_PATH"
  chmod +x "$TARGET_PATH"
  echo "Downloaded: ${TARGET_PATH}"
fi

echo "Done! mdBook sidecar ready for Tauri."
