import React from 'react';
import { Shield, KeyRound, Server, FileText, Settings, Plus, Lock } from 'lucide-react';

interface TopBarProps {
  activeTab: 'dashboard' | 'certificates' | 'caddy' | 'crl' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'certificates' | 'caddy' | 'crl' | 'settings') => void;
  onOpenIssueModal: () => void;
  caActive: boolean;
  authEnabled: boolean;
  onLogout?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  onOpenIssueModal,
  caActive,
  authEnabled,
  onLogout,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-base font-semibold tracking-tight text-white whitespace-nowrap">
            Pro mTLS Manager
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === 'dashboard' || activeTab === 'certificates'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Certificates & CA</span>
          </button>

          <button
            onClick={() => setActiveTab('caddy')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === 'caddy'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>Server Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('crl')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === 'crl'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-rose-400" />
            <span>CRL & Trust</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {authEnabled && onLogout && (
            <button
              onClick={onLogout}
              title="Lock Dashboard"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenIssueModal}
            disabled={!caActive}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0 ${
              caActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Issue Certificate</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation row */}
      <div className="md:hidden flex items-center overflow-x-auto px-4 py-2 gap-1 border-t border-slate-800/60 bg-slate-900/50 scrollbar-none">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'dashboard' || activeTab === 'certificates' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          Certificates & CA
        </button>
        <button
          onClick={() => setActiveTab('caddy')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'caddy' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          Server Sync
        </button>
        <button
          onClick={() => setActiveTab('crl')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'crl' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          CRL
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-400'
          }`}
        >
          Settings
        </button>
      </div>
    </header>
  );
};
