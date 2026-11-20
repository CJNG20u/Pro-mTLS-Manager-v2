import React, { useState, useEffect } from 'react';
import { FileText, Download, Copy, Check, ShieldAlert, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { CrlDetails } from '../types.ts';
import { api } from '../services/api.ts';

export const CrlPanel: React.FC = () => {
  const [crl, setCrl] = useState<CrlDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadCrl();
  }, []);

  const loadCrl = async () => {
    try {
      setLoading(true);
      const data = await api.getCrl();
      setCrl(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCrl();
    setRefreshing(false);
  };

  const copyPem = async () => {
    if (!crl?.rawPem) return;
    try {
      await navigator.clipboard.writeText(crl.rawPem);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
        <span className="text-xs">Loading Certificate Revocation List (CRL)...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                <span>Certificate Revocation List (CRL)</span>
                <span className="text-xs font-mono text-rose-400/90 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  RFC 5280 X.509 CRL v2
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">
                The CRL contains the serial numbers of all certificates that have been revoked prior to expiration.
                Caddy server reads this list via <code className="font-mono text-slate-300">crl_file</code> to deny TLS handshakes instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700/60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <a
              href={api.getCrlDownloadUrl()}
              download="crl.pem"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download crl.pem</span>
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 block mb-1">Revoked Certificates</span>
            <span className="text-xl font-bold text-rose-400 font-mono tabular-nums">
              {crl?.revokedCount || 0}
            </span>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 block mb-1">Last Generated</span>
            <span className="text-slate-200 font-mono tabular-nums">
              {crl?.lastUpdated ? new Date(crl.lastUpdated).toLocaleString() : 'N/A'}
            </span>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
            <span className="text-slate-400 block mb-1">Next Scheduled Expiry</span>
            <span className="text-slate-200 font-mono tabular-nums">
              {crl?.nextUpdate ? new Date(crl.nextUpdate).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Raw CRL PEM display */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Cryptographic CRL Payload (crl.pem)</span>
          </h3>
          <button
            onClick={copyPem}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded border border-slate-700/60 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy PEM'}</span>
          </button>
        </div>

        {crl?.rawPem ? (
          <pre className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto max-h-80 border border-slate-800 selection:bg-rose-500/20">
            {crl.rawPem}
          </pre>
        ) : (
          <div className="bg-slate-950 p-8 rounded-lg text-center text-xs text-slate-500 border border-slate-800">
            No CRL file generated yet. Initialize the Root CA to generate the initial empty CRL.
          </div>
        )}
      </div>
    </div>
  );
};
