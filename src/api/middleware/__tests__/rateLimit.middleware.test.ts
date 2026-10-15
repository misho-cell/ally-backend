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

describe('rateLimit: each limiter has its own budget (4927, 4928)', () => {
  it('two limiters with the same window and cap do not share one count', () => {
    const routes = rateLimit({ windowMs: 60_000, max: 2 });
    const chainPosition = rateLimit({ windowMs: 60_000, max: 2 });
    const user = { headers: {}, ip: '10.0.0.7', user: { userId: '4927' } } as unknown as Request;

    expect(hit(chainPosition, user, 3)).toBe(2);
    expect(hit(routes, user, 2)).toBe(2);
  });

  it('one limiter used on several routes still counts them together', () => {
    const shared = rateLimit({ windowMs: 60_000, max: 2 });
    const user = { headers: {}, ip: '10.0.0.8', user: { userId: '4928' } } as unknown as Request;

    expect(hit(shared, user, 1)).toBe(1);
    expect(hit(shared, user, 2)).toBe(1);
  });
});

/** The 21 Oct launch (60292; Misho, 15 Oct): a room on one Wi-Fi signs up together. */
describe('rateLimit keyBy: person', () => {
  const PERSON: RateLimitOptions = { windowMs: 60_000, max: 2, keyBy: 'person' };
  const withPhone = (phone: string, headers: Record<string, string> = {}): Request =>
    ({ headers, ip: '10.0.0.9', body: { phone } }) as unknown as Request;

  it('counts each phone on one address on its own', () => {
    const mw = rateLimit(PERSON);
    expect(hit(mw, withPhone('+995 555 00 00 01'), 3)).toBe(2);
    expect(hit(mw, withPhone('+995 555 00 00 02'), 2)).toBe(2);
  });

  it('reads one phone however it is spaced', () => {
    const mw = rateLimit(PERSON);
    expect(hit(mw, withPhone('+995 555 00 00 03'), 2)).toBe(2);
    expect(hit(mw, withPhone('995555000003'), 1)).toBe(0);
  });

  it('prefers the device id, then falls back to the address with neither', () => {
    const mw = rateLimit(PERSON);
    expect(hit(mw, withPhone('+995 555 00 00 04', { 'x-device-id': 'dev-P' }), 2)).toBe(2);
    expect(hit(mw, withPhone('+995 555 00 00 05', { 'x-device-id': 'dev-P' }), 1)).toBe(0);
    expect(hit(mw, makeReq({}, '10.0.0.7'), 3)).toBe(2);
  });
});

describe('rateLimit keyBy: ip', () => {
  it('counts the address even for a signed-in user', () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2, keyBy: 'ip' });
    const req = { headers: {}, ip: '10.0.0.8', user: { userId: '7' } } as unknown as Request;
    expect(hit(mw, req, 3)).toBe(2);
  });
});
