import { CaDetails, StoredClientCert, CrlDetails, CaddyConfig, SyncResult, AuthStatus, SystemConfig } from '../types.ts';

const TOKEN_KEY = 'mtls_dashboard_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('x-mtls-auth-token', token);
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401 && !endpoint.includes('/api/auth/')) {
    // Session expired or unauthorized
    window.dispatchEvent(new CustomEvent('auth-unauthorized'));
    throw new Error('Unauthorized access. Please log in.');
  }

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error || data.message) {
        errorMsg = data.error || data.message;
      }
    } catch {
      const text = await res.text();
      if (text) errorMsg = text;
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async getAuthStatus(): Promise<AuthStatus> {
    return request<AuthStatus>('/api/auth/status');
  },

  async login(password: string): Promise<{ success: boolean; token: string }> {
    const res = await request<{ success: boolean; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  async setupAuth(enabled: boolean, password?: string, currentPassword?: string): Promise<{ success: boolean; token?: string; message: string }> {
    const res = await request<{ success: boolean; token?: string; message: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ enabled, password, currentPassword }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  // System Config
  async getSystemConfig(): Promise<SystemConfig> {
    return request<SystemConfig>('/api/system/config');
  },

  // CA
  async getCaDetails(): Promise<CaDetails> {
    return request<CaDetails>('/api/ca');
  },

  async initRootCa(data: {
    commonName: string;
    organization: string;
    organizationalUnit?: string;
    country?: string;
    validityDays: number;
    keySize: 2048 | 4096;
    wipeExistingCerts?: boolean;
  }): Promise<{ success: boolean; ca: CaDetails }> {
    return request<{ success: boolean; ca: CaDetails }>('/api/ca/init', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCaDownloadUrl(): string {
    const token = getStoredToken();
    return token ? `/api/ca/download?token=${encodeURIComponent(token)}` : '/api/ca/download';
  },

  // Certificates
  async getCertificates(): Promise<StoredClientCert[]> {
    return request<StoredClientCert[]>('/api/certs');
  },

  async issueClientCert(data: {
    personalizedName: string;
    organization?: string;
    organizationalUnit?: string;
    validityDays: number;
    p12Password?: string | null;
    allowedHosts?: string[];
    emailAddress?: string;
    sanDns?: string[];
    notes?: string;
  }): Promise<{ success: boolean; cert: StoredClientCert }> {
    return request<{ success: boolean; cert: StoredClientCert }>('/api/certs/issue', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeCert(id: string, reason: string): Promise<{ success: boolean; cert: StoredClientCert; caddySync?: any }> {
    return request<{ success: boolean; cert: StoredClientCert; caddySync?: any }>(`/api/certs/${id}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async deleteCert(id: string): Promise<{ success: boolean; message: string; caddySync?: any }> {
    return request<{ success: boolean; message: string; caddySync?: any }>(`/api/certs/${id}`, {
      method: 'DELETE',
    });
  },

  getCertDownloadUrl(id: string, type: 'p12' | 'crt' | 'key'): string {
    const token = getStoredToken();
    return token ? `/api/certs/${id}/download/${type}?token=${encodeURIComponent(token)}` : `/api/certs/${id}/download/${type}`;
  },

  // CRL
  async getCrl(): Promise<CrlDetails> {
    return request<CrlDetails>('/api/crl');
  },

  getCrlDownloadUrl(): string {
    const token = getStoredToken();
    return token ? `/api/crl/download?token=${encodeURIComponent(token)}` : '/api/crl/download';
  },

  // Caddy
  async getCaddyConfig(): Promise<CaddyConfig> {
    return request<CaddyConfig>('/api/caddy/config');
  },

  async saveCaddyConfig(config: Partial<CaddyConfig>): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>('/api/caddy/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async testCaddyConnection(config: Partial<CaddyConfig>): Promise<{ success: boolean; message: string; details?: string }> {
    return request<{ success: boolean; message: string; details?: string }>('/api/caddy/test', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  async syncCaddy(): Promise<SyncResult> {
    return request<SyncResult>('/api/caddy/sync', {
      method: 'POST',
    });
  },

  async syncLocalCaddy(): Promise<SyncResult> {
    return request<SyncResult>('/api/caddy/sync-local', {
      method: 'POST',
    });
  },
};
