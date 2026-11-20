import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../services/api.ts';
import { CaDetails, SystemConfig } from '../types.ts';

interface CaInitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (ca: CaDetails) => void;
  existingCa: CaDetails | null;
  systemConfig?: SystemConfig | null;
}

export const CaInitModal: React.FC<CaInitModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCa,
  systemConfig,
}) => {
  const defaults = systemConfig?.caDefaults;
  const presetDays = [365, 730, 1825, 3650];

  const [commonName, setCommonName] = useState(
    existingCa?.commonName || defaults?.commonName || 'Pro mTLS Private Root CA'
  );
  const [organization, setOrganization] = useState(
    existingCa?.organization || defaults?.organization || 'Private Infrastructure'
  );
  const [organizationalUnit, setOrganizationalUnit] = useState(
    existingCa?.organizationalUnit || defaults?.organizationalUnit || 'Private Certificate Authority'
  );
  const [country, setCountry] = useState(existingCa?.country || defaults?.country || 'US');
  const [validityDays, setValidityDays] = useState<number>(3650); // 10 years default for CA
  const [customDays, setCustomDays] = useState<string>('');
  const [keySize, setKeySize] = useState<2048 | 4096>(defaults?.keySize === 4096 ? 4096 : 2048);
  const [wipeExistingCerts, setWipeExistingCerts] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCommonName(existingCa?.commonName || defaults?.commonName || 'Pro mTLS Private Root CA');
    setOrganization(existingCa?.organization || defaults?.organization || 'Private Infrastructure');
    setOrganizationalUnit(
      existingCa?.organizationalUnit || defaults?.organizationalUnit || 'Private Certificate Authority'
    );
    setCountry(existingCa?.country || defaults?.country || 'US');
    const configuredDays = defaults?.validityDays || 3650;
    if (presetDays.includes(configuredDays)) {
      setValidityDays(configuredDays);
      setCustomDays('');
    } else {
      setValidityDays(-1);
      setCustomDays(String(configuredDays));
    }
    setKeySize(defaults?.keySize === 4096 ? 4096 : 2048);
  }, [isOpen, existingCa, defaults]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!commonName.trim()) {
      setError('Common Name (CN) is required.');
      return;
    }
    if (!organization.trim()) {
      setError('Organization (O) is required.');
      return;
    }

    const finalDays = validityDays === -1 ? parseInt(customDays, 10) : validityDays;
    if (isNaN(finalDays) || finalDays < 1) {
      setError('Please provide a valid duration in days.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.initRootCa({
        commonName: commonName.trim(),
        organization: organization.trim(),
        organizationalUnit: organizationalUnit.trim() || undefined,
        country: country.trim() || undefined,
        validityDays: finalDays,
        keySize,
        wipeExistingCerts: existingCa?.status === 'active' ? wipeExistingCerts : false,
      });

      onSuccess(res.ca);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Root CA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              {existingCa?.status === 'active' ? 'Rotate / Reissue Root CA ("Start Fresh")' : 'Initialize Private Root CA'}
            </h3>
            <p className="text-xs text-slate-400">
              Configure your internal Certificate Authority to sign mTLS client certificates and generate CRLs.
            </p>
          </div>
        </div>

        {existingCa?.status === 'active' && (
          <div className="space-y-3 mb-5">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Root CA Reissue & Key Rotation</span>
                Generating a new Root CA creates a fresh cryptographic keypair. You will need to upload the new <code className="font-mono text-white">ca.crt</code> to your Caddy server and client devices.
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer bg-slate-950 p-3 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={wipeExistingCerts}
                onChange={(e) => setWipeExistingCerts(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <span className="text-white font-medium block flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Start Fresh: Wipe all existing client certs & reset CRL (Recommended)</span>
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5 leading-relaxed">
                  Purges all previously issued client certificates from disk and resets the Certificate Revocation List to zero. Since old certificates cannot be validated by the new CA, starting fresh provides a clean, consistent PKI state.
                </span>
              </div>
            </label>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg mb-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Common Name (CN) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="e.g. Pro mTLS Private Root CA"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Organization (O) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. Private Infrastructure"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Organizational Unit (OU)
              </label>
              <input
                type="text"
                value={organizationalUnit}
                onChange={(e) => setOrganizationalUnit(e.target.value)}
                placeholder="e.g. Security & PKI"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Country Code (2 letters)
              </label>
              <input
                type="text"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                placeholder="US"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                RSA Key Size
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKeySize(2048)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    keySize === 2048
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  2048-bit (Fast)
                </button>
                <button
                  type="button"
                  onClick={() => setKeySize(4096)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    keySize === 4096
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  4096-bit (High)
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Root CA Validity Duration
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
              {[
                { label: '1 Year', days: 365 },
                { label: '2 Years', days: 730 },
                { label: '5 Years', days: 1825 },
                { label: '10 Years', days: 3650 },
                { label: 'Custom', days: -1 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setValidityDays(opt.days)}
                  className={`py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    validityDays === opt.days
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {validityDays === -1 && (
              <div className="mt-2">
                <input
                  type="number"
                  min="1"
                  max="36500"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  placeholder="Enter number of days (e.g. 7300)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            )}
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
              className={`px-5 py-2 text-white text-xs font-medium rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                existingCa?.status === 'active' && wipeExistingCerts
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {existingCa?.status === 'active'
                  ? wipeExistingCerts
                    ? 'Rotate CA & Start Fresh'
                    : 'Rotate CA'
                  : 'Initialize Root CA'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
