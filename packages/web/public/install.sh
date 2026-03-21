#!/bin/sh
# VibeHub CLI installer
# Usage: curl -fsSL https://getvibehub.com/install.sh | sh
set -e

REPO="isaacs-12/vibehub"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="vibe"

# --- helpers ----------------------------------------------------------------

info()  { printf '  \033[1;34m→\033[0m %s\n' "$1"; }
error() { printf '  \033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }

need() {
  command -v "$1" >/dev/null 2>&1 || error "Required command not found: $1"
}

# --- detect platform --------------------------------------------------------

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    *)      error "Unsupported OS: $OS" ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)             error "Unsupported architecture: $ARCH" ;;
  esac
}

# --- resolve latest release -------------------------------------------------

get_latest_version() {
  need curl
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')" \
    || error "Could not fetch latest release from GitHub"
  [ -n "$VERSION" ] || error "Could not determine latest version"
}

# --- download & install -----------------------------------------------------

install() {
  need curl
  need tar

  TARBALL="vibe-${OS}-${ARCH}.tar.gz"
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${TARBALL}"

  TMPDIR="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR"' EXIT

  info "Downloading ${BINARY_NAME} ${VERSION} (${OS}/${ARCH})..."
  curl -fsSL "$URL" -o "${TMPDIR}/${TARBALL}" \
    || error "Download failed. Check that a release exists for ${OS}/${ARCH} at:\n  ${URL}"

  info "Extracting..."
  tar -xzf "${TMPDIR}/${TARBALL}" -C "$TMPDIR"

  info "Installing to ${INSTALL_DIR}/${BINARY_NAME}..."
  if [ -w "$INSTALL_DIR" ]; then
    mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
  else
    sudo mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
  fi
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  ok "Installed ${BINARY_NAME} ${VERSION} to ${INSTALL_DIR}/${BINARY_NAME}"
  echo ""
  echo "  Run 'vibe --help' to get started."
  echo ""
}

# --- main -------------------------------------------------------------------

detect_platform
get_latest_version
install
