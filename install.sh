#!/usr/bin/env bash
# ==============================================================================
# Pro mTLS Manager - Bare-Metal Debian/Ubuntu Setup Script
# ==============================================================================
# Idempotent setup script that verifies prerequisites, installs dependencies,
# builds the frontend bundle, initializes .env from .env.example, and prints
# instructions for systemd + passwordless sudo Caddy reloads.
# ==============================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_MAJOR=18

echo "================================================================"
echo "  Pro mTLS Manager - Bare-Metal Debian/Ubuntu Installer"
echo "================================================================"
echo ""

# ------------------------------------------------------------------------------
# 1. Verify required host binaries: openssl, node, npm
# ------------------------------------------------------------------------------
MISSING_DEPS=0

if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] OpenSSL CLI (openssl) is not installed."
  MISSING_DEPS=1
else
  echo "[OK] OpenSSL found: $(openssl version)"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js (node) is not installed."
  MISSING_DEPS=1
else
  NODE_VERSION="$(node -v)"
  NODE_MAJOR="$(echo "${NODE_VERSION#v}" | cut -d. -f1)"
  if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
    echo "[ERROR] Node.js ${NODE_VERSION} detected, but v${MIN_NODE_MAJOR}+ is required."
    MISSING_DEPS=1
  else
    echo "[OK] Node.js found: ${NODE_VERSION}"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not installed."
  MISSING_DEPS=1
else
  echo "[OK] npm found: v$(npm -v)"
fi

if [ "${MISSING_DEPS}" -ne 0 ]; then
  echo ""
  echo "Install missing prerequisites on Debian/Ubuntu with:"
  echo "  sudo apt update && sudo apt install -y openssl nodejs npm"
  echo ""
  echo "If Debian ships an older Node.js (< v${MIN_NODE_MAJOR}), install Node.js 22 LTS via NodeSource:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "  sudo apt install -y nodejs"
  exit 1
fi

echo ""

# ------------------------------------------------------------------------------
# 2. Install Node.js dependencies and build the production frontend
# ------------------------------------------------------------------------------
echo "[1/3] Installing npm dependencies in ${APP_DIR}..."
cd "${APP_DIR}"
if [ -f "${APP_DIR}/package-lock.json" ]; then
  npm ci
else
  npm install
fi

echo ""
echo "[2/3] Building frontend production bundle..."
npm run build

# ------------------------------------------------------------------------------
# 3. Create .env from .env.example if it does not already exist
# ------------------------------------------------------------------------------
echo ""
echo "[3/3] Checking environment configuration..."
if [ ! -f "${APP_DIR}/.env" ]; then
  if [ ! -f "${APP_DIR}/.env.example" ]; then
    echo "[ERROR] .env.example not found in ${APP_DIR}."
    exit 1
  fi
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"

  # Auto-generate a unique AUTH_SALT in the freshly created .env
  RANDOM_SALT="$(openssl rand -hex 24)"
  sed -i "s|^AUTH_SALT=.*|AUTH_SALT=${RANDOM_SALT}|" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  echo "[OK] Created ${APP_DIR}/.env from .env.example (chmod 600) with a unique AUTH_SALT."
else
  echo "[OK] Existing ${APP_DIR}/.env preserved (not overwritten)."
fi

# Resolve DATA_DIR from .env (defaulting to ./data) and ensure it exists with 0700 permissions
CONFIGURED_DATA_DIR="$(grep -E '^DATA_DIR=' "${APP_DIR}/.env" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
CONFIGURED_DATA_DIR="${CONFIGURED_DATA_DIR:-./data}"
if [[ "${CONFIGURED_DATA_DIR}" = /* ]]; then
  RESOLVED_DATA_DIR="${CONFIGURED_DATA_DIR}"
else
  RESOLVED_DATA_DIR="${APP_DIR}/${CONFIGURED_DATA_DIR#./}"
fi
mkdir -p "${RESOLVED_DATA_DIR}"
chmod 700 "${RESOLVED_DATA_DIR}"
echo "[OK] Verified data directory: ${RESOLVED_DATA_DIR} (chmod 700)"

# ------------------------------------------------------------------------------
# 4. Print next steps for Debian systemd + passwordless sudo Caddy reload
# ------------------------------------------------------------------------------
echo ""
echo "================================================================"
echo "  Installation Complete!"
echo "================================================================"
echo ""
echo "Next steps to finish your bare-metal Debian deployment:"
echo ""
echo "1. Review and customize your configuration:"
echo "     nano ${APP_DIR}/.env"
echo ""
echo "2. (Recommended) Create a dedicated service user and set ownership:"
echo "     sudo useradd --system --home-dir ${APP_DIR} --shell /usr/sbin/nologin pro-mtls"
echo "     sudo mkdir -p /etc/caddy/certs"
echo "     sudo chown -R pro-mtls:pro-mtls ${APP_DIR}"
echo "     sudo chown pro-mtls:caddy /etc/caddy/certs && sudo chmod 750 /etc/caddy/certs"
echo ""
echo "3. Allow passwordless Caddy reloads via /etc/sudoers.d/pro-mtls:"
echo "     echo 'pro-mtls ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy' | sudo tee /etc/sudoers.d/pro-mtls"
echo "     sudo chmod 440 /etc/sudoers.d/pro-mtls"
echo "     sudo visudo -cf /etc/sudoers.d/pro-mtls"
echo ""
echo "4. Install and enable the systemd service:"
echo "     sudo cp ${APP_DIR}/pro-mtls-manager.service /etc/systemd/system/pro-mtls-manager.service"
echo "     sudo sed -i 's|/opt/pro-mtls-manager|${APP_DIR}|g' /etc/systemd/system/pro-mtls-manager.service"
echo "     sudo systemctl daemon-reload"
echo "     sudo systemctl enable --now pro-mtls-manager"
echo "     sudo journalctl -u pro-mtls-manager -f"
echo ""
