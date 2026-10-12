import { NextFunction, Request, Response } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { verifyToken } from '../../services/auth.service';
import { AuthPayload } from '../../types';

export interface AuthenticatedRequest extends Request {
  user: AuthPayload;
}

/**
 * 4656 (Tornike, 12 Oct): the app on his computer asks for the phone login every
 * time it opens. The app wipes its token on any 401, and the server logged no
 * 401 at all, so nobody could say which call refused him or why (FOR_FRONTEND,
 * 11 Oct 14:10Z). Every refusal now leaves one line: the reason, the method and
 * the route without its query. Never the token, never anything decoded from it.
 */
export enum RefusedTokenReason {
  MissingHeader = 'missing_header',
  Expired = 'expired',
  Invalid = 'invalid',
}

/** Why the token was refused, from the error verifyToken threw. */
export function refusedTokenReason(err: unknown): RefusedTokenReason {
  return err instanceof TokenExpiredError ? RefusedTokenReason.Expired : RefusedTokenReason.Invalid;
}

/** The one log line for a refused token; the expiry time only when it expired. */
export function refusedTokenLine(req: Request, reason: RefusedTokenReason, err?: unknown): string {
  const route = `${req.method} ${req.baseUrl}${req.path}`;
  const expiredAt =
    err instanceof TokenExpiredError ? ` expired_at=${err.expiredAt.toISOString()}` : '';
  return `[auth] 401 ${reason} ${route}${expiredAt}`;
}

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // eslint-disable-next-line no-console
    console.warn(refusedTokenLine(req, RefusedTokenReason.MissingHeader));
    res.status(401).json({ success: false, error: 'Authorization header is missing or invalid' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(refusedTokenLine(req, refusedTokenReason(err), err));
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
