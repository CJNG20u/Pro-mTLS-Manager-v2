import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Key, HardDrive, Check, Copy, AlertCircle, Shield, CheckCircle2 } from 'lucide-react';
import { api, getStoredToken } from '../services/api.ts';
import { AuthStatus, SystemConfig } from '../types.ts';

interface SettingsPanelProps {
  authStatus: AuthStatus;
  onAuthUpdated: () => void;
  systemConfig?: SystemConfig | null;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ authStatus, onAuthUpdated, systemConfig }) => {
  const dataDirDisplay = (systemConfig?.dataDir || './data').replace(/\/+$/, '');
  const [enabled, setEnabled] = useState(authStatus.authEnabled);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const activeToken = getStoredToken();

  useEffect(() => {
    setEnabled(authStatus.authEnabled);
  }, [authStatus]);

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (enabled) {
      if (newPassword && newPassword !== confirmPassword) {
        setMessage({ type: 'error', text: 'New passwords do not match.' });
        return;
      }
      if (!authStatus.authEnabled && (!newPassword || newPassword.length < 6)) {
        setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
        return;
      }
    }

    setLoading(true);
    try {
      const res = await api.setupAuth(enabled, newPassword || undefined, currentPassword || undefined);
      setMessage({ type: 'success', text: res.message });
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      onAuthUpdated();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update security settings.' });
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!activeToken) return;
    try {
      await navigator.clipboard.writeText(activeToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Dashboard Security Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <span>Dashboard Security & Access Control</span>
              {authStatus.authEnabled ? (
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  PROTECTED
                </span>
              ) : (
                <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  OPEN ACCESS
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Protect your mTLS certificate authority from unauthorized internet traffic by enabling dashboard passcode authentication and API token verification.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg border text-xs mb-4 flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveSecurity} className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
            <div>
              <span className="text-xs font-medium text-white block">Require Dashboard Password</span>
              <span className="text-[11px] text-slate-400">
                When enabled, accessing this dashboard or making API calls requires passcode authentication.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {enabled && (
            <div className="space-y-3 pt-2">
              {authStatus.authEnabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Current Password <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password to make changes"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {authStatus.authEnabled ? 'New Password (Optional)' : 'Set Dashboard Password'}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : 'Update Security Settings'}
            </button>
          </div>
        </form>

        {/* API Token display */}
        {activeToken && (
          <div className="mt-6 pt-5 border-t border-slate-800">
            <span className="text-xs font-medium text-slate-300 block mb-1">Active Session / API Token</span>
            <p className="text-[11px] text-slate-400 mb-2">
              Use this bearer token in <code className="font-mono text-emerald-400">x-mtls-auth-token</code> header for programmatic curl scripts or automated CI/CD pipeline issuance.
            </p>
            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <span className="font-mono text-slate-300 text-xs truncate max-w-lg select-all">
                {activeToken}
              </span>
              <button
                onClick={copyToken}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 shrink-0 ml-2"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Storage Information */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <HardDrive className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Local PKI Persistent Storage</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          All cryptographic keys, certificates, CRL indexes, and Caddy configurations are stored locally in standard formats with strict file permissions:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400 block font-mono text-[11px]">{dataDirDisplay}/ca/</span>
            <span className="text-slate-200 block font-medium mt-1">Root CA Trust Store</span>
            <span className="text-[11px] text-slate-500">Contains ca.crt (public) and ca.key (0600 private key).</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400 block font-mono text-[11px]">{dataDirDisplay}/certs/</span>
            <span className="text-slate-200 block font-medium mt-1">Client Certs & .p12 Bundles</span>
            <span className="text-[11px] text-slate-500">Organized per certificate ID with bundle.p12 archives.</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400 block font-mono text-[11px]">{dataDirDisplay}/crl/</span>
            <span className="text-slate-200 block font-medium mt-1">OpenSSL CRL Database</span>
            <span className="text-[11px] text-slate-500">RFC 5280 crl.pem, serial, crlnumber, and index.txt.</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400 block font-mono text-[11px]">{dataDirDisplay}/config.json</span>
            <span className="text-slate-200 block font-medium mt-1">Caddy Sync & Security Config</span>
            <span className="text-[11px] text-slate-500">SSH host configurations and dashboard auth settings.</span>
          </div>

          {systemConfig?.crlOutputPath && (
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 sm:col-span-2">
              <span className="text-cyan-400 block font-mono text-[11px]">{systemConfig.crlOutputPath}</span>
              <span className="text-slate-200 block font-medium mt-1">Local CRL Export Target (CRL_OUTPUT_PATH)</span>
              <span className="text-[11px] text-slate-500">
                Automatically updated whenever a certificate is revoked. Reload command:{' '}
                <code className="font-mono text-slate-300">{systemConfig.caddyReloadCmd}</code>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
