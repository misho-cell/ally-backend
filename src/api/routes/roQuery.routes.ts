import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { ApiResponse } from '../../types';

// Read-only SQL window for the development assistant (ticket-6-era ops need:
// the founder's seat runs SELECTs without a DBeaver round-trip). Defense in
// depth, every layer independent:
//   1. the route only exists when BOTH env vars are set (off by default);
//   2. the key is compared in constant time;
//   3. the statement must be a single SELECT/WITH — nothing else parses past
//      the guard;
//   4. the connection itself uses the claude_readonly DB role, which the
//      database refuses writes for even if every guard above were wrong;
//   5. statement timeout and a hard row cap bound the blast radius.
// Unset RO_SQL_KEY (or DATABASE_RO_URL) on Railway and the window is gone.

const RO_STATEMENT_TIMEOUT_MS = 15_000;
const RO_MAX_SQL_CHARS = 5_000;
const RO_MAX_ROWS = 500;
const RO_RATE_LIMIT_PER_MIN = 30;

let roPool: Pool | null = null;

function getRoPool(url: string): Pool {
  if (roPool === null) {
    roPool = new Pool({
      connectionString: url,
      max: 2,
      options: `-c statement_timeout=${RO_STATEMENT_TIMEOUT_MS} -c default_transaction_read_only=on`,
    });
  }
  return roPool;
}

/** Single SELECT/WITH statement only — no semicolon chains, no DML/DDL. */
export function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim();
  if (trimmed.length === 0 || trimmed.length > RO_MAX_SQL_CHARS) return false;
  if (!/^(select|with|explain)\b/i.test(trimmed)) return false;
  // A trailing semicolon is fine; an interior one is a second statement.
  const body = trimmed.replace(/;+\s*$/, '');
  if (body.includes(';')) return false;
  return true;
}

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const roQueryRouter = Router();

roQueryRouter.use(rateLimit({ windowMs: 60_000, max: RO_RATE_LIMIT_PER_MIN }));

interface RoQueryResult {
  rows: unknown[];
  row_count: number;
  truncated: boolean;
}

roQueryRouter.post('/', async (req: Request, res: Response<ApiResponse<RoQueryResult>>) => {
  const url = process.env.DATABASE_RO_URL?.trim();
  const expectedKey = process.env.RO_SQL_KEY?.trim();
  if (!url || !expectedKey) {
    res.status(503).json({ success: false, error: 'read-only window is not configured' });
    return;
  }
  const providedKey = String(req.header('x-ro-key') ?? '');
  if (!providedKey || !keyMatches(providedKey, expectedKey)) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return;
  }
  const sql =
    typeof (req.body as { sql?: unknown })?.sql === 'string'
      ? (req.body as { sql: string }).sql
      : '';
  if (!isReadOnlySql(sql)) {
    res.status(400).json({
      success: false,
      error: 'one SELECT/WITH statement only (max 5000 chars, no semicolon chains)',
    });
    return;
  }
  try {
    const result = await getRoPool(url).query(sql);
    const rows = result.rows ?? [];
    res.status(200).json({
      success: true,
      data: {
        rows: rows.slice(0, RO_MAX_ROWS),
        row_count: rows.length,
        truncated: rows.length > RO_MAX_ROWS,
      },
    });
  } catch (err) {
    // The DB's own message is safe here: the sole caller is the development
    // assistant and the message ("permission denied", "column does not
    // exist") IS the diagnostic being asked for.
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default roQueryRouter;
