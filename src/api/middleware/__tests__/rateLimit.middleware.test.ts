import { Request, Response } from 'express';
import { rateLimit, RateLimitOptions } from '../rateLimit.middleware';

interface FakeRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (c: number) => FakeRes;
  json: (b: unknown) => FakeRes;
  setHeader: (k: string, v: string) => void;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  return res;
}

function makeReq(headers: Record<string, string> = {}, ip = '10.0.0.1'): Request {
  return { headers, ip } as unknown as Request;
}

// Run the limiter N times for a request; return how many calls passed (next ran).
function hit(mw: ReturnType<typeof rateLimit>, req: Request, n: number): number {
  let passed = 0;
  for (let i = 0; i < n; i++) {
    const res = makeRes();
    let nexted = false;
    mw(req, res as unknown as Response, () => {
      nexted = true;
    });
    if (nexted) passed += 1;
  }
  return passed;
}

const OPTS: RateLimitOptions = { windowMs: 60_000, max: 2, keyBy: 'device' };

describe('rateLimit keyBy: device', () => {
  it('counts per X-Device-Id — one device is capped, another is unaffected', () => {
    const mw = rateLimit(OPTS);
    const deviceA = makeReq({ 'x-device-id': 'dev-A' });
    const deviceB = makeReq({ 'x-device-id': 'dev-B' });

    // Same device: 2 pass, the 3rd is blocked.
    expect(hit(mw, deviceA, 3)).toBe(2);
    // A different device shares nothing — its own 2 still pass.
    expect(hit(mw, deviceB, 2)).toBe(2);
  });

  it('blocks with 429 + Retry-After once the device limit is exceeded', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1, keyBy: 'device' });
    const req = makeReq({ 'x-device-id': 'dev-C' });

    hit(mw, req, 1); // consume the single allowance
    const res = makeRes();
    mw(req, res as unknown as Response, () => undefined);

    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('falls back to IP when no device id is present', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2, keyBy: 'device' });
    const sameIp = makeReq({}, '203.0.113.9');

    // No device header → keyed by IP, so the same IP is still capped.
    expect(hit(mw, sameIp, 3)).toBe(2);
  });
});
