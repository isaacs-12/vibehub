#!/bin/sh
# VibeStudio desktop app installer
# Usage: curl -fsSL https://getvibehub.com/install-studio.sh | sh
set -e

REPO="isaacs-12/vibehub"
APP_NAME="VibeStudio"
INSTALL_DIR="/Applications"

# --- helpers ----------------------------------------------------------------

info()  { printf '  \033[1;34m→\033[0m %s\n' "$1"; }
error() { printf '  \033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }

need() {
  command -v "$1" >/dev/null 2>&1 || error "Required command not found: $1"
}

# --- check platform --------------------------------------------------------

check_platform() {
  OS="$(uname -s)"
  [ "$OS" = "Darwin" ] || error "VibeStudio desktop is currently macOS only."
}

# --- resolve latest release -------------------------------------------------

get_latest_version() {
  need curl
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')" \
    || error "Could not fetch latest release from GitHub"
  [ -n "$VERSION" ] || error "Could not determine latest version"
  # Strip leading 'v' for the asset filename
  VERSION_NUM="$(echo "$VERSION" | sed 's/^v//')"
}

# --- download & install -----------------------------------------------------

install() {
  need curl
  need tar

  TARBALL="VibeStudio-macos-arm64.tar.gz"
  URL="https://github.com/${REPO}/releases/latest/download/${TARBALL}"

  TMPDIR="$(mktemp -d)"
  trap 'rm -rf "$TMPDIR"' EXIT

  info "Downloading ${APP_NAME} ${VERSION}..."
  curl -fsSL "$URL" -o "${TMPDIR}/${TARBALL}" \
    || error "Download failed. Check that a release exists at:\n  ${URL}"

  info "Extracting..."
  tar -xzf "${TMPDIR}/${TARBALL}" -C "$TMPDIR"

  # Remove old version if present
  if [ -d "${INSTALL_DIR}/${APP_NAME}.app" ]; then
    info "Replacing existing ${APP_NAME}.app..."
    rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
  fi

  info "Installing to ${INSTALL_DIR}/${APP_NAME}.app..."
  mv "${TMPDIR}/${APP_NAME}.app" "${INSTALL_DIR}/${APP_NAME}.app"

  ok "Installed ${APP_NAME} ${VERSION} to ${INSTALL_DIR}/"
  echo ""
  echo "  Open ${APP_NAME} from your Applications folder or Spotlight."
  echo ""
}

# --- main -------------------------------------------------------------------

check_platform
get_latest_version
install
