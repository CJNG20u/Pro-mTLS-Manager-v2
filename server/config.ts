import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

const execFileAsync = promisify(execFile);

// Load .env from current working directory (does not override existing process.env)
const envPath = path.resolve(process.cwd(), '.env');
const envFileExists = fs.existsSync(envPath);
dotenv.config({ path: envPath });

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  envFileExists: boolean;
  dataDir: string;
  dataDirRaw: string;
  ca: {
    autoInit: boolean;
    commonName: string;
    organization: string;
    organizationalUnit: string;
    country: string;
    validityDays: number;
    keySize: 2048 | 4096;
  };
  crl: {
    validityDays: number;
    outputPath: string | null;
    caCertOutputPath: string | null;
  };
  caddy: {
    reloadCmd: string;
    autoReloadLocal: boolean;
    remoteCertsDir: string;
    defaultAllowedHosts: string[];
  };
  sshKeyPath: string | null;
  authSalt: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value || !value.trim()) return fallback;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function resolveOptionalPath(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return path.resolve(process.cwd(), value.trim());
}

const rawDataDir = process.env.DATA_DIR?.trim() || './data';
const parsedPort = Number.parseInt(process.env.PORT?.trim() || '3000', 10);
const parsedCaValidityDays = Number.parseInt(process.env.CA_VALIDITY_DAYS?.trim() || '3650', 10);
const parsedCrlValidityDays = Number.parseInt(process.env.CRL_VALIDITY_DAYS?.trim() || '30', 10);
const parsedKeySize = Number.parseInt(process.env.CA_KEY_SIZE?.trim() || '2048', 10);

export const appConfig: AppConfig = {
  port: Number.isNaN(parsedPort) ? 3000 : parsedPort,
  host: process.env.HOST?.trim() || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  envFileExists,
  dataDirRaw: rawDataDir,
  dataDir: path.resolve(process.cwd(), rawDataDir),
  ca: {
    autoInit: parseBoolean(process.env.CA_AUTO_INIT, false),
    commonName: process.env.CA_COMMON_NAME?.trim() || 'Pro mTLS Private Root CA',
    organization: process.env.CA_ORGANIZATION?.trim() || 'Private Infrastructure',
    organizationalUnit: process.env.CA_ORGANIZATIONAL_UNIT?.trim() || 'Private Certificate Authority',
    country: (process.env.CA_COUNTRY?.trim() || 'US').toUpperCase(),
    validityDays: Number.isNaN(parsedCaValidityDays) ? 3650 : parsedCaValidityDays,
    keySize: parsedKeySize === 4096 ? 4096 : 2048,
  },
  crl: {
    validityDays: Number.isNaN(parsedCrlValidityDays) ? 30 : parsedCrlValidityDays,
    outputPath: resolveOptionalPath(process.env.CRL_OUTPUT_PATH),
    caCertOutputPath: resolveOptionalPath(process.env.CA_CERT_OUTPUT_PATH),
  },
  caddy: {
    reloadCmd: process.env.CADDY_RELOAD_CMD?.trim() || 'sudo systemctl reload caddy',
    autoReloadLocal: parseBoolean(process.env.CADDY_AUTO_RELOAD_LOCAL, false),
    remoteCertsDir: (process.env.CADDY_REMOTE_CERTS_DIR?.trim() || '/etc/caddy/certs').replace(/\/+$/, ''),
    defaultAllowedHosts: parseList(process.env.DEFAULT_ALLOWED_HOSTS, ['*.example.com']),
  },
  sshKeyPath: resolveOptionalPath(process.env.SSH_KEY_PATH),
  authSalt: process.env.AUTH_SALT?.trim() || 'pro_mtls_default_salt',
};

export interface StartupValidationResult {
  opensslVersion: string;
}

/**
 * Verifies host prerequisites (OpenSSL binary) and validates environment configuration
 * before starting the HTTP server. Prints clear, human-readable guidance on failure.
 */
export async function validateStartupEnvironment(): Promise<StartupValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Verify OpenSSL is installed and executable
  let opensslVersion = '';
  try {
    const { stdout } = await execFileAsync('openssl', ['version']);
    opensslVersion = stdout.trim();
    if (!opensslVersion) {
      errors.push('OpenSSL returned an empty version string. Ensure OpenSSL is properly installed.');
    }
  } catch (err: any) {
    errors.push(
      `OpenSSL CLI ("openssl") was not found or cannot be executed (${err?.code || err?.message}).\n` +
        '  Install it on Debian/Ubuntu with: sudo apt update && sudo apt install -y openssl'
    );
  }

  // 2. Validate required .env variables when running in production or when .env is present
  const strictMode = appConfig.nodeEnv === 'production' || parseBoolean(process.env.STRICT_ENV_VALIDATION, false);
  const requiredEnvVars: Array<{ key: string; description: string }> = [
    { key: 'PORT', description: 'HTTP listen port (e.g., 3000)' },
    { key: 'DATA_DIR', description: 'Directory for PKI storage (e.g., ./data or /var/lib/pro-mtls-manager)' },
    { key: 'CA_COMMON_NAME', description: 'Root CA Common Name (e.g., "My Org Private Root CA")' },
    { key: 'CA_ORGANIZATION', description: 'Root CA Organization (e.g., "My Organization")' },
    { key: 'CA_COUNTRY', description: '2-letter ISO country code (e.g., US, DE, GB)' },
    { key: 'CA_VALIDITY_DAYS', description: 'Root CA validity in days (e.g., 3650)' },
    { key: 'CADDY_RELOAD_CMD', description: 'Command to reload Caddy (e.g., "sudo systemctl reload caddy")' },
  ];

  if (!envFileExists) {
    if (strictMode) {
      const missingInEnv = requiredEnvVars.filter((v) => !process.env[v.key] || !process.env[v.key]?.trim());
      if (missingInEnv.length > 0) {
        errors.push(
          `Missing .env file and required production environment variables:\n` +
            missingInEnv.map((v) => `  - ${v.key}: ${v.description}`).join('\n') +
            '\n  Copy .env.example to .env and configure your environment before starting in production.'
        );
      }
    } else {
      warnings.push(
        'No .env file found in workspace root; running with safe defaults. Copy .env.example to .env to customize.'
      );
    }
  } else {
    // .env exists: ensure none of the core required variables are missing or left blank
    const missingFromDotEnv = requiredEnvVars.filter((v) => !process.env[v.key] || !process.env[v.key]?.trim());
    if (missingFromDotEnv.length > 0) {
      errors.push(
        `The following required variables are missing or empty in .env:\n` +
          missingFromDotEnv.map((v) => `  - ${v.key}: ${v.description}`).join('\n') +
          '\n  Refer to .env.example for valid values.'
      );
    }
  }

  // 3. Validate value formats (regardless of dev/prod mode)
  if (process.env.PORT !== undefined && process.env.PORT.trim() !== '') {
    const rawPort = Number.parseInt(process.env.PORT.trim(), 10);
    if (Number.isNaN(rawPort) || rawPort < 1 || rawPort > 65535) {
      errors.push(`Invalid PORT="${process.env.PORT}". Must be an integer between 1 and 65535.`);
    }
  }

  if (process.env.CA_VALIDITY_DAYS !== undefined && process.env.CA_VALIDITY_DAYS.trim() !== '') {
    const days = Number.parseInt(process.env.CA_VALIDITY_DAYS.trim(), 10);
    if (Number.isNaN(days) || days < 1 || days > 36500) {
      errors.push(`Invalid CA_VALIDITY_DAYS="${process.env.CA_VALIDITY_DAYS}". Must be an integer between 1 and 36500.`);
    }
  }

  if (process.env.CRL_VALIDITY_DAYS !== undefined && process.env.CRL_VALIDITY_DAYS.trim() !== '') {
    const days = Number.parseInt(process.env.CRL_VALIDITY_DAYS.trim(), 10);
    if (Number.isNaN(days) || days < 1 || days > 3650) {
      errors.push(`Invalid CRL_VALIDITY_DAYS="${process.env.CRL_VALIDITY_DAYS}". Must be an integer between 1 and 3650.`);
    }
  }

  if (process.env.CA_KEY_SIZE !== undefined && process.env.CA_KEY_SIZE.trim() !== '') {
    const ks = Number.parseInt(process.env.CA_KEY_SIZE.trim(), 10);
    if (ks !== 2048 && ks !== 4096) {
      errors.push(`Invalid CA_KEY_SIZE="${process.env.CA_KEY_SIZE}". Supported RSA key sizes are 2048 or 4096.`);
    }
  }

  if (appConfig.ca.country && !/^[A-Z]{2}$/.test(appConfig.ca.country)) {
    errors.push(`Invalid CA_COUNTRY="${appConfig.ca.country}". Must be a 2-letter ISO country code (e.g., US, GB, DE).`);
  }

  // 4. Verify DATA_DIR can be created and written to
  try {
    if (!fs.existsSync(appConfig.dataDir)) {
      fs.mkdirSync(appConfig.dataDir, { recursive: true, mode: 0o700 });
    }
    fs.accessSync(appConfig.dataDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err: any) {
    errors.push(
      `DATA_DIR "${appConfig.dataDir}" is not writable (${err?.message}).\n` +
        '  Ensure the directory exists and is owned by the user running Pro mTLS Manager.'
    );
  }

  // 5. Check CRL_OUTPUT_PATH parent directory if configured
  if (appConfig.crl.outputPath) {
    const crlParent = path.dirname(appConfig.crl.outputPath);
    if (!fs.existsSync(crlParent)) {
      warnings.push(
        `CRL_OUTPUT_PATH parent directory "${crlParent}" does not exist yet. It will be created automatically on CRL generation if permissions allow.`
      );
    }
  }

  if (warnings.length > 0) {
    console.warn('\n[Pro mTLS Manager] Startup Warnings:');
    for (const w of warnings) {
      console.warn(`  ! ${w}`);
    }
    console.warn('');
  }

  if (errors.length > 0) {
    console.error('\n================================================================');
    console.error('  Pro mTLS Manager - Startup Validation Failed');
    console.error('================================================================');
    for (const e of errors) {
      console.error(`\n[ERROR] ${e}`);
    }
    console.error('\nFix the issue(s) above and restart the service.');
    console.error('================================================================\n');
    process.exit(1);
  }

  console.log('[Pro mTLS Manager] Startup validation passed:');
  console.log(`  - OpenSSL:          ${opensslVersion}`);
  console.log(`  - Environment:      ${appConfig.nodeEnv} (.env ${envFileExists ? 'loaded' : 'not found, using defaults'})`);
  console.log(`  - Data directory:   ${appConfig.dataDir}`);
  console.log(`  - CRL export path:  ${appConfig.crl.outputPath || 'disabled (stored inside DATA_DIR only)'}`);
  console.log(`  - Caddy reload cmd: ${appConfig.caddy.reloadCmd}`);

  return { opensslVersion };
}

/**
 * Returns non-sensitive runtime configuration safe to expose to the frontend UI.
 */
export function getPublicSystemConfig() {
  return {
    dataDir: appConfig.dataDirRaw,
    crlOutputPath: appConfig.crl.outputPath,
    caCertOutputPath: appConfig.crl.caCertOutputPath,
    caddyReloadCmd: appConfig.caddy.reloadCmd,
    caddyAutoReloadLocal: appConfig.caddy.autoReloadLocal,
    caddyRemoteCertsDir: appConfig.caddy.remoteCertsDir,
    defaultAllowedHosts: appConfig.caddy.defaultAllowedHosts,
    caDefaults: {
      commonName: appConfig.ca.commonName,
      organization: appConfig.ca.organization,
      organizationalUnit: appConfig.ca.organizationalUnit,
      country: appConfig.ca.country,
      validityDays: appConfig.ca.validityDays,
      keySize: appConfig.ca.keySize,
      autoInit: appConfig.ca.autoInit,
    },
  };
}
