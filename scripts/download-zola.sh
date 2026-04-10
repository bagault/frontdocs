#!/usr/bin/env bash
# Download Zola binary for the current platform as a Tauri sidecar
# Usage: ./scripts/download-zola.sh

set -euo pipefail

ZOLA_VERSION="${ZOLA_VERSION:-0.19.2}"
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
    URL="https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-${TRIPLE}.tar.gz"
    ;;
  Darwin)
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-apple-darwin" ;;
      arm64) TRIPLE="aarch64-apple-darwin" ;;
      *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    URL="https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-${TRIPLE}.tar.gz"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    TRIPLE="x86_64-pc-windows-msvc"
    URL="https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-${TRIPLE}.zip"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

BINARY_NAME="zola-${TRIPLE}"
TARGET_PATH="${BINARIES_DIR}/${BINARY_NAME}"

echo "Downloading Zola ${ZOLA_VERSION} for ${TRIPLE}..."

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

if [[ "$URL" == *.zip ]]; then
  curl -sL "$URL" -o "$TMPDIR/zola.zip"
  unzip -q "$TMPDIR/zola.zip" -d "$TMPDIR"
  mv "$TMPDIR/zola.exe" "$TARGET_PATH.exe"
  echo "Downloaded: ${TARGET_PATH}.exe"
else
  curl -sL "$URL" -o "$TMPDIR/zola.tar.gz"
  tar -xzf "$TMPDIR/zola.tar.gz" -C "$TMPDIR"
  mv "$TMPDIR/zola" "$TARGET_PATH"
  chmod +x "$TARGET_PATH"
  echo "Downloaded: ${TARGET_PATH}"
fi

echo "Done! Zola sidecar ready for Tauri."
