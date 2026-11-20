import React, { useState } from 'react';
import { Shield, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api.ts';

interface AuthLockScreenProps {
  onAuthenticated: () => void;
}

export const AuthLockScreen: React.FC<AuthLockScreenProps> = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.login(password);
      if (res.success) {
        onAuthenticated();
      } else {
        setError('Incorrect password.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-5">
          <Shield className="w-7 h-7" />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-white tracking-tight">Pro mTLS Manager</h1>
          <p className="text-xs text-slate-400 mt-1">
            Dashboard is protected with access passcode.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg mb-4 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Dashboard Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Unlock Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          <span className="text-[11px] text-slate-500">
            Self-hosted Private Certificate Authority & Caddy mTLS Engine
          </span>
        </div>
      </div>
    </div>
  );
};
