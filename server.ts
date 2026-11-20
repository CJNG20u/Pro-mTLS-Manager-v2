import './server/config.ts';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { appConfig, getPublicSystemConfig, validateStartupEnvironment } from './server/config.ts';
import { pkiEngine } from './server/pki-engine.ts';
import { caddySshService } from './server/caddy-ssh.ts';
import {
  authMiddleware,
  generateSessionToken,
  hashPassword,
  isValidSessionToken,
  revokeSessionToken,
} from './server/auth.ts';

async function startServer() {
  // Validate host OpenSSL and .env configuration before starting
  await validateStartupEnvironment();

  // Initialize Root CA automatically on first run if CA_AUTO_INIT=true
  await pkiEngine.ensureFirstRunCa();

  const app = express();
  const PORT = appConfig.port;
  const HOST = appConfig.host;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply Auth Middleware
  app.use(authMiddleware);

  // ---------------- AUTH ROUTES ----------------
  app.get('/api/auth/status', (req, res) => {
    const settings = pkiEngine.getAuthSettings();
    const token = (req.headers['x-mtls-auth-token'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
    const authenticated = !settings.enabled || isValidSessionToken(token);

    res.json({
      authEnabled: settings.enabled,
      authenticated,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const settings = pkiEngine.getAuthSettings();

    if (!settings.enabled) {
      const token = generateSessionToken();
      return res.json({ success: true, token });
    }

    if (!password || hashPassword(password) !== settings.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid dashboard password.' });
    }

    const token = generateSessionToken();
    return res.json({ success: true, token });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = (req.headers['x-mtls-auth-token'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
    if (token) {
      revokeSessionToken(token);
    }
    res.json({ success: true });
  });

  app.post('/api/auth/setup', (req, res) => {
    const { enabled, password, currentPassword } = req.body;
    const settings = pkiEngine.getAuthSettings();

    // If currently enabled, require current password
    if (settings.enabled && settings.passwordHash) {
      if (!currentPassword || hashPassword(currentPassword) !== settings.passwordHash) {
        return res.status(403).json({ success: false, error: 'Current password is incorrect.' });
      }
    }

    if (enabled) {
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
      }
      pkiEngine.saveAuthSettings({
        enabled: true,
        passwordHash: hashPassword(password),
      });
      const token = generateSessionToken();
      return res.json({ success: true, token, message: 'Password protection enabled.' });
    } else {
      pkiEngine.saveAuthSettings({
        enabled: false,
        passwordHash: undefined,
      });
      return res.json({ success: true, message: 'Password protection disabled.' });
    }
  });

  // ---------------- SYSTEM CONFIG ROUTE ----------------
  app.get('/api/system/config', (_req, res) => {
    res.json(getPublicSystemConfig());
  });

  // ---------------- ROOT CA ROUTES ----------------
  app.get('/api/ca', (_req, res) => {
    try {
      const details = pkiEngine.getCaDetails();
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ca/init', async (req, res) => {
    try {
      const { commonName, organization, organizationalUnit, country, validityDays, keySize, wipeExistingCerts } = req.body;
      if (!commonName || !organization) {
        return res.status(400).json({ error: 'Common Name and Organization are required.' });
      }
      const details = await pkiEngine.initRootCa({
        commonName,
        organization,
        organizationalUnit,
        country,
        validityDays: parseInt(validityDays, 10) || 3650,
        keySize: parseInt(keySize, 10) === 4096 ? 4096 : 2048,
        wipeExistingCerts: Boolean(wipeExistingCerts),
      });
      res.json({ success: true, ca: details });
    } catch (err: any) {
      console.error('Error initializing Root CA:', err);
      res.status(500).json({ error: err.message || 'Failed to initialize Root CA.' });
    }
  });

  app.get('/api/ca/download', (_req, res) => {
    try {
      const pem = pkiEngine.getCaCertPem();
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.setHeader('Content-Disposition', 'attachment; filename="Pro_mTLS_Root_CA.crt"');
      res.send(pem);
    } catch (err: any) {
      res.status(404).send(err.message);
    }
  });

  // ---------------- CERTIFICATE ROUTES ----------------
  app.get('/api/certs', (_req, res) => {
    try {
      const certs = pkiEngine.getAllCertificates();
      res.json(certs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/certs/issue', async (req, res) => {
    try {
      const {
        personalizedName,
        organization,
        organizationalUnit,
        validityDays,
        p12Password,
        password,
        allowedHosts,
        emailAddress,
        sanDns,
        notes,
      } = req.body;

      if (!personalizedName || !personalizedName.trim()) {
        return res.status(400).json({ error: 'Personalized name is required (e.g., alice-laptop or mobile-device-01).' });
      }

      const rawPass = p12Password !== undefined ? p12Password : password;
      const normalizedPassword = typeof rawPass === 'string' && rawPass.length > 0 ? rawPass : null;

      let parsedAllowedHosts: string[] = [...appConfig.caddy.defaultAllowedHosts];
      if (Array.isArray(allowedHosts)) {
        const cleaned = allowedHosts.map((h: unknown) => (typeof h === 'string' ? h.trim() : '')).filter(Boolean);
        if (cleaned.length > 0) {
          parsedAllowedHosts = cleaned;
        }
      } else if (typeof allowedHosts === 'string' && allowedHosts.trim().length > 0) {
        const cleaned = allowedHosts.split(',').map((h) => h.trim()).filter(Boolean);
        if (cleaned.length > 0) {
          parsedAllowedHosts = cleaned;
        }
      }

      const parsedValidity = parseInt(validityDays, 10) || 365;
      const { cert } = await pkiEngine.issueClientCert({
        personalizedName,
        organization,
        organizationalUnit,
        validityDays: parsedValidity,
        p12Password: normalizedPassword,
        allowedHosts: parsedAllowedHosts,
        emailAddress,
        sanDns: Array.isArray(sanDns) ? sanDns : undefined,
        notes,
      });

      res.json({ success: true, cert });
    } catch (err: any) {
      console.error('Error issuing client certificate:', err);
      res.status(500).json({ error: err.message || 'Failed to issue client certificate.' });
    }
  });

  app.get('/api/certs/:id/download/:type', (req, res) => {
    try {
      const { id, type } = req.params;
      if (type !== 'p12' && type !== 'crt' && type !== 'key') {
        return res.status(400).send('Invalid certificate format. Use p12, crt, or key.');
      }
      const file = pkiEngine.getCertFile(id, type as any);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.buffer);
    } catch (err: any) {
      res.status(404).send(err.message);
    }
  });

  app.post('/api/certs/:id/revoke', async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const revokedCert = await pkiEngine.revokeCertificate(id, reason);

      // Check if auto-sync to Caddy is enabled (remote SSH or local bare-metal)
      const caddyConfig = pkiEngine.getCaddyConfig();
      let syncResult = null;
      if (caddyConfig.autoSyncOnRevoke && caddyConfig.host && caddyConfig.username) {
        try {
          syncResult = await caddySshService.syncCaddy(caddyConfig);
        } catch (syncErr: any) {
          console.warn('Auto-sync to Caddy on revoke failed:', syncErr.message);
          syncResult = {
            success: false,
            message: `Auto-sync failed: ${syncErr.message}`,
          };
        }
      } else if (appConfig.caddy.autoReloadLocal && appConfig.crl.outputPath) {
        try {
          syncResult = await caddySshService.syncLocalCaddy();
        } catch (syncErr: any) {
          console.warn('Local Caddy reload on revoke failed:', syncErr.message);
          syncResult = {
            success: false,
            message: `Local reload failed: ${syncErr.message}`,
          };
        }
      }

      res.json({
        success: true,
        cert: revokedCert,
        caddySync: syncResult,
      });
    } catch (err: any) {
      console.error('Error revoking certificate:', err);
      res.status(500).json({ error: err.message || 'Failed to revoke certificate.' });
    }
  });

  app.delete('/api/certs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await pkiEngine.deleteCertificate(id);

      // Check if auto-sync to Caddy is enabled to keep CRL fresh if a revoked cert was purged
      const caddyConfig = pkiEngine.getCaddyConfig();
      let syncResult = null;
      if (caddyConfig.autoSyncOnRevoke && caddyConfig.host && caddyConfig.username) {
        try {
          syncResult = await caddySshService.syncCaddy(caddyConfig);
        } catch (syncErr: any) {
          console.warn('Auto-sync to Caddy on cert delete failed:', syncErr.message);
        }
      } else if (appConfig.caddy.autoReloadLocal && appConfig.crl.outputPath) {
        try {
          syncResult = await caddySshService.syncLocalCaddy();
        } catch (syncErr: any) {
          console.warn('Local Caddy reload on cert delete failed:', syncErr.message);
        }
      }

      res.json({
        success: true,
        message: 'Certificate and private key permanently purged from storage.',
        caddySync: syncResult,
      });
    } catch (err: any) {
      console.error('Error deleting certificate:', err);
      res.status(500).json({ error: err.message || 'Failed to delete certificate.' });
    }
  });

  // ---------------- CRL ROUTES ----------------
  app.get('/api/crl', (_req, res) => {
    try {
      const crl = pkiEngine.getCrlDetails();
      res.json(crl);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/crl/download', (_req, res) => {
    try {
      const pem = pkiEngine.getCrlPem();
      res.setHeader('Content-Type', 'application/x-pkcs7-crl');
      res.setHeader('Content-Disposition', 'attachment; filename="crl.pem"');
      res.send(pem);
    } catch (err: any) {
      res.status(404).send(err.message);
    }
  });

  // ---------------- CADDY INTEGRATION ROUTES ----------------
  app.get('/api/caddy/config', (_req, res) => {
    try {
      const config = pkiEngine.getCaddyConfig();
      // Mask sensitive fields
      const masked = {
        ...config,
        password: config.password ? '••••••••' : '',
        passphrase: config.passphrase ? '••••••••' : '',
        hasPassword: Boolean(config.password),
        hasKey: Boolean(config.privateKey),
        hasPassphrase: Boolean(config.passphrase),
        privateKey: config.privateKey ? '[CONFIGURED RSA/ED25519 KEY]' : '',
      };
      res.json(masked);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/caddy/config', (req, res) => {
    try {
      const body = req.body;
      const current = pkiEngine.getCaddyConfig();

      const toSave: any = {
        host: body.host?.trim() || '',
        port: parseInt(body.port, 10) || 22,
        username: body.username?.trim() || '',
        authType: body.authType === 'key' ? 'key' : 'password',
        remoteCertsDir: body.remoteCertsDir?.trim() || appConfig.caddy.remoteCertsDir,
        reloadCommand: body.reloadCommand?.trim() || appConfig.caddy.reloadCmd,
        autoSyncOnRevoke: Boolean(body.autoSyncOnRevoke),
      };

      // Only update password/key/passphrase if new one provided (not masked)
      if (body.password && body.password !== '••••••••') {
        toSave.password = body.password;
      } else if (current.password) {
        toSave.password = current.password;
      }

      if (body.privateKey && !body.privateKey.includes('[CONFIGURED')) {
        toSave.privateKey = body.privateKey;
      } else if (current.privateKey) {
        toSave.privateKey = current.privateKey;
      }

      if (body.passphrase && body.passphrase !== '••••••••') {
        toSave.passphrase = body.passphrase;
      } else if (body.passphrase === '') {
        toSave.passphrase = '';
      } else if (current.passphrase) {
        toSave.passphrase = current.passphrase;
      }

      pkiEngine.saveCaddyConfig(toSave);
      res.json({ success: true, message: 'Server integration settings saved.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/caddy/test', async (req, res) => {
    try {
      const body = req.body;
      const current = pkiEngine.getCaddyConfig();

      const configToTest = {
        host: body.host || current.host,
        port: parseInt(body.port, 10) || current.port || 22,
        username: body.username || current.username || 'root',
        authType: body.authType || current.authType || 'password',
        password: (body.password && body.password !== '••••••••') ? body.password : current.password,
        privateKey: (body.privateKey && !body.privateKey.includes('[CONFIGURED')) ? body.privateKey : current.privateKey,
        passphrase: (body.passphrase && body.passphrase !== '••••••••') ? body.passphrase : current.passphrase,
      };

      const result = await caddySshService.testConnection(configToTest);
      res.json(result);
    } catch (err: any) {
      res.json({ success: false, message: `SSH test error: ${err.message}` });
    }
  });

  app.post('/api/caddy/sync', async (_req, res) => {
    try {
      const config = pkiEngine.getCaddyConfig();
      if (!config.host || !config.username) {
        return res.status(400).json({
          success: false,
          message: 'Caddy server Host and Username must be configured before syncing.',
        });
      }

      const result = await caddySshService.syncCaddy(config);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Sync failed: ${err.message}`,
      });
    }
  });

  app.post('/api/caddy/sync-local', async (_req, res) => {
    try {
      const result = await caddySshService.syncLocalCaddy();
      res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Local sync failed: ${err.message}`,
      });
    }
  });

  // ---------------- VITE OR STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`Pro mTLS Manager server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
