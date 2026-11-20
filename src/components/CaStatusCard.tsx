import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Download, Copy, Check, RefreshCw, Key, Calendar, Building, Globe, ExternalLink, HelpCircle } from 'lucide-react';
import { CaDetails } from '../types.ts';
import { api } from '../services/api.ts';

interface CaStatusCardProps {
  ca: CaDetails | null;
  onOpenInitModal: () => void;
  onOpenIssueModal: () => void;
  onOpenInstallGuide: () => void;
}

export const CaStatusCard: React.FC<CaStatusCardProps> = ({
  ca,
  onOpenInitModal,
  onOpenIssueModal,
  onOpenInstallGuide,
}) => {
  const [copied, setCopied] = useState(false);
  const [showPemModal, setShowPemModal] = useState(false);

  const isMissing = !ca || ca.status === 'missing';

  const copyPem = async () => {
    if (!ca?.certificatePem) return;
    try {
      await navigator.clipboard.writeText(ca.certificatePem);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy PEM', e);
    }
  };

  if (isMissing) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-sm">
        <div className="max-w-2xl mx-auto text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Active Root Certificate Authority</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Your mTLS manager requires an internal Private Root CA to cryptographically sign client certificates
            and publish standard Certificate Revocation Lists (CRL). Initialize your Root CA now with a custom Common Name,
            Organization, and validity duration.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onOpenInitModal}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Initialize Root CA</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-400 block mb-1">CA Status</span>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-lg font-semibold text-white">Active CA</span>
          </div>
          <span className="text-xs text-slate-500 mt-2 block font-mono">
            RSA {ca.keySize}·SHA-256
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-400 block mb-1">Active Client Certs</span>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {ca.activeCertsCount}
          </div>
          <span className="text-xs text-slate-500 mt-2 block">
            {ca.totalCertsIssued} total issued
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-400 block mb-1">Revoked in CRL</span>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {ca.revokedCertsCount}
          </div>
          <span className="text-xs text-slate-500 mt-2 block">
            Published in crl.pem
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-400 block mb-1">Expired Certs</span>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {ca.expiredCertsCount}
          </div>
          <span className="text-xs text-slate-500 mt-2 block">
            Past validity window
          </span>
        </div>
      </div>

      {/* Main CA Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-white tracking-tight">
                  {ca.commonName}
                </h2>
                <span className="text-xs font-mono text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ROOT CA
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span>{ca.organization}</span>
                {ca.organizationalUnit && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{ca.organizationalUnit}</span>
                  </>
                )}
                {ca.country && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Country: {ca.country}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={api.getCaDownloadUrl()}
              download="Pro_mTLS_Root_CA.crt"
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-2 border border-slate-700/60"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download ca.crt</span>
            </a>

            <button
              onClick={() => setShowPemModal(true)}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-2 border border-slate-700/60"
            >
              <Copy className="w-3.5 h-3.5 text-cyan-400" />
              <span>View PEM</span>
            </button>

            <button
              onClick={onOpenInstallGuide}
              className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-2 border border-slate-700/60"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Install Guide</span>
            </button>

            <button
              onClick={onOpenInitModal}
              title="Rotate Root CA and reissue fresh authority"
              className="px-3.5 py-2 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg transition-colors flex items-center gap-1.5 border border-amber-500/30"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Rotate CA (Start Fresh)</span>
            </button>
          </div>
        </div>

        {/* Detailed Metadata Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg-slate-900/60 text-xs">
          <div>
            <span className="text-slate-500 font-medium block mb-1">Serial Number</span>
            <span className="text-slate-300 font-mono break-all">{ca.serialNumber}</span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Key Specifications</span>
            <span className="text-slate-300 font-mono">
              RSA {ca.keySize}-bit · SHA-256
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Valid From</span>
            <span className="text-slate-300 font-mono tabular-nums">
              {new Date(ca.validFrom).toLocaleDateString()}
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Valid Until</span>
            <span className="text-slate-300 font-mono tabular-nums">
              {new Date(ca.validTo).toLocaleDateString()}
            </span>
          </div>

          <div className="md:col-span-2">
            <span className="text-slate-500 font-medium block mb-1">SHA-256 Fingerprint</span>
            <span className="text-slate-300 font-mono text-[11px] break-all selection:bg-cyan-500/30">
              {ca.fingerprintSha256}
            </span>
          </div>

          <div className="md:col-span-2">
            <span className="text-slate-500 font-medium block mb-1">SHA-1 Fingerprint</span>
            <span className="text-slate-300 font-mono text-[11px] break-all selection:bg-cyan-500/30">
              {ca.fingerprintSha1}
            </span>
          </div>
        </div>

        {/* Quick Launch footer */}
        <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>X.509 v3 Self-Signed Authority · BasicConstraints CA:TRUE · KeyUsage: keyCertSign, cRLSign</span>
          </div>
          <button
            onClick={onOpenIssueModal}
            className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors"
          >
            <span>+ Issue New Client Certificate</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* PEM Modal */}
      {showPemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Root CA Certificate (PEM Format)</h3>
              <button
                onClick={() => setShowPemModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Copy this standard X.509 PEM certificate to install on reverse proxies, Caddy servers, or mobile device trust stores.
            </p>
            <div className="relative">
              <pre className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto max-h-72 border border-slate-800 selection:bg-emerald-500/30">
                {ca.certificatePem}
              </pre>
              <button
                onClick={copyPem}
                className="absolute top-2 right-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy PEM'}</span>
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <a
                href={api.getCaDownloadUrl()}
                download="Pro_mTLS_Root_CA.crt"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .crt</span>
              </a>
              <button
                onClick={() => setShowPemModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
