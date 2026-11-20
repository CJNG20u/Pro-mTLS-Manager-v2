import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Sparkles, Download, Check, Copy, AlertCircle, Loader2, ShieldCheck, HelpCircle, Globe, Unlock } from 'lucide-react';
import { api } from '../services/api.ts';
import { StoredClientCert, SystemConfig } from '../types.ts';

interface IssueCertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (cert: StoredClientCert) => void;
  onOpenInstallGuide: () => void;
  systemConfig?: SystemConfig | null;
}

export const IssueCertModal: React.FC<IssueCertModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenInstallGuide,
  systemConfig,
}) => {
  const defaultHosts = systemConfig?.defaultAllowedHosts?.length
    ? systemConfig.defaultAllowedHosts
    : ['*.example.com'];
  const defaultHostLabel = defaultHosts.join(', ');
  const [personalizedName, setPersonalizedName] = useState('');
  const [allowedHostsInput, setAllowedHostsInput] = useState('');
  const [validityDays, setValidityDays] = useState<number>(365);
  const [customDays, setCustomDays] = useState<string>('');
  const [p12Password, setP12Password] = useState('');
  const [passwordless, setPasswordless] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success state after certificate generation
  const [createdCert, setCreatedCert] = useState<StoredClientCert | null>(null);
  const [savedPassword, setSavedPassword] = useState('');

  if (!isOpen) return null;

  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()_+';
    let pass = '';
    const array = new Uint8Array(18);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < 18; i++) {
      pass += chars[array[i] % chars.length];
    }
    setPasswordless(false);
    setP12Password(pass);
    setShowPassword(true);
  };

  const copyPasswordToClipboard = async () => {
    const pass = savedPassword || p12Password;
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(pass);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!personalizedName.trim()) {
      setError('A personalized name/identifier is required (e.g. alice-laptop or mobile-device-01).');
      return;
    }

    const finalDays = validityDays === -1 ? parseInt(customDays, 10) : validityDays;
    if (isNaN(finalDays) || finalDays < 1) {
      setError('Please select or enter a valid expiration duration.');
      return;
    }

    const parsedHosts = allowedHostsInput
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const allowedHosts = parsedHosts.length > 0 ? parsedHosts : defaultHosts;
    const effectivePassword = passwordless ? '' : p12Password;

    setLoading(true);
    try {
      const res = await api.issueClientCert({
        personalizedName: personalizedName.trim(),
        validityDays: finalDays,
        p12Password: effectivePassword,
        allowedHosts,
        notes: notes.trim() || undefined,
      });

      setCreatedCert(res.cert);
      setSavedPassword(effectivePassword);
      onSuccess(res.cert);
    } catch (err: any) {
      setError(err.message || 'Failed to issue client certificate.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setPersonalizedName('');
    setAllowedHostsInput('');
    setP12Password('');
    setPasswordless(false);
    setShowPassword(false);
    setNotes('');
    setCreatedCert(null);
    setSavedPassword('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
        {!createdCert ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Issue Client Certificate</h3>
                <p className="text-xs text-slate-400">
                  Generate a personalized identity certificate bundled into an encrypted .p12 file.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg mb-4 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Generic Identifier / Device Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Client Identifier / Device Name <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Embedded in Subject CN & OU</span>
                </div>
                <input
                  type="text"
                  value={personalizedName}
                  onChange={(e) => setPersonalizedName(e.target.value)}
                  placeholder="e.g., client-device-01"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Allowed Hostnames (Per-hostname mTLS scoping) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Allowed Hostnames</span>
                    <span className="text-[11px] text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">OU=host:&lt;hostname&gt;</span>
                </div>
                <input
                  type="text"
                  value={allowedHostsInput}
                  onChange={(e) => setAllowedHostsInput(e.target.value)}
                  placeholder={`e.g., app.example.com, media.example.com (defaults to ${defaultHostLabel})`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Comma-separated hostnames this certificate may access. Leave blank to default to <code className="text-slate-300 font-mono">{defaultHostLabel}</code>.
                </p>
              </div>

              {/* Expiry Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Expiration Duration <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  {[
                    { label: '30 Days', days: 30 },
                    { label: '1 Year', days: 365 },
                    { label: '2 Years', days: 730 },
                    { label: '5 Years', days: 1825 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setValidityDays(opt.days);
                        setCustomDays('');
                      }}
                      className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                        validityDays === opt.days
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setValidityDays(-1)}
                    className={`py-1.5 px-3 text-xs font-medium rounded-lg border transition-colors ${
                      validityDays === -1
                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Custom Days
                  </button>
                  {validityDays === -1 && (
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={customDays}
                      onChange={(e) => setCustomDays(e.target.value)}
                      placeholder="e.g. 180"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Optional / Passwordless .p12 bundler */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <span>.p12 Bundle Password</span>
                    <span className="text-[11px] text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Strong Password</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordless ? '' : p12Password}
                    onChange={(e) => {
                      if (passwordless) setPasswordless(false);
                      setP12Password(e.target.value);
                    }}
                    disabled={passwordless}
                    placeholder={
                      passwordless
                        ? 'Passwordless export selected (no password)'
                        : 'Enter password or leave blank for passwordless .p12'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {!passwordless && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {p12Password && (
                        <button
                          type="button"
                          onClick={copyPasswordToClipboard}
                          title="Copy password"
                          className="p-1 text-slate-400 hover:text-white rounded"
                        >
                          {copiedPassword ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-slate-400 hover:text-white rounded"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={passwordless}
                    onChange={(e) => {
                      setPasswordless(e.target.checked);
                      if (e.target.checked) {
                        setP12Password('');
                      }
                    }}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300 flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Passwordless export (export .p12 without password)</span>
                  </span>
                </label>

                <p className="text-[11px] text-slate-400 leading-normal">
                  Leave blank or enable passwordless export to generate an unencrypted-password PKCS#12 archive.{' '}
                  <span className="text-amber-300/90">
                    Note: iOS/Apple devices typically require a non-empty password during profile import, while Android, Windows, and Linux accept empty/passwordless .p12 files.
                  </span>
                </p>
              </div>

              {/* Notes / Device description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Device Notes / Owner (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Primary smartphone for Alice with internal network access"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Issue & Bundle PKCS#12</span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Instant Success & Download Screen */
          <div className="text-center py-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-semibold text-white mb-1">Certificate Issued Successfully!</h3>
            <p className="text-xs text-slate-400 mb-6">
              The PKCS#12 bundle is ready. It contains the client certificate and private key (Root CA excluded).
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-3 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Personalized Name:</span>
                <span className="text-white font-semibold">{createdCert.personalizedName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Serial Number:</span>
                <span className="text-slate-300 font-mono">{createdCert.serialNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Expires On:</span>
                <span className="text-slate-300 font-mono">
                  {new Date(createdCert.expiryDate).toLocaleDateString()}
                </span>
              </div>
              {createdCert.allowedHosts && createdCert.allowedHosts.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-slate-400 block mb-1.5 font-medium">Allowed Hostnames:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {createdCert.allowedHosts.map((host) => (
                      <span
                        key={host}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono text-[11px]"
                      >
                        <Globe className="w-3 h-3 text-cyan-400" />
                        <span>{host}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Password display with copy button or passwordless notice */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-400 block mb-1 font-medium">Bundle Password:</span>
                {savedPassword ? (
                  <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                    <span className="font-mono text-emerald-400 text-xs font-semibold select-all">
                      {savedPassword}
                    </span>
                    <button
                      type="button"
                      onClick={copyPasswordToClipboard}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedPassword ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedPassword ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 text-amber-300 text-xs font-medium">
                    <Unlock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Passwordless .p12 (no password required on import)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Instant Download Button */}
            <div className="space-y-3">
              <a
                href={api.getCertDownloadUrl(createdCert.id, 'p12')}
                download={`${createdCert.personalizedName}.p12`}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download .p12 Bundle Now</span>
              </a>

              <div className="flex items-center justify-center gap-2">
                <a
                  href={api.getCertDownloadUrl(createdCert.id, 'crt')}
                  download={`${createdCert.personalizedName}.crt`}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60"
                >
                  Download .crt
                </a>
                <a
                  href={api.getCertDownloadUrl(createdCert.id, 'key')}
                  download={`${createdCert.personalizedName}.key`}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60"
                >
                  Download .key
                </a>
                <button
                  type="button"
                  onClick={onOpenInstallGuide}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg transition-colors border border-slate-700/60 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How to Install</span>
                </button>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Done & Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
