import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { pkiEngine } from './pki-engine.ts';
import { appConfig } from './config.ts';

// In-memory active session tokens mapped to creation time
const activeTokens = new Set<string>();

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`${appConfig.authSalt}_${password}`).digest('hex');
}

export function generateSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.add(token);
  return token;
}

export function isValidSessionToken(token: string): boolean {
  if (!token) return false;
  return activeTokens.has(token);
}

export function revokeSessionToken(token: string): void {
  activeTokens.delete(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Allow static assets, favicon, index
  if (
    !req.path.startsWith('/api') ||
    req.path === '/api/auth/status' ||
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/setup'
  ) {
    return next();
  }

  const authSettings = pkiEngine.getAuthSettings();
  if (!authSettings.enabled) {
    // Auth is disabled
    return next();
  }

  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-mtls-auth-token'] as string;
  let token = customHeader;

  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Also support token in query param for file downloads (like .p12, .crt download links)
  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (token && isValidSessionToken(token)) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Dashboard access is protected. Please provide a valid session token.',
  });
}
