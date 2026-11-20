import React, { useState, useEffect } from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Shield,
  UploadCloud,
  Terminal,
  Loader2,
  FileCode2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { CaddyConfig, SyncResult, SystemConfig } from '../types.ts';
import { api } from '../services/api.ts';

interface CaddySyncPanelProps {
  systemConfig?: SystemConfig | null;
}

export const CaddySyncPanel: React.FC<CaddySyncPanelProps> = ({ systemConfig }) => {
  const defaultCertsDir = systemConfig?.caddyRemoteCertsDir || '/etc/caddy/certs';
  const defaultReloadCmd = systemConfig?.caddyReloadCmd || 'sudo systemctl reload caddy';
  const defaultWildcardHost = systemConfig?.defaultAllowedHosts?.[0] || '*.example.com';

  const [config, setConfig] = useState<CaddyConfig>({
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    remoteCertsDir: defaultCertsDir,
    reloadCommand: defaultReloadCmd,
    autoSyncOnRevoke: true,
  });

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showKeyPassword, setShowKeyPassword] = useState(false);
  const [revealPassphrase, setRevealPassphrase] = useState(false);

  const isEncryptedKey = (keyText: string): boolean => {
    if (!keyText) return false;
    return (
      keyText.includes('ENCRYPTED') ||
      keyText.includes('Proc-Type: 4,ENCRYPTED') ||
      keyText.includes('bcrypt') ||
      keyText.includes('aes')
    );
  };

  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoadingConfig(true);
      const data = await api.getCaddyConfig();
      setConfig((prev) => ({
        ...prev,
        ...data,
        port: data.port || 22,
        authType: data.authType || 'password',
        remoteCertsDir: data.remoteCertsDir || defaultCertsDir,
        reloadCommand: data.reloadCommand || defaultReloadCmd,
        autoSyncOnRevoke: data.autoSyncOnRevoke ?? true,
      }));
      if (data.hasPassphrase || data.passphrase) {
        setShowKeyPassword(true);
      }
    } catch (e) {
      console.error('Failed to load Caddy config', e);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    setSaveMessage(null);
    try {
      const res = await api.saveCaddyConfig(config);
      setSaveMessage(res.message);
      setTimeout(() => setSaveMessage(null), 3000);
      loadConfig();
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testCaddyConnection(config);
      setTestResult(res);
      if (
        !res.success &&
        (res.message.toLowerCase().includes('passphrase') ||
          res.message.toLowerCase().includes('encrypted') ||
          res.message.toLowerCase().includes('password'))
      ) {
        setShowKeyPassword(true);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `Test failed: ${err.message}` });
      if (
        err.message?.toLowerCase().includes('passphrase') ||
        err.message?.toLowerCase().includes('encrypted') ||
        err.message?.toLowerCase().includes('password')
      ) {
        setShowKeyPassword(true);
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncCaddy();
      setSyncResult(res);
      loadConfig();
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Sync failed',
        timestamp: new Date().toISOString(),
        log: err.message,
      });
      if (
        err.message?.toLowerCase().includes('passphrase') ||
        err.message?.toLowerCase().includes('encrypted')
      ) {
        setShowKeyPassword(true);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleLocalSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncLocalCaddy();
      setSyncResult(res);
      loadConfig();
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Local Caddy sync failed',
        timestamp: new Date().toISOString(),
        log: err.message,
      });
    } finally {
      setSyncing(false);
    }
  };

  const caddyfileSnippet = `# Caddyfile mTLS Configuration with Pro mTLS Manager
# Replace secure.example.com with your domain or internal hostname
secure.example.com {
    tls {
        client_auth {
            mode require_and_verify
            # Root CA certificate managed by Pro mTLS Manager
            trusted_ca_cert_file ${config.remoteCertsDir || defaultCertsDir}/ca.crt
            # Certificate Revocation List (CRL) maintained by Pro mTLS Manager
            crl_file ${config.remoteCertsDir || defaultCertsDir}/crl.pem
        }
    }

    @forbidden not expression \`{http.request.tls.client.subject}.contains("OU=host:${defaultWildcardHost}") || {http.request.tls.client.subject}.contains("OU=host:" + {http.request.host})\`
    respond @forbidden "403 Forbidden: Certificate not authorized for this hostname" 403

    # Proxy to your internal service
    reverse_proxy localhost:8080
}`;

  const copyCaddyfile = async () => {
    try {
      await navigator.clipboard.writeText(caddyfileSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  if (loadingConfig) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
        <span className="text-xs">Loading Caddy server configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Quick Sync Action Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                <span>Caddy Server Integration</span>
                <span className="text-xs font-mono text-cyan-400/90 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  SSH / SFTP
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">
                Automatically push updated Root CA trust files and Certificate Revocation Lists (CRL) directly to your remote Caddy reverse proxy,
                triggering an instant reload without web service downtime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {systemConfig?.crlOutputPath && (
              <button
                onClick={handleLocalSync}
                disabled={syncing}
                title={`Write ca.crt & crl.pem locally and run: ${defaultReloadCmd}`}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>Publish & Reload Local Caddy</span>
              </button>
            )}
            <button
              onClick={handleManualSync}
              disabled={syncing || !config.host}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>Sync to Remote Caddy (SSH)</span>
            </button>
          </div>
        </div>

        {/* Sync Status strip */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>Last Sync:</span>
            {config.lastSyncStatus === 'success' ? (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Successful</span>
              </span>
            ) : config.lastSyncStatus === 'failed' ? (
              <span className="text-rose-400 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Failed</span>
              </span>
            ) : (
              <span className="text-slate-500">Not synced yet</span>
            )}
            {config.lastSyncAt && (
              <span className="text-slate-500 font-mono tabular-nums">
                ({new Date(config.lastSyncAt).toLocaleString()})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            <span>Target: <code className="font-mono text-slate-300">{config.host || 'Not set'}:{config.port}</code></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection & Configuration Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span>SSH Connection Credentials</span>
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Pro mTLS Manager uses SSH/SFTP to deliver <code className="font-mono text-slate-300">ca.crt</code> and <code className="font-mono text-slate-300">crl.pem</code>.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Caddy Server IP / Hostname <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="e.g. 192.168.1.10 or caddy.internal"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  SSH Port
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 22 })}
                  placeholder="22"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                SSH Username <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="e.g. root or caddy-admin"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Auth Type selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Authentication Method
              </label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, authType: 'password' })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    config.authType === 'password'
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Password Authentication
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, authType: 'key' })}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    config.authType === 'key'
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  SSH Private Key
                </button>
              </div>

              {config.authType === 'password' ? (
                <div>
                  <input
                    type="password"
                    value={config.password || ''}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder={config.hasPassword ? '•••••••• (Password configured - enter new to change)' : 'Enter SSH password'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={config.privateKey || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setConfig({ ...config, privateKey: val });
                      if (isEncryptedKey(val)) {
                        setShowKeyPassword(true);
                      }
                    }}
                    placeholder={
                      config.hasKey
                        ? '[SSH Private Key is configured on server - paste new key here to replace]'
                        : '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />

                  {/* Passphrase toggle / indicator */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={showKeyPassword || isEncryptedKey(config.privateKey || '')}
                        onChange={(e) => setShowKeyPassword(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                        <span>This private key requires a password / passphrase to unlock</span>
                      </span>
                    </label>

                    {isEncryptedKey(config.privateKey || '') && (
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        Encrypted Key Detected
                      </span>
                    )}
                  </div>

                  {/* Blank input field for private key password / passphrase */}
                  {(showKeyPassword || isEncryptedKey(config.privateKey || '') || config.hasPassphrase) && (
                    <div className="mt-2.5 p-3 bg-slate-950/90 rounded-lg border border-slate-800 space-y-1.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          <span>SSH Private Key Password / Passphrase</span>
                        </label>
                        <span className="text-[10px] text-slate-400">Required to decrypt key</span>
                      </div>
                      <div className="relative">
                        <input
                          type={revealPassphrase ? 'text' : 'password'}
                          value={config.passphrase || ''}
                          onChange={(e) => setConfig({ ...config, passphrase: e.target.value })}
                          placeholder={
                            config.hasPassphrase
                              ? '•••••••• (Passphrase configured - enter new to change)'
                              : 'Enter password to unlock private key'
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setRevealPassphrase(!revealPassphrase)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded"
                          title={revealPassphrase ? 'Hide password' : 'Show password'}
                        >
                          {revealPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        If your SSH private key is password-protected or passphrase-encrypted (e.g. standard id_rsa / id_ed25519 with passphrase), Pro mTLS Manager will use this password to decrypt the key during SSH/SFTP connection.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Remote Certs Directory
                </label>
                <input
                  type="text"
                  value={config.remoteCertsDir}
                  onChange={(e) => setConfig({ ...config, remoteCertsDir: e.target.value })}
                  placeholder={defaultCertsDir}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Remote Reload Command
                </label>
                <input
                  type="text"
                  value={config.reloadCommand}
                  onChange={(e) => setConfig({ ...config, reloadCommand: e.target.value })}
                  placeholder={defaultReloadCmd}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            {/* Auto Sync Toggle */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoSyncOnRevoke}
                  onChange={(e) => setConfig({ ...config, autoSyncOnRevoke: e.target.checked })}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-300 font-medium">
                  Automatically sync CRL to Caddy whenever a certificate is revoked
                </span>
              </label>
            </div>

            {saveMessage && (
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-emerald-400">
                {saveMessage}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || !config.host}
                className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700/60 disabled:opacity-50"
              >
                {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />}
                <span>Test SSH Connection</span>
              </button>

              <button
                type="submit"
                disabled={savingConfig}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors border border-slate-700/60"
              >
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold block">{testResult.message}</span>
                    {testResult.details && (
                      <span className="font-mono text-[11px] block mt-1 text-slate-400 whitespace-pre-wrap">
                        {testResult.details}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Caddyfile Configuration Guide & Live Logs */}
        <div className="space-y-6">
          {/* Caddyfile Snippet */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-emerald-400" />
                <span>Caddyfile mTLS Directives</span>
              </h3>
              <button
                onClick={copyCaddyfile}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded border border-slate-700/60 transition-colors"
              >
                {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet ? 'Copied' : 'Copy Caddyfile'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Add this block to your remote Caddyfile. Caddy will enforce client certificates and verify revocations against <code className="font-mono text-slate-300">crl.pem</code>.
            </p>
            <pre className="bg-slate-950 p-3.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800 selection:bg-emerald-500/20 leading-relaxed">
              {caddyfileSnippet}
            </pre>
          </div>

          {/* Sync Terminal & Execution Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Sync Execution Output</span>
            </h3>

            <div className="bg-slate-950 p-3.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56 border border-slate-800">
              {syncResult ? (
                <div className="space-y-1">
                  <div className={syncResult.success ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {syncResult.message}
                  </div>
                  {syncResult.log && (
                    <div className="whitespace-pre-wrap text-slate-400 mt-2">
                      {syncResult.log}
                    </div>
                  )}
                  {syncResult.reloadOutput && (
                    <div className="text-cyan-300 mt-2 pt-2 border-t border-slate-800">
                      Caddy Output: {syncResult.reloadOutput}
                    </div>
                  )}
                </div>
              ) : config.lastSyncLog ? (
                <div className="whitespace-pre-wrap text-slate-400">
                  {config.lastSyncLog}
                </div>
              ) : (
                <span className="text-slate-600 italic">
                  No sync executed yet. Click "Sync to Caddy Now" to push trust files.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
