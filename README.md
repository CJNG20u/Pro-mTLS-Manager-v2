# Pro mTLS Manager v2
<img width="1310" height="956" alt="image" src="https://github.com/user-attachments/assets/d2e10729-0a0e-4f14-bfaf-7806a0664f5a" />


A self-hosted Private Certificate Authority (CA), PKCS#12 (`.p12`) client certificate issuer, and OpenSSL Certificate Revocation List (CRL) manager designed for [Caddy](https://caddyserver.com/) on bare-metal Debian/Ubuntu Linux.

## Features

- **Private Root CA Management:** Initialize or rotate an X.509 v3 Root CA (`RSA 2048/4096`, `SHA-256`) automatically on first boot via `.env` or interactively in the web dashboard.
- **Client Certificate & `.p12` Bundling:** Issue per-device client certificates with optional per-hostname scoping (`OU=host:<hostname>`), password-protected or passwordless PKCS#12 exports, and expiration tracking.
- **RFC 5280 OpenSSL CRL Management:** Real-time revocation using native `openssl ca -gencrl`, generating standard `crl.pem` files enforced by Caddy.
- **Bare-Metal & Remote Caddy Integration:** Export `ca.crt` and `crl.pem` directly to local Caddy directories with automatic reloads via `systemctl`, or push them to remote Caddy servers over SSH/SFTP.
- **Optional Dashboard Passcode Protection:** Lock the web UI and API behind a password and bearer session tokens.

---

## Prerequisites (Debian / Ubuntu) 
## Supported Environments & Requirements

Pro mTLS Manager is designed to run directly on a **Debian or Ubuntu** Linux environment without Docker:

- **Supported Deployment Targets:**
  - **Bare-Metal Linux Server** (Debian 11/12/13 or Ubuntu 22.04/24.04 LTS)
  - **Virtual Private Server (VPS)** or **VM** running Debian/Ubuntu
  - **LXC Container** (such as Proxmox VE Debian/Ubuntu LXC)
- **System Requirements:**
  - **Privileges:** Root or `sudo` access (required for `systemd` service installation and local Caddy certificate exports/reloads)
  - **Resources:** Minimal footprint — 1 vCPU, 512 MB RAM, and 1 GB free disk space are sufficient
  - **Runtime Dependencies:** OpenSSL, Node.js v18+ (v20 or v22 LTS recommended), `npm`, and `git`

  You will also need the revocator plugin this will need to be install in with caddy so it can work with pro mtls manager to revoke the certs  thats in this link shout out to Gr33nbl00d thank you sir 

  https://github.com/Gr33nbl00d/caddy-revocation-validator

Install OpenSSL, Node.js (v18+ required; v20 or v22 LTS recommended), and npm:

```bash
sudo apt update
sudo apt install -y openssl nodejs npm git
```

Check your installed versions:

```bash
openssl version
node -v
npm -v
```

> **Note for Debian 12 (Bookworm) users:** If the default `apt` repository provides Node.js older than v18, install Node.js 22 LTS from NodeSource:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
> sudo apt install -y nodejs
> ```

---

## Bare-Metal Installation

1. **Clone the repository** into your preferred directory (for example `/opt/pro-mtls-manager`):

   ```bash
   sudo mkdir -p /opt/pro-mtls-manager
   sudo chown "$USER":"$USER" /opt/pro-mtls-manager
   git clone https://github.com/CJNG20u/Pro-mTLS-Manager-v2.git /opt/pro-mtls-manager
   cd /opt/pro-mtls-manager

   ```

2. **Run the setup script:**

   ```bash
   chmod +x install.sh
   ./install.sh
   ```

   `install.sh` is idempotent: it verifies `openssl`, `node`, and `npm`, runs `npm install` and `npm run build`, creates `.env` from `.env.example` (if not already present) with a freshly generated `AUTH_SALT`, and creates `DATA_DIR` with `0700` permissions.

3. **Configure `.env`:**

   ```bash
   cp .env.example .env
   nano .env
   ```

   Key environment variables:

   | Variable | Description | Default |
   | --- | --- | --- |
   | `PORT` | HTTP listen port | `3000` |
   | `HOST` | Bind address (`127.0.0.1` recommended behind Caddy) | `127.0.0.1` |
   | `DATA_DIR` | Directory for CA keys, client certs, CRL DB, and config | `./data` |
   | `CA_AUTO_INIT` | Set `true` to auto-generate a Root CA on first boot if `DATA_DIR/ca` is empty; `false` uses the UI setup flow | `false` |
   | `CA_COMMON_NAME` | Root CA Common Name (`CN`) | `My Private Root CA` |
   | `CA_ORGANIZATION` | Root CA Organization (`O`) | `My Organization` |
   | `CA_ORGANIZATIONAL_UNIT` | Root CA Organizational Unit (`OU`) | `Internal PKI` |
   | `CA_COUNTRY` | 2-letter ISO country code (`C`) | `US` |
   | `CA_VALIDITY_DAYS` | Root CA lifetime in days | `3650` |
   | `CA_KEY_SIZE` | Root CA RSA key length (`2048` or `4096`) | `2048` |
   | `CRL_VALIDITY_DAYS` | Days until the generated CRL expires | `30` |
   | `CRL_OUTPUT_PATH` | Optional local file path to mirror `crl.pem` (e.g., `/etc/caddy/certs/crl.pem`) | *(empty)* |
   | `CA_CERT_OUTPUT_PATH` | Optional local file path to mirror `ca.crt` (e.g., `/etc/caddy/certs/ca.crt`) | *(empty)* |
   | `CADDY_RELOAD_CMD` | Command to reload Caddy | `sudo systemctl reload caddy` |
   | `CADDY_AUTO_RELOAD_LOCAL` | Auto-run `CADDY_RELOAD_CMD` locally on revoke/delete | `false` |
   | `DEFAULT_ALLOWED_HOSTS` | Default comma-separated hostnames embedded as `OU=host:<host>` | `*.example.com` |
   | `AUTH_SALT` | Random salt for dashboard password hashing | *(generated by `install.sh`)* |

---


## Running with `systemd`

1. Copy the unit template and update paths if you installed somewhere other than `/opt/pro-mtls-manager`:

   ```bash
   sudo cp /opt/pro-mtls-manager/pro-mtls-manager.service /etc/systemd/system/pro-mtls-manager.service
   sudo nano /etc/systemd/system/pro-mtls-manager.service
   ```

2. Enable and start the service:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now pro-mtls-manager
   sudo systemctl status pro-mtls-manager
   ```

3. View live logs (including startup OpenSSL & `.env` validation output):

   ```bash
   sudo journalctl -u pro-mtls-manager -f
   ```

> **Note:** On startup, Pro mTLS Manager verifies that `openssl` is installed and all required `.env` variables are valid. If anything is missing, it prints an explicit error message to `journalctl` and exits cleanly.

---

## Sample `Caddyfile` Configuration (mTLS + CRL)

Add the following `tls` block to any site in `/etc/caddy/Caddyfile` that you want to protect with mutual TLS and real-time revocation checking:

```caddyfile
app.example.com {
    tls {
        client_auth {
            mode require_and_verify
            # Root CA certificate managed by Pro mTLS Manager
            trusted_ca_cert_file /etc/caddy/certs/ca.crt
            # OpenSSL Certificate Revocation List (CRL) updated on every revocation
            crl_file /etc/caddy/certs/crl.pem
        }
    }

    # Optional: enforce per-hostname authorization embedded in the client cert's OU=host:<hostname>
    @unauthorized not expression `{http.request.tls.client.subject}.contains("OU=host:*.example.com") || {http.request.tls.client.subject}.contains("OU=host:" + {http.request.host})`
    respond @unauthorized "403 Forbidden: Client certificate not authorized for this host" 403

    reverse_proxy 127.0.0.1:8080
}
```

Reload Caddy after updating your `Caddyfile`:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## Backup & Security Notes

- **Protect `DATA_DIR/ca/ca.key`:** Anyone with access to `ca.key` can sign trusted client certificates for your infrastructure. Back up `DATA_DIR` to encrypted offline storage.
- **Never expose the dashboard directly to the public internet without protection:** Bind `HOST=127.0.0.1`, enable the built-in Dashboard Password in **Settings**, and restrict access via VPN (e.g., WireGuard/Tailscale) or an admin mTLS rule in Caddy.
- **Keep `.env` and `DATA_DIR` out of version control:** `.gitignore` already excludes `.env`, `data/`, `*.key`, `*.pem`, `*.crt`, `*.p12`, `*.crl`, and SQLite databases.
