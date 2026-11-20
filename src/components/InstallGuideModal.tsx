import React, { useState } from 'react';
import { Smartphone, Laptop, Terminal, Apple, Check, Copy } from 'lucide-react';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ isOpen, onClose }) => {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'macos' | 'windows' | 'curl'>('ios');
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!isOpen) return null;

  const curlExample = `# Test mTLS endpoint with curl using exported certificates
curl -v \\
  --cacert ca.crt \\
  --cert client.crt \\
  --key client.key \\
  https://secure.example.com/

# Or convert .p12 directly if needed:
openssl pkcs12 -in client.p12 -clcerts -nokeys -out client.crt
openssl pkcs12 -in client.p12 -nocerts -nodes -out client.key`;

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlExample);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Client Certificate Installation Guide</h3>
            <p className="text-xs text-slate-400">
              How to install your password-encrypted .p12 identity certificate onto devices.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Platform tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg mb-6 overflow-x-auto scrollbar-none">
          {[
            { id: 'ios', label: 'iOS / iPhone / iPad', icon: Apple },
            { id: 'android', label: 'Android Phones', icon: Smartphone },
            { id: 'macos', label: 'macOS', icon: Laptop },
            { id: 'windows', label: 'Windows', icon: Laptop },
            { id: 'curl', label: 'Linux & cURL', icon: Terminal },
          ].map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  platform === p.id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content by platform */}
        <div className="text-xs text-slate-300 space-y-4">
          {platform === 'ios' && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Apple className="w-4 h-4 text-emerald-400" />
                <span>Installing on iPhone / iPad (iOS & iPadOS)</span>
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">Download the .p12 file:</strong> AirDrop, iCloud Drive, or open this dashboard on Safari to download the file directly.
                </li>
                <li>
                  <strong className="text-white">Profile Downloaded prompt:</strong> iOS will prompt: <em>"Profile Downloaded: Review the profile in Settings app if you want to install it."</em>
                </li>
                <li>
                  <strong className="text-white">Open Settings:</strong> Go to <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-emerald-400">Settings &gt; Profile Downloaded</code> (near the top).
                </li>
                <li>
                  <strong className="text-white">Install & Enter Passcode:</strong> Tap <strong>Install</strong> in the top right, enter your device lock passcode, then tap <strong>Install</strong> again.
                </li>
                <li>
                  <strong className="text-white">Enter .p12 Bundle Password:</strong> When prompted for <em>"Enter the password for the identity certificate"</em>, type or paste the password you generated during certificate issuance.
                </li>
                <li>
                  <strong className="text-white">Browse with Safari/Chrome:</strong> When visiting your Caddy-protected domain, iOS will display a prompt asking: <em>"Select an identity to access secure.example.com"</em>. Select your certificate and you are in!
                </li>
              </ol>
            </div>
          )}

          {platform === 'android' && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Installing on Android (Pixel, Samsung, OnePlus, etc.)</span>
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">Download the .p12 file:</strong> Download the .p12 certificate file to your phone's Downloads directory.
                </li>
                <li>
                  <strong className="text-white">Open Certificate Settings:</strong> Open Android <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-emerald-400">Settings &gt; Security &gt; More security settings &gt; Encryption & credentials</code> (or search "Install certificate" in Settings search).
                </li>
                <li>
                  <strong className="text-white">Select User Certificate:</strong> Tap <strong>Install a certificate</strong> and choose <strong>VPN & app user certificate</strong>.
                </li>
                <li>
                  <strong className="text-white">Select File & Enter Password:</strong> Pick the downloaded <code className="font-mono text-emerald-400">.p12</code> file and input the bundle password when prompted.
                </li>
                <li>
                  <strong className="text-white">Name Certificate:</strong> Give it a friendly name (e.g. <em>alice-phone</em>) and tap OK.
                </li>
              </ol>
            </div>
          )}

          {platform === 'macos' && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-400" />
                <span>Installing on macOS (Keychain Access)</span>
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">Double-click the .p12 file:</strong> Double-click the downloaded .p12 file in Finder.
                </li>
                <li>
                  <strong className="text-white">Choose Keychain:</strong> In the prompt, select <code className="font-mono text-emerald-400">login</code> keychain.
                </li>
                <li>
                  <strong className="text-white">Enter Bundle Password:</strong> Enter the .p12 password set when issuing.
                </li>
                <li>
                  <strong className="text-white">Authorize Mac:</strong> Enter your macOS admin password to authorize the keychain update. Both your client certificate and private key are now safely placed in your Keychain.
                </li>
              </ol>
            </div>
          )}

          {platform === 'windows' && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-emerald-400" />
                <span>Installing on Windows 10 & 11</span>
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">Double-click the .p12 file:</strong> Opens the <em>Certificate Import Wizard</em>.
                </li>
                <li>
                  <strong className="text-white">Store Location:</strong> Select <strong>Current User</strong> and click Next.
                </li>
                <li>
                  <strong className="text-white">Enter Password:</strong> Type the bundle password. Check <em>"Mark this key as exportable"</em> if desired.
                </li>
                <li>
                  <strong className="text-white">Automatic Store:</strong> Select <em>"Automatically select certificate store based on certificate type"</em> and finish.
                </li>
              </ol>
            </div>
          )}

          {platform === 'curl' && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Linux CLI & cURL Verification</span>
                </h4>
                <button
                  onClick={copyCurl}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded border border-slate-800"
                >
                  {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCmd ? 'Copied' : 'Copy cURL'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-900 rounded font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800 leading-relaxed">
                {curlExample}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
