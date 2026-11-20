import React, { useState, useMemo } from 'react';
import {
  KeyRound,
  Download,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  Plus,
  Loader2,
  FileDown,
  ShieldAlert,
  Trash2,
  Globe,
  Lock,
  Unlock,
} from 'lucide-react';
import { StoredClientCert } from '../types.ts';
import { api } from '../services/api.ts';

interface CertListProps {
  certs: StoredClientCert[];
  onOpenIssueModal: () => void;
  onRefresh: () => void;
}

export const CertList: React.FC<CertListProps> = ({
  certs,
  onOpenIssueModal,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'revoked'>('all');
  
  // Revocation Modal state
  const [revokingCert, setRevokingCert] = useState<StoredClientCert | null>(null);
  const [revokeReason, setRevokeReason] = useState('unspecified');
  const [revokingLoading, setRevokingLoading] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);

  // Download menu dropdown state
  const [menuCertId, setMenuCertId] = useState<string | null>(null);

  // Deletion Modal state
  const [deletingCert, setDeletingCert] = useState<StoredClientCert | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deletingCert) return;
    setDeletingLoading(true);
    setDeleteError(null);
    try {
      await api.deleteCert(deletingCert.id);
      setDeletingCert(null);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete certificate');
    } finally {
      setDeletingLoading(false);
    }
  };

  const filteredCerts = useMemo(() => {
    return certs.filter((cert) => {
      // Status filter
      if (statusFilter === 'active' && cert.status !== 'active') return false;
      if (statusFilter === 'expiring' && !cert.isExpiringSoon) return false;
      if (statusFilter === 'expired' && cert.status !== 'expired') return false;
      if (statusFilter === 'revoked' && cert.status !== 'revoked') return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        cert.personalizedName.toLowerCase().includes(q) ||
        cert.serialNumber.toLowerCase().includes(q) ||
        cert.organizationalUnit.toLowerCase().includes(q) ||
        (cert.allowedHosts && cert.allowedHosts.some((h) => h.toLowerCase().includes(q))) ||
        (cert.notes && cert.notes.toLowerCase().includes(q))
      );
    });
  }, [certs, statusFilter, search]);

  const handleRevoke = async () => {
    if (!revokingCert) return;
    setRevokingLoading(true);
    setRevokeMessage(null);

    try {
      const res = await api.revokeCert(revokingCert.id, revokeReason);
      let msg = `Certificate "${revokingCert.personalizedName}" revoked and added to CRL.`;
      if (res.caddySync) {
        if (res.caddySync.success) {
          msg += ' Caddy server was automatically updated and reloaded.';
        } else {
          msg += ` (Caddy sync warning: ${res.caddySync.message})`;
        }
      }
      setRevokeMessage(msg);
      setTimeout(() => {
        setRevokingCert(null);
        setRevokeMessage(null);
        onRefresh();
      }, 1500);
    } catch (err: any) {
      setRevokeMessage(`Error: ${err.message}`);
    } finally {
      setRevokingLoading(false);
    }
  };

  const formatDaysRemaining = (expiryDate: string, status: string) => {
    if (status === 'revoked') return null;
    const now = new Date().getTime();
    const exp = new Date(expiryDate).getTime();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Expired';
    if (diffDays === 1) return '1 day remaining';
    return `${diffDays} days remaining`;
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by personalized name, serial number, device..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: `All (${certs.length})` },
            { id: 'active', label: `Active (${certs.filter((c) => c.status === 'active').length})` },
            { id: 'expiring', label: `Expiring Soon (${certs.filter((c) => c.isExpiringSoon).length})` },
            { id: 'revoked', label: `Revoked (${certs.filter((c) => c.status === 'revoked').length})` },
            { id: 'expired', label: `Expired (${certs.filter((c) => c.status === 'expired').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Certificates Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {filteredCerts.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-1">
              {certs.length === 0 ? 'No client certificates issued yet' : 'No matching certificates found'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              {certs.length === 0
                ? 'Issue your first personalized client certificate for phones, laptops, or service daemons.'
                : 'Try adjusting your search query or status filter.'}
            </p>
            {certs.length === 0 && (
              <button
                onClick={onOpenIssueModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Issue First Certificate</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Identifier</th>
                  <th className="py-3 px-4">Serial Number</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredCerts.map((cert) => {
                  const daysRemainingText = formatDaysRemaining(cert.expiryDate, cert.status);
                  const isRevoked = cert.status === 'revoked';
                  const isExpired = cert.status === 'expired';
                  const isExpiring = cert.isExpiringSoon && !isRevoked && !isExpired;

                  return (
                    <tr
                      key={cert.id}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Identifier */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                          <span>{cert.personalizedName}</span>
                          {cert.hasPassword === false ? (
                            <span
                              title="PKCS#12 bundle exported without a password"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            >
                              <Unlock className="w-2.5 h-2.5" />
                              <span>Passwordless</span>
                            </span>
                          ) : cert.hasPassword === true ? (
                            <span
                              title="PKCS#12 bundle protected by a password"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            >
                              <Lock className="w-2.5 h-2.5" />
                              <span>Password-protected</span>
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-slate-500 block font-mono">
                          CN: {cert.commonName} · OU: {cert.organizationalUnit}
                        </span>
                        {cert.allowedHosts && cert.allowedHosts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {cert.allowedHosts.map((host) => (
                              <span
                                key={host}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                              >
                                <Globe className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                <span>{host}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {cert.notes && (
                          <span className="text-[11px] text-slate-400 block truncate max-w-xs mt-1">
                            {cert.notes}
                          </span>
                        )}
                      </td>

                      {/* Serial Number */}
                      <td className="py-3.5 px-4 font-mono text-slate-300 tabular-nums">
                        {cert.serialNumber}
                      </td>

                      {/* Issue Date */}
                      <td className="py-3.5 px-4 text-slate-300 font-mono tabular-nums">
                        {new Date(cert.issueDate).toLocaleDateString()}
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-300 font-mono tabular-nums block">
                          {new Date(cert.expiryDate).toLocaleDateString()}
                        </span>
                        {daysRemainingText && (
                          <span
                            className={`text-[11px] font-mono tabular-nums block ${
                              isExpiring
                                ? 'text-amber-400 font-medium'
                                : isExpired
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {daysRemainingText}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isRevoked ? (
                          <div className="flex items-center gap-1.5 text-rose-400">
                            <XCircle className="w-3.5 h-3.5" />
                            <span className="font-medium">Revoked</span>
                          </div>
                        ) : isExpired ? (
                          <div className="flex items-center gap-1.5 text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="font-medium">Expired</span>
                          </div>
                        ) : isExpiring ? (
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-medium">Expiring Soon</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-medium">Active</span>
                          </div>
                        )}
                        {isRevoked && cert.revokedAt && (
                          <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
                            {new Date(cert.revokedAt).toLocaleDateString()} · {cert.revocationReason || 'unspecified'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Download .p12 bundle */}
                          <a
                            href={api.getCertDownloadUrl(cert.id, 'p12')}
                            download={`${cert.personalizedName}.p12`}
                            title={cert.hasPassword === false ? 'Download passwordless .p12 bundle' : 'Download encrypted .p12 bundle'}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700/60 inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3 h-3 text-emerald-400" />
                            <span>.p12</span>
                          </a>

                          {/* Extra formats dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setMenuCertId(menuCertId === cert.id ? null : cert.id)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                              title="More download options"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {menuCertId === cert.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-20 py-1 text-left">
                                <a
                                  href={api.getCertDownloadUrl(cert.id, 'crt')}
                                  download={`${cert.personalizedName}.crt`}
                                  className="w-full px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
                                >
                                  <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Download .crt</span>
                                </a>
                                <a
                                  href={api.getCertDownloadUrl(cert.id, 'key')}
                                  download={`${cert.personalizedName}.key`}
                                  className="w-full px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2"
                                >
                                  <FileDown className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Download .key</span>
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Revoke button */}
                          {!isRevoked && (
                            <button
                              onClick={() => {
                                setRevokingCert(cert);
                                setRevokeReason('unspecified');
                                setRevokeMessage(null);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                              title="Revoke certificate and update CRL"
                            >
                              Revoke
                            </button>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={() => {
                              setDeletingCert(cert);
                              setDeleteError(null);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20"
                            title="Delete certificate permanently from storage"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revocation Modal */}
      {revokingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Revoke Certificate</h3>
                <p className="text-xs text-slate-400">
                  This action is permanent and updates the Certificate Revocation List (CRL).
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 mb-4">
              <div>
                <span className="text-slate-500">Identity: </span>
                <span className="text-white font-semibold">{revokingCert.personalizedName}</span>
              </div>
              <div>
                <span className="text-slate-500">Serial: </span>
                <span className="text-slate-300 font-mono">{revokingCert.serialNumber}</span>
              </div>
              <div>
                <span className="text-slate-500">Expires: </span>
                <span className="text-slate-300 font-mono">
                  {new Date(revokingCert.expiryDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <label className="block text-xs font-medium text-slate-300">
                RFC 5280 Revocation Reason
              </label>
              <select
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              >
                <option value="unspecified">Unspecified / General</option>
                <option value="keyCompromise">Key Compromise (Device lost or stolen)</option>
                <option value="affiliationChanged">Affiliation Changed (User left or reassigned)</option>
                <option value="superseded">Superseded (Replaced by newer certificate)</option>
                <option value="cessationOfOperation">Cessation of Operation (Decommissioned)</option>
              </select>
            </div>

            {revokeMessage && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg mb-4 text-xs text-slate-200">
                {revokeMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRevokingCert(null)}
                disabled={revokingLoading}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revokingLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {revokingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Revocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete Client Certificate</h3>
                <p className="text-xs text-slate-400">
                  Permanently purge certificate files and keys from storage.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 mb-4">
              <div>
                <span className="text-slate-500">Identity: </span>
                <span className="text-white font-semibold">{deletingCert.personalizedName}</span>
              </div>
              <div>
                <span className="text-slate-500">Serial: </span>
                <span className="text-slate-300 font-mono">{deletingCert.serialNumber}</span>
              </div>
              <div>
                <span className="text-slate-500">Status: </span>
                <span className="text-slate-300 capitalize">{deletingCert.status}</span>
              </div>
            </div>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 mb-5 leading-relaxed">
              <strong>Warning:</strong> This permanently deletes <code className="font-mono text-white">{deletingCert.personalizedName}.p12</code>, certificate CRT, private key, and database tracking from server disk. This operation cannot be undone.
            </div>

            {deleteError && (
              <div className="p-2.5 bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs text-rose-200 mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingCert(null)}
                disabled={deletingLoading}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletingLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {deletingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
