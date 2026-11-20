export interface CaDetails {
  status: 'active' | 'missing';
  commonName: string;
  organization: string;
  organizationalUnit?: string;
  country?: string;
  keySize: number;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  fingerprintSha256: string;
  fingerprintSha1: string;
  certificatePem: string;
  totalCertsIssued: number;
  activeCertsCount: number;
  revokedCertsCount: number;
  expiredCertsCount: number;
}

export interface StoredClientCert {
  id: string;
  personalizedName: string;
  commonName: string;
  organization: string;
  organizationalUnit: string;
  allowedHosts: string[];
  serialNumber: string;
  issueDate: string;
  expiryDate: string;
  validityDays: number;
  status: 'active' | 'expired' | 'revoked';
  isExpiringSoon: boolean;
  revokedAt?: string;
  revocationReason?: string;
  fingerprintSha256: string;
  hasP12: boolean;
  hasPassword?: boolean;
  notes?: string;
}

export interface CrlDetails {
  lastUpdated: string;
  nextUpdate: string;
  revokedCount: number;
  rawPem: string;
}

export interface CaddyConfig {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  hasPassword?: boolean;
  hasKey?: boolean;
  hasPassphrase?: boolean;
  remoteCertsDir: string;
  reloadCommand: string;
  autoSyncOnRevoke: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'failed' | 'never';
  lastSyncLog?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  log?: string;
  timestamp: string;
  filesUploaded?: string[];
  reloadOutput?: string;
}

export interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
}

export interface SystemConfig {
  dataDir: string;
  crlOutputPath: string | null;
  caCertOutputPath: string | null;
  caddyReloadCmd: string;
  caddyAutoReloadLocal: boolean;
  caddyRemoteCertsDir: string;
  defaultAllowedHosts: string[];
  caDefaults: {
    commonName: string;
    organization: string;
    organizationalUnit: string;
    country: string;
    validityDays: number;
    keySize: 2048 | 4096;
    autoInit: boolean;
  };
}
