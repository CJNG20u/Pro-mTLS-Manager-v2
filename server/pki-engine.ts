import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import forge from 'node-forge';
import { appConfig } from './config.ts';

const execFileAsync = promisify(execFile);

export interface CaInitOptions {
  commonName: string;
  organization: string;
  organizationalUnit?: string;
  country?: string;
  validityDays: number;
  keySize?: 2048 | 4096;
  wipeExistingCerts?: boolean;
}

export interface ClientCertIssueOptions {
  personalizedName: string;
  organization?: string;
  organizationalUnit?: string;
  validityDays: number;
  p12Password?: string | null;
  allowedHosts?: string[];
  emailAddress?: string;
  sanDns?: string[];
  notes?: string;
}

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
  p12PasswordHint?: string;
  notes?: string;
}

export interface CrlDetails {
  lastUpdated: string;
  nextUpdate: string;
  revokedCount: number;
  rawPem: string;
}

const STORAGE_ROOT = appConfig.dataDir;
const CA_DIR = path.join(STORAGE_ROOT, 'ca');
const CERTS_DIR = path.join(STORAGE_ROOT, 'certs');
const CRL_DIR = path.join(STORAGE_ROOT, 'crl');
const CONFIG_FILE = path.join(STORAGE_ROOT, 'config.json');

export class PkiEngine {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [STORAGE_ROOT, CA_DIR, CERTS_DIR, CRL_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    });

    const indexFile = path.join(CRL_DIR, 'index.txt');
    if (!fs.existsSync(indexFile)) {
      fs.writeFileSync(indexFile, '', 'utf8');
    }

    const serialFile = path.join(CRL_DIR, 'serial');
    if (!fs.existsSync(serialFile)) {
      fs.writeFileSync(serialFile, '1001\n', 'utf8');
    }

    const crlnumberFile = path.join(CRL_DIR, 'crlnumber');
    if (!fs.existsSync(crlnumberFile)) {
      fs.writeFileSync(crlnumberFile, '01\n', 'utf8');
    }

    this.ensureOpenSslCnf();
  }

  private ensureOpenSslCnf() {
    const cnfPath = path.join(CRL_DIR, 'openssl.cnf');
    const content = `
[ ca ]
default_ca = CA_default

[ CA_default ]
dir = ${CRL_DIR}
certs = ${CRL_DIR}/newcerts
new_certs_dir = ${CRL_DIR}/newcerts
database = ${CRL_DIR}/index.txt
serial = ${CRL_DIR}/serial
crlnumber = ${CRL_DIR}/crlnumber
crl = ${CRL_DIR}/crl.pem
private_key = ${path.join(CA_DIR, 'ca.key')}
certificate = ${path.join(CA_DIR, 'ca.crt')}
default_md = sha256
default_crl_days = ${appConfig.crl.validityDays}
policy = policy_anything

[ policy_anything ]
countryName = optional
stateOrProvinceName = optional
localityName = optional
organizationName = optional
organizationalUnitName = optional
commonName = supplied
emailAddress = optional
`;
    fs.writeFileSync(cnfPath, content.trim(), 'utf8');

    const newcertsDir = path.join(CRL_DIR, 'newcerts');
    if (!fs.existsSync(newcertsDir)) {
      fs.mkdirSync(newcertsDir, { recursive: true, mode: 0o700 });
    }
  }

  public isCaActive(): boolean {
    const certPath = path.join(CA_DIR, 'ca.crt');
    const keyPath = path.join(CA_DIR, 'ca.key');
    return fs.existsSync(certPath) && fs.existsSync(keyPath);
  }

  /**
   * First-run CA bootstrap:
   * - If a Root CA already exists, ensures OpenSSL config and exports are up to date.
   * - If the CA directory is empty and CA_AUTO_INIT=true, initializes a fresh Root CA using .env values.
   * - Otherwise leaves CA uninitialized so the UI presents the first-run setup flow.
   */
  public async ensureFirstRunCa(): Promise<void> {
    if (this.isCaActive()) {
      this.ensureOpenSslCnf();
      return;
    }

    if (appConfig.ca.autoInit) {
      console.log(
        `[Pro mTLS Manager] CA directory is empty and CA_AUTO_INIT=true. Initializing Root CA "${appConfig.ca.commonName}"...`
      );
      await this.initRootCa({
        commonName: appConfig.ca.commonName,
        organization: appConfig.ca.organization,
        organizationalUnit: appConfig.ca.organizationalUnit,
        country: appConfig.ca.country,
        validityDays: appConfig.ca.validityDays,
        keySize: appConfig.ca.keySize,
        wipeExistingCerts: false,
      });
      console.log('[Pro mTLS Manager] Fresh Root CA and initial CRL generated automatically.');
    } else {
      console.log(
        '[Pro mTLS Manager] No Root CA found in DATA_DIR. Open the web UI to complete first-run Root CA setup (or set CA_AUTO_INIT=true in .env).'
      );
    }
  }

  private exportFileToPath(targetPath: string, content: string, mode: number = 0o644): void {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
    }
    fs.writeFileSync(targetPath, content, { mode, encoding: 'utf8' });
  }

  public getCaDetails(): CaDetails {
    const certPath = path.join(CA_DIR, 'ca.crt');
    const certs = this.getAllCertificates();
    const active = certs.filter((c) => c.status === 'active').length;
    const revoked = certs.filter((c) => c.status === 'revoked').length;
    const expired = certs.filter((c) => c.status === 'expired').length;

    if (!this.isCaActive()) {
      return {
        status: 'missing',
        commonName: '',
        organization: '',
        keySize: 2048,
        validFrom: '',
        validTo: '',
        serialNumber: '',
        fingerprintSha256: '',
        fingerprintSha1: '',
        certificatePem: '',
        totalCertsIssued: certs.length,
        activeCertsCount: active,
        revokedCertsCount: revoked,
        expiredCertsCount: expired,
      };
    }

    const certPem = fs.readFileSync(certPath, 'utf8');
    const cert = forge.pki.certificateFromPem(certPem);

    const getAttr = (name: string): string => {
      const attr = cert.subject.getField(name);
      return attr ? String(attr.value) : '';
    };

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const derBuffer = Buffer.from(der, 'binary');
    const fp256 = crypto.createHash('sha256').update(derBuffer).digest('hex').match(/.{2}/g)?.join(':').toUpperCase() || '';
    const fp1 = crypto.createHash('sha1').update(derBuffer).digest('hex').match(/.{2}/g)?.join(':').toUpperCase() || '';

    let keySize = 2048;
    const rsaPubKey = cert.publicKey as forge.pki.rsa.PublicKey;
    if (rsaPubKey && rsaPubKey.n) {
      keySize = rsaPubKey.n.bitLength();
    }

    return {
      status: 'active',
      commonName: getAttr('CN') || getAttr('commonName') || appConfig.ca.commonName,
      organization: getAttr('O') || getAttr('organizationName') || appConfig.ca.organization,
      organizationalUnit: getAttr('OU') || getAttr('organizationalUnitName') || undefined,
      country: getAttr('C') || getAttr('countryName') || undefined,
      keySize,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      serialNumber: cert.serialNumber,
      fingerprintSha256: fp256,
      fingerprintSha1: fp1,
      certificatePem: certPem,
      totalCertsIssued: certs.length,
      activeCertsCount: active,
      revokedCertsCount: revoked,
      expiredCertsCount: expired,
    };
  }

  public getCaCertPem(): string {
    const certPath = path.join(CA_DIR, 'ca.crt');
    if (!fs.existsSync(certPath)) {
      throw new Error('Root CA certificate does not exist yet. Please initialize the CA first.');
    }
    return fs.readFileSync(certPath, 'utf8');
  }

  public async initRootCa(options: CaInitOptions): Promise<CaDetails> {
    const keySize = options.keySize || 2048;
    const keypair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, kp) => {
        if (err) reject(err);
        else resolve(kp);
      });
    });

    const cert = forge.pki.createCertificate();
    cert.publicKey = keypair.publicKey;

    const serialBytes = crypto.randomBytes(8);
    serialBytes[0] = serialBytes[0] & 0x7f;
    cert.serialNumber = serialBytes.toString('hex');

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notBefore.getDate() + (options.validityDays || 3650));

    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    const attrs = [
      { name: 'commonName', value: options.commonName.trim() },
      { name: 'organizationName', value: options.organization.trim() },
    ];
    if (options.organizationalUnit?.trim()) {
      attrs.push({ name: 'organizationalUnitName', value: options.organizationalUnit.trim() });
    }
    if (options.country?.trim()) {
      attrs.push({ name: 'countryName', value: options.country.trim().toUpperCase() });
    }

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: true,
        critical: true,
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        cRLSign: true,
        digitalSignature: true,
        critical: true,
      },
      {
        name: 'subjectKeyIdentifier',
      },
    ]);

    cert.sign(keypair.privateKey, forge.md.sha256.create());

    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keypair.privateKey);

    fs.writeFileSync(path.join(CA_DIR, 'ca.crt'), certPem, { mode: 0o644 });
    fs.writeFileSync(path.join(CA_DIR, 'ca.key'), keyPem, { mode: 0o600 });

    if (appConfig.crl.caCertOutputPath) {
      try {
        this.exportFileToPath(appConfig.crl.caCertOutputPath, certPem, 0o644);
      } catch (err: any) {
        console.warn(`Warning: Failed to export CA cert to CA_CERT_OUTPUT_PATH (${appConfig.crl.caCertOutputPath}): ${err.message}`);
      }
    }

    const caMeta = {
      initializedAt: new Date().toISOString(),
      commonName: options.commonName,
      organization: options.organization,
      organizationalUnit: options.organizationalUnit,
      country: options.country,
      keySize,
      validityDays: options.validityDays,
    };
    fs.writeFileSync(path.join(CA_DIR, 'meta.json'), JSON.stringify(caMeta, null, 2), 'utf8');

    if (options.wipeExistingCerts) {
      if (fs.existsSync(CERTS_DIR)) {
        const dirs = fs.readdirSync(CERTS_DIR);
        for (const dir of dirs) {
          try {
            fs.rmSync(path.join(CERTS_DIR, dir), { recursive: true, force: true });
          } catch (e) {
            console.warn(`Failed to remove cert dir ${dir}:`, e);
          }
        }
      }
    }

    this.resetCrlDatabase();
    await this.generateCrl();

    return this.getCaDetails();
  }

  private resetCrlDatabase() {
    fs.writeFileSync(path.join(CRL_DIR, 'index.txt'), '', 'utf8');
    fs.writeFileSync(path.join(CRL_DIR, 'serial'), '1001\n', 'utf8');
    fs.writeFileSync(path.join(CRL_DIR, 'crlnumber'), '01\n', 'utf8');
    const newcertsDir = path.join(CRL_DIR, 'newcerts');
    if (fs.existsSync(newcertsDir)) {
      const files = fs.readdirSync(newcertsDir);
      for (const f of files) {
        try {
          fs.rmSync(path.join(newcertsDir, f), { force: true });
        } catch {}
      }
    }
    this.ensureOpenSslCnf();
  }

  public async issueClientCert(options: ClientCertIssueOptions): Promise<{ cert: StoredClientCert; p12Buffer: Buffer }> {
    if (!this.isCaActive()) {
      throw new Error('Cannot issue client certificates without an active Root CA. Please initialize the Root CA first.');
    }

    if (!options.personalizedName || options.personalizedName.trim().length === 0) {
      throw new Error('A personalized, human-readable name/identifier is required.');
    }

    const rawPassword = typeof options.p12Password === 'string' ? options.p12Password : '';
    const hasPassword = rawPassword.length > 0;
    const p12PassForForge = hasPassword ? rawPassword : '';

    const rawHosts = Array.isArray(options.allowedHosts) ? options.allowedHosts : [];
    const cleanedHosts = Array.from(
      new Set(
        rawHosts
          .map((h) => (typeof h === 'string' ? h.trim() : ''))
          .filter((h) => h.length > 0)
      )
    );
    const allowedHosts = cleanedHosts.length > 0 ? cleanedHosts : [...appConfig.caddy.defaultAllowedHosts];

    const caDetails = this.getCaDetails();
    const caCertPem = fs.readFileSync(path.join(CA_DIR, 'ca.crt'), 'utf8');
    const caKeyPem = fs.readFileSync(path.join(CA_DIR, 'ca.key'), 'utf8');
    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);

    const clientKeypair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, kp) => {
        if (err) reject(err);
        else resolve(kp);
      });
    });

    const clientCert = forge.pki.createCertificate();
    clientCert.publicKey = clientKeypair.publicKey;

    // Read and increment sequential serial from disk (OpenSSL compatibility)
    const serialFilePath = path.join(CRL_DIR, 'serial');
    let serialHex = '1001';
    try {
      const currentSerialHex = fs.readFileSync(serialFilePath, 'utf8').trim();
      const serialDec = parseInt(currentSerialHex, 16) || 1001;
      serialHex = serialDec.toString(16);
      const nextDec = serialDec + 1;
      fs.writeFileSync(serialFilePath, `${nextDec.toString(16).toUpperCase()}\n`, 'utf8');
    } catch {
      serialHex = crypto.randomBytes(4).toString('hex');
    }
    clientCert.serialNumber = serialHex;

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notBefore.getDate() + (options.validityDays || 365));

    clientCert.validity.notBefore = notBefore;
    clientCert.validity.notAfter = notAfter;

    const personalized = options.personalizedName.trim();
    const org = options.organization?.trim() || caDetails.organization || 'Pro mTLS';
    const ou = options.organizationalUnit?.trim() || personalized;

    const subjectAttrs: Array<{ name: string; value: string }> = [
      { name: 'commonName', value: personalized },
      { name: 'organizationName', value: org },
      { name: 'organizationalUnitName', value: ou },
    ];
    for (const host of allowedHosts) {
      subjectAttrs.push({ name: 'organizationalUnitName', value: `host:${host}` });
    }
    if (options.emailAddress?.trim()) {
      subjectAttrs.push({ name: 'emailAddress', value: options.emailAddress.trim() });
    }

    clientCert.setSubject(subjectAttrs);
    clientCert.setIssuer(caCert.subject.attributes);

    const altNames: Array<{ type: number; value: string }> = [];
    if (options.emailAddress?.trim()) {
      altNames.push({ type: 1, value: options.emailAddress.trim() });
    }
    if (options.sanDns && options.sanDns.length > 0) {
      options.sanDns.forEach((d) => {
        if (d.trim()) altNames.push({ type: 2, value: d.trim() });
      });
    }

    const extensions: any[] = [
      {
        name: 'basicConstraints',
        cA: false,
        critical: true,
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        critical: true,
      },
      {
        name: 'extKeyUsage',
        clientAuth: true,
        serverAuth: false,
      },
      {
        name: 'subjectKeyIdentifier',
      },
      {
        name: 'authorityKeyIdentifier',
      },
    ];

    if (altNames.length > 0) {
      extensions.push({
        name: 'subjectAltName',
        altNames,
      });
    }

    clientCert.setExtensions(extensions);
    clientCert.sign(caKey, forge.md.sha256.create());

    const clientCertPem = forge.pki.certificateToPem(clientCert);
    const clientKeyPem = forge.pki.privateKeyToPem(clientKeypair.privateKey);

    // Create clean PKCS#12 bundle containing ONLY the client cert and private key (exclude root CA)
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(clientKeypair.privateKey, clientCert, p12PassForForge, {
      generateLocalKeyId: true,
      friendlyName: personalized,
      algorithm: '3des',
    });
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, 'binary');

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(clientCert)).getBytes();
    const derBuffer = Buffer.from(der, 'binary');
    const fp256 = crypto.createHash('sha256').update(derBuffer).digest('hex').match(/.{2}/g)?.join(':').toUpperCase() || '';

    const certId = `cert_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const certDir = path.join(CERTS_DIR, certId);
    fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });

    fs.writeFileSync(path.join(certDir, 'cert.crt'), clientCertPem, { mode: 0o644 });
    fs.writeFileSync(path.join(certDir, 'cert.key'), clientKeyPem, { mode: 0o600 });
    fs.writeFileSync(path.join(certDir, 'bundle.p12'), p12Buffer, { mode: 0o600 });

    const now = new Date();
    const isExpiringSoon = (notAfter.getTime() - now.getTime()) < (30 * 24 * 60 * 60 * 1000);

    const storedCert: StoredClientCert = {
      id: certId,
      personalizedName: personalized,
      commonName: personalized,
      organization: org,
      organizationalUnit: ou,
      allowedHosts,
      serialNumber: serialHex,
      issueDate: notBefore.toISOString(),
      expiryDate: notAfter.toISOString(),
      validityDays: options.validityDays,
      status: now > notAfter ? 'expired' : 'active',
      isExpiringSoon,
      fingerprintSha256: fp256,
      hasP12: true,
      hasPassword,
      notes: options.notes,
    };

    fs.writeFileSync(path.join(certDir, 'meta.json'), JSON.stringify(storedCert, null, 2), 'utf8');

    this.registerInOpenSslIndex(storedCert, clientCertPem);

    return { cert: storedCert, p12Buffer };
  }

  private registerInOpenSslIndex(cert: StoredClientCert, certPem: string) {
    try {
      const indexFile = path.join(CRL_DIR, 'index.txt');
      const expiry = new Date(cert.expiryDate);
      const pad = (n: number) => String(n).padStart(2, '0');
      const expStr = `${String(expiry.getUTCFullYear()).slice(2)}${pad(expiry.getUTCMonth() + 1)}${pad(expiry.getUTCDate())}${pad(expiry.getUTCHours())}${pad(expiry.getUTCMinutes())}${pad(expiry.getUTCSeconds())}Z`;
      
      const newcertsDir = path.join(CRL_DIR, 'newcerts');
      const archivePath = path.join(newcertsDir, `${cert.serialNumber.toUpperCase()}.pem`);
      fs.writeFileSync(archivePath, certPem, 'utf8');

      const hostOus = (cert.allowedHosts || []).map((h) => `/OU=host:${h}`).join('');
      const line = `V\t${expStr}\t\t${cert.serialNumber.toUpperCase()}\tunknown\t/CN=${cert.commonName}/O=${cert.organization}/OU=${cert.organizationalUnit}${hostOus}\n`;
      fs.appendFileSync(indexFile, line, 'utf8');
    } catch (e) {
      console.warn('Failed to register in OpenSSL index:', e);
    }
  }

  public getAllCertificates(): StoredClientCert[] {
    if (!fs.existsSync(CERTS_DIR)) return [];

    const dirs = fs.readdirSync(CERTS_DIR);
    const certs: StoredClientCert[] = [];
    const now = new Date();

    for (const dir of dirs) {
      const metaPath = path.join(CERTS_DIR, dir, 'meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const raw = fs.readFileSync(metaPath, 'utf8');
          const item = JSON.parse(raw) as StoredClientCert;
          item.allowedHosts = Array.isArray(item.allowedHosts) ? item.allowedHosts : [];
          const exp = new Date(item.expiryDate);

          if (item.status !== 'revoked') {
            if (now > exp) {
              item.status = 'expired';
            } else {
              item.status = 'active';
            }
          }
          item.isExpiringSoon = item.status === 'active' && (exp.getTime() - now.getTime()) < (30 * 24 * 60 * 60 * 1000);
          certs.push(item);
        } catch (e) {
          console.error(`Error parsing certificate meta for ${dir}:`, e);
        }
      }
    }

    certs.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    return certs;
  }

  public getCertificateById(id: string): StoredClientCert | null {
    const metaPath = path.join(CERTS_DIR, id, 'meta.json');
    if (!fs.existsSync(metaPath)) return null;
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const item = JSON.parse(raw) as StoredClientCert;
      item.allowedHosts = Array.isArray(item.allowedHosts) ? item.allowedHosts : [];
      return item;
    } catch {
      return null;
    }
  }

  public getCertFile(id: string, type: 'p12' | 'crt' | 'key'): { buffer: Buffer; filename: string; mimeType: string } {
    const cert = this.getCertificateById(id);
    if (!cert) {
      throw new Error(`Certificate ${id} not found`);
    }

    const certDir = path.join(CERTS_DIR, id);
    const safeName = cert.personalizedName.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (type === 'p12') {
      const p12Path = path.join(certDir, 'bundle.p12');
      if (!fs.existsSync(p12Path)) throw new Error('PKCS#12 bundle not found on disk');
      return {
        buffer: fs.readFileSync(p12Path),
        filename: `${safeName}.p12`,
        mimeType: 'application/x-pkcs12',
      };
    } else if (type === 'crt') {
      const crtPath = path.join(certDir, 'cert.crt');
      if (!fs.existsSync(crtPath)) throw new Error('Certificate CRT file not found on disk');
      return {
        buffer: fs.readFileSync(crtPath),
        filename: `${safeName}.crt`,
        mimeType: 'application/x-x509-ca-cert',
      };
    } else if (type === 'key') {
      const keyPath = path.join(certDir, 'cert.key');
      if (!fs.existsSync(keyPath)) throw new Error('Certificate private key not found on disk');
      return {
        buffer: fs.readFileSync(keyPath),
        filename: `${safeName}.key`,
        mimeType: 'application/x-pem-file',
      };
    }

    throw new Error(`Invalid file type requested: ${type}`);
  }

  public async revokeCertificate(id: string, reason: string = 'unspecified'): Promise<StoredClientCert> {
    const certDir = path.join(CERTS_DIR, id);
    const metaPath = path.join(certDir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Certificate ${id} not found.`);
    }

    const cert: StoredClientCert = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (cert.status === 'revoked') {
      return cert;
    }

    cert.status = 'revoked';
    cert.revokedAt = new Date().toISOString();
    cert.revocationReason = reason;

    fs.writeFileSync(metaPath, JSON.stringify(cert, null, 2), 'utf8');

    this.updateOpenSslRevocation(cert, reason);
    await this.generateCrl();

    return cert;
  }

  private updateOpenSslRevocation(cert: StoredClientCert, reason: string) {
    try {
      const indexFile = path.join(CRL_DIR, 'index.txt');
      if (!fs.existsSync(indexFile)) return;

      const lines = fs.readFileSync(indexFile, 'utf8').split('\n');
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const revDateStr = `${String(now.getUTCFullYear()).slice(2)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

      const updated = lines.map((line) => {
        const parts = line.split('\t');
        if (parts.length >= 4 && parts[3].toLowerCase() === cert.serialNumber.toLowerCase()) {
          const validReason = reason || 'unspecified';
          return `R\t${parts[1]}\t${revDateStr},${validReason}\t${parts[3]}\t${parts[4] || 'unknown'}\t${parts[5] || ''}`;
        }
        return line;
      });

      fs.writeFileSync(indexFile, updated.join('\n'), 'utf8');
    } catch (e) {
      console.warn('Error updating OpenSSL revocation index:', e);
    }
  }

  public async deleteCertificate(id: string): Promise<boolean> {
    const cert = this.getCertificateById(id);
    const certDir = path.join(CERTS_DIR, id);

    if (fs.existsSync(certDir)) {
      try {
        fs.rmSync(certDir, { recursive: true, force: true });
      } catch (err: any) {
        console.warn(`Error deleting cert dir ${certDir}:`, err.message);
      }
    }

    if (cert) {
      try {
        const indexFile = path.join(CRL_DIR, 'index.txt');
        if (fs.existsSync(indexFile)) {
          const lines = fs.readFileSync(indexFile, 'utf8').split('\n');
          const updated = lines.filter((line) => {
            const parts = line.split('\t');
            if (parts.length >= 4 && parts[3].toLowerCase() === cert.serialNumber.toLowerCase()) {
              return false;
            }
            return true;
          });
          fs.writeFileSync(indexFile, updated.join('\n'), 'utf8');
        }

        const newcertsDir = path.join(CRL_DIR, 'newcerts');
        const archivePath = path.join(newcertsDir, `${cert.serialNumber.toUpperCase()}.pem`);
        if (fs.existsSync(archivePath)) {
          try {
            fs.rmSync(archivePath, { force: true });
          } catch {}
        }

        if (cert.status === 'revoked') {
          await this.generateCrl();
        }
      } catch (e) {
        console.warn('Error cleaning up OpenSSL index on certificate deletion:', e);
      }
    }

    return true;
  }

  public async generateCrl(): Promise<string> {
    if (!this.isCaActive()) {
      throw new Error('Root CA must be active to generate CRL.');
    }

    this.ensureOpenSslCnf();
    const cnfPath = path.join(CRL_DIR, 'openssl.cnf');
    const crlPath = path.join(CRL_DIR, 'crl.pem');
    const crlDays = String(appConfig.crl.validityDays);

    try {
      await execFileAsync('openssl', ['ca', '-config', cnfPath, '-gencrl', '-out', crlPath]);
    } catch (err: any) {
      console.warn('OpenSSL ca gencrl failed, attempting direct crl generation:', err?.message);
      await execFileAsync('openssl', ['ca', '-config', cnfPath, '-gencrl', '-out', crlPath, '-crldays', crlDays]);
    }

    if (fs.existsSync(crlPath)) {
      const crlPem = fs.readFileSync(crlPath, 'utf8');

      if (appConfig.crl.outputPath) {
        try {
          this.exportFileToPath(appConfig.crl.outputPath, crlPem, 0o644);
        } catch (err: any) {
          console.warn(`Warning: Failed to export CRL to CRL_OUTPUT_PATH (${appConfig.crl.outputPath}): ${err.message}`);
        }
      }

      return crlPem;
    }
    throw new Error('Failed to generate crl.pem');
  }

  public getCrlDetails(): CrlDetails {
    const crlPath = path.join(CRL_DIR, 'crl.pem');
    if (!fs.existsSync(crlPath)) {
      return {
        lastUpdated: '',
        nextUpdate: '',
        revokedCount: 0,
        rawPem: '',
      };
    }

    const rawPem = fs.readFileSync(crlPath, 'utf8');
    let revokedCount = 0;
    const indexFile = path.join(CRL_DIR, 'index.txt');
    if (fs.existsSync(indexFile)) {
      const lines = fs.readFileSync(indexFile, 'utf8').split('\n');
      revokedCount = lines.filter((l) => l.startsWith('R\t')).length;
    }

    const now = new Date();
    const next = new Date(now.getTime() + appConfig.crl.validityDays * 24 * 60 * 60 * 1000);

    return {
      lastUpdated: fs.statSync(crlPath).mtime.toISOString(),
      nextUpdate: next.toISOString(),
      revokedCount,
      rawPem,
    };
  }

  public getCrlPem(): string {
    const crlPath = path.join(CRL_DIR, 'crl.pem');
    if (!fs.existsSync(crlPath)) {
      throw new Error('CRL has not been generated yet.');
    }
    return fs.readFileSync(crlPath, 'utf8');
  }

  public getCaddyConfig(): any {
    const defaults = {
      host: '',
      port: 22,
      username: '',
      authType: 'password',
      remoteCertsDir: appConfig.caddy.remoteCertsDir,
      reloadCommand: appConfig.caddy.reloadCmd,
      autoSyncOnRevoke: true,
      lastSyncStatus: 'never',
    };

    if (!fs.existsSync(CONFIG_FILE)) {
      return defaults;
    }
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return data.caddy
        ? {
            ...defaults,
            ...data.caddy,
          }
        : defaults;
    } catch {
      return defaults;
    }
  }

  public saveCaddyConfig(config: any): void {
    let current: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        current = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      } catch {}
    }
    current.caddy = {
      ...current.caddy,
      ...config,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), { mode: 0o600 });
  }

  public getAuthSettings(): { enabled: boolean; passwordHash?: string } {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { enabled: false };
    }
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return data.auth || { enabled: false };
    } catch {
      return { enabled: false };
    }
  }

  public saveAuthSettings(settings: { enabled: boolean; passwordHash?: string }): void {
    let current: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        current = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      } catch {}
    }
    current.auth = settings;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2), { mode: 0o600 });
  }
}

export const pkiEngine = new PkiEngine();
