import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../../services/auth.service';
import { AuthPayload } from '../../types';

export interface AuthenticatedRequest extends Request {
  user: AuthPayload;
}

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization header is missing or invalid' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
  }
}

export function requireAdminRole(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * User-facing endpoints must not accept admin tokens. Without this, an admin
 * JWT left in shared client storage silently acts as the admin's own account
 * (empty contacts, wrong wallet) — the "search returns nothing after using the
 * configurator" class of bug. The reason code lets the app detect it and send
 * the person back to phone login.
 */
export function requireUserRole(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'user') {
    res.status(403).json({
      success: false,
      error: 'ეს სესია ადმინისტრატორისაა — აპლიკაციაში ტელეფონის ნომრით შედი',
      reason: 'admin_token_on_user_endpoint',
    });
    return;
  }
  next();
}
