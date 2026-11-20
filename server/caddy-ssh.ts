import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'ssh2';
import type { ConnectConfig } from 'ssh2';
import { pkiEngine } from './pki-engine.ts';
import { appConfig } from './config.ts';

const execAsync = promisify(exec);

export interface CaddySyncConfig {
  host: string;
  port?: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  remoteCertsDir?: string;
  reloadCommand?: string;
  autoSyncOnRevoke?: boolean;
}

export interface SyncResult {
  success: boolean;
  message: string;
  log: string;
  timestamp: string;
  filesUploaded: string[];
  reloadOutput?: string;
}

export class CaddySshService {
  private resolveFallbackSshKeyPath(): string | null {
    const candidates: string[] = [];
    if (appConfig.sshKeyPath) {
      candidates.push(appConfig.sshKeyPath);
    }
    const sshDir = path.join(os.homedir(), '.ssh');
    candidates.push(path.join(sshDir, 'id_ed25519'), path.join(sshDir, 'id_rsa'));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private createSshConfig(config: CaddySyncConfig): ConnectConfig {
    if (!config.host || !config.username) {
      throw new Error('Host and Username are required for SSH connection.');
    }

    let keyContent = config.privateKey;
    if (!keyContent || !keyContent.trim()) {
      const fallbackPath = this.resolveFallbackSshKeyPath();
      if (fallbackPath) {
        try {
          keyContent = fs.readFileSync(fallbackPath, 'utf8');
        } catch {}
      }
    }

    const sshConfig: ConnectConfig = {
      host: config.host.trim(),
      port: config.port || 22,
      username: config.username.trim(),
      readyTimeout: 60000,
      keepaliveInterval: 5000,
    };

    if (config.authType === 'password' && config.password) {
      sshConfig.password = config.password;
    } else if (keyContent && keyContent.trim()) {
      let key = keyContent.trim();
      const isEncrypted =
        key.includes('ENCRYPTED') ||
        key.includes('Proc-Type: 4,ENCRYPTED') ||
        key.includes('bcrypt');

      if (config.passphrase && config.passphrase.trim()) {
        const passphrase = config.passphrase.trim();
        try {
          const pk = crypto.createPrivateKey({ key, format: 'pem', passphrase });
          key = pk.export({ type: 'pkcs1', format: 'pem' }) as string;
        } catch {
          sshConfig.passphrase = passphrase;
        }
        sshConfig.passphrase = passphrase;
      } else if (isEncrypted) {
        throw new Error('The provided SSH Private Key is encrypted. Please enter the key passphrase / password to login.');
      }

      sshConfig.privateKey = key;
    } else {
      throw new Error(
        'SSH Private Key is required for key authentication. Paste a key in the UI or configure SSH_KEY_PATH in .env.'
      );
    }

    return sshConfig;
  }

  public async testConnection(config: CaddySyncConfig): Promise<{ success: boolean; message: string; details?: string }> {
    return new Promise((resolve) => {
      const conn = new Client();
      let finished = false;

      const finish = (success: boolean, message: string, details?: string) => {
        if (finished) return;
        finished = true;
        try {
          conn.end();
        } catch {}
        resolve({ success, message, details });
      };

      const timer = setTimeout(() => {
        finish(false, `Connection timed out after 10s connecting to ${config.host}:${config.port || 22}`);
      }, 10500);

      conn.on('ready', () => {
        conn.exec('echo "CADDY_SSH_OK" && (which caddy || true)', (err, stream) => {
          if (err) {
            clearTimeout(timer);
            finish(true, `SSH Authentication successful, but exec command failed: ${err.message}`);
            return;
          }
          let out = '';
          stream
            .on('close', () => {
              clearTimeout(timer);
              finish(true, `Successfully connected to ${config.host} as ${config.username}!`, out.trim());
            })
            .on('data', (data: Buffer) => {
              out += data.toString();
            })
            .stderr.on('data', (data: Buffer) => {
              out += data.toString();
            });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timer);
        finish(false, `SSH Connection Error: ${err.message}`);
      });

      try {
        const sshConfig = this.createSshConfig(config);
        conn.connect(sshConfig);
      } catch (err: any) {
        clearTimeout(timer);
        finish(false, `Invalid SSH Configuration: ${err.message}`);
      }
    });
  }

  public async syncCaddy(config: CaddySyncConfig): Promise<SyncResult> {
    const timestamp = new Date().toISOString();
    const filesUploaded: string[] = [];
    const logLines: string[] = [];
    const addLog = (msg: string) => logLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

    addLog(`Initiating mTLS sync to Caddy server at ${config.host}:${config.port || 22}...`);

    let caPem: string;
    let crlPem: string;
    try {
      caPem = pkiEngine.getCaCertPem();
      crlPem = pkiEngine.getCrlPem();
    } catch (err: any) {
      const errMsg = `PKI files not ready: ${err.message}`;
      addLog(errMsg);
      const res: SyncResult = {
        success: false,
        message: errMsg,
        log: logLines.join('\n'),
        timestamp,
        filesUploaded,
      };
      pkiEngine.saveCaddyConfig({
        lastSyncAt: timestamp,
        lastSyncStatus: 'failed',
        lastSyncLog: res.log,
      });
      return res;
    }

    return new Promise((resolve) => {
      const conn = new Client();
      let finished = false;

      const finish = (success: boolean, message: string, reloadOutput?: string) => {
        if (finished) return;
        finished = true;
        try {
          conn.end();
        } catch {}

        const fullLog = logLines.join('\n');
        pkiEngine.saveCaddyConfig({
          lastSyncAt: timestamp,
          lastSyncStatus: success ? 'success' : 'failed',
          lastSyncLog: fullLog,
        });

        resolve({
          success,
          message,
          log: fullLog,
          timestamp,
          filesUploaded,
          reloadOutput,
        });
      };

      const timer = setTimeout(() => {
        addLog('Sync aborted: SSH operation timed out after 60 seconds.');
        finish(false, 'SSH operation timed out after 60 seconds.');
      }, 60000);

      conn.on('error', (err) => {
        clearTimeout(timer);
        addLog(`SSH Error: ${err.message}`);
        finish(false, `SSH Error: ${err.message}`);
      });

      conn.on('ready', () => {
        addLog(`Authenticated as ${config.username}. Writing certificates via SSH command...`);

        const remoteDir = (config.remoteCertsDir || appConfig.caddy.remoteCertsDir).replace(/\/+$/, '');
        const caRemotePath = `${remoteDir}/ca.crt`;
        const crlRemotePath = `${remoteDir}/crl.pem`;

        const caBase64 = Buffer.from(caPem, 'utf8').toString('base64');
        const crlBase64 = Buffer.from(crlPem, 'utf8').toString('base64');
        const reloadCmd = config.reloadCommand?.trim() || appConfig.caddy.reloadCmd;

        const remoteCommand = `
          mkdir -p "${remoteDir}" && \
          chmod 755 "${remoteDir}" && \
          echo '${caBase64}' | base64 -d > "${caRemotePath}" && \
          chmod 644 "${caRemotePath}" && \
          echo '${crlBase64}' | base64 -d > "${crlRemotePath}" && \
          chmod 644 "${crlRemotePath}" && \
          ${reloadCmd}
        `;

        addLog(`Executing remote file write and Caddy reload...`);

        conn.exec(remoteCommand, (err, stream) => {
          clearTimeout(timer);
          if (err) {
            finish(false, `Execution failed: ${err.message}`);
            return;
          }

          let cmdOutput = '';
          stream
            .on('close', (code: number) => {
              if (code === 0) {
                addLog(`Certificates written and Caddy reloaded successfully!`);
                filesUploaded.push(caRemotePath, crlRemotePath);
                finish(true, `mTLS sync to Caddy succeeded!`, cmdOutput);
              } else {
                addLog(`Command exited with code ${code}. Output: ${cmdOutput}`);
                finish(false, `Remote command exited with code ${code}: ${cmdOutput}`, cmdOutput);
              }
            })
            .on('data', (chunk: Buffer) => {
              cmdOutput += chunk.toString();
            })
            .stderr.on('data', (chunk: Buffer) => {
              cmdOutput += chunk.toString();
            });
        });
      });

      try {
        const sshConfig = this.createSshConfig(config);
        conn.connect(sshConfig);
      } catch (err: any) {
        clearTimeout(timer);
        addLog(`Configuration Error: ${err.message}`);
        finish(false, `Configuration Error: ${err.message}`);
      }
    });
  }

  /**
   * Publishes ca.crt and crl.pem directly on the local host (for single-host bare-metal Debian installs)
   * and executes CADDY_RELOAD_CMD.
   */
  public async syncLocalCaddy(): Promise<SyncResult> {
    const timestamp = new Date().toISOString();
    const filesUploaded: string[] = [];
    const logLines: string[] = [];
    const addLog = (msg: string) => logLines.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

    if (!appConfig.crl.outputPath) {
      return {
        success: false,
        message: 'CRL_OUTPUT_PATH is not configured in .env. Set CRL_OUTPUT_PATH to enable local bare-metal Caddy sync.',
        log: 'CRL_OUTPUT_PATH is unset.',
        timestamp,
        filesUploaded,
      };
    }

    try {
      const caPem = pkiEngine.getCaCertPem();
      const crlPem = pkiEngine.getCrlPem();

      const crlTarget = appConfig.crl.outputPath;
      const caTarget = appConfig.crl.caCertOutputPath || path.join(path.dirname(crlTarget), 'ca.crt');

      for (const target of [caTarget, crlTarget]) {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        }
      }

      fs.writeFileSync(caTarget, caPem, { mode: 0o644, encoding: 'utf8' });
      addLog(`Wrote Root CA certificate to ${caTarget}`);
      filesUploaded.push(caTarget);

      fs.writeFileSync(crlTarget, crlPem, { mode: 0o644, encoding: 'utf8' });
      addLog(`Wrote CRL to ${crlTarget}`);
      filesUploaded.push(crlTarget);

      const reloadCmd = appConfig.caddy.reloadCmd;
      addLog(`Executing local Caddy reload command: ${reloadCmd}`);
      const { stdout, stderr } = await execAsync(reloadCmd, { timeout: 30000 });
      const reloadOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
      addLog('Local Caddy reloaded successfully.');

      const fullLog = logLines.join('\n');
      pkiEngine.saveCaddyConfig({
        lastSyncAt: timestamp,
        lastSyncStatus: 'success',
        lastSyncLog: fullLog,
      });

      return {
        success: true,
        message: 'Local CA/CRL published and Caddy reloaded successfully!',
        log: fullLog,
        timestamp,
        filesUploaded,
        reloadOutput: reloadOutput || undefined,
      };
    } catch (err: any) {
      addLog(`Local Caddy sync failed: ${err.message}`);
      const fullLog = logLines.join('\n');
      pkiEngine.saveCaddyConfig({
        lastSyncAt: timestamp,
        lastSyncStatus: 'failed',
        lastSyncLog: fullLog,
      });
      return {
        success: false,
        message: `Local Caddy sync failed: ${err.message}`,
        log: fullLog,
        timestamp,
        filesUploaded,
      };
    }
  }

  public generateCaddyfileSnippet(remoteCertsDir: string = appConfig.caddy.remoteCertsDir): string {
    const cleanDir = (remoteCertsDir || appConfig.caddy.remoteCertsDir).replace(/\/+$/, '');
    const wildcardHost = appConfig.caddy.defaultAllowedHosts[0] || '*.example.com';
    return `# Caddyfile mTLS Configuration with Pro mTLS Manager
# Replace secure.example.com with your domain or internal hostname
secure.example.com {
    tls {
        client_auth {
            mode require_and_verify
            # Root CA certificate managed by Pro mTLS Manager
            trusted_ca_cert_file ${cleanDir}/ca.crt
            # Certificate Revocation List (CRL) maintained by Pro mTLS Manager
            crl_file ${cleanDir}/crl.pem
        }
    }

    @forbidden not expression \`{http.request.tls.client.subject}.contains("OU=host:${wildcardHost}") || {http.request.tls.client.subject}.contains("OU=host:" + {http.request.host})\`
    respond @forbidden "403 Forbidden: Certificate not authorized for this hostname" 403

    # Proxy to your internal service
    reverse_proxy localhost:8080
}`;
  }
}

export const caddySshService = new CaddySshService();
