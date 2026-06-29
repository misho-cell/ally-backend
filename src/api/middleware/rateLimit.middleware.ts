import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window counters. Keyed by user when authenticated, else by IP.
const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanup.unref();

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}

function keyFor(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  if (user?.userId) return `u:${user.userId}`;
  return `ip:${clientIp(req)}`;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Fixed-window rate limiter. Place AFTER authenticateJwt to key by user;
 * on unauthenticated routes it keys by client IP.
 */
export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${options.windowMs}:${options.max}:${keyFor(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: 'ძალიან ბევრი მოთხოვნა. გთხოვთ, სცადოთ მოგვიანებით.',
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}
