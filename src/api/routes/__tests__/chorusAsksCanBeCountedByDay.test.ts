jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { askedSinceFrom } from '../admin.routes';

/**
 * Row 301, the tester's 948: after the restart GET /admin/chorus/asks showed
 * 100 of 125 rows, all from 11 September — today's sends could not be counted.
 */
describe('chorus asks can be counted from a given time', () => {
  it('reads an ISO date, and tells an absent value from a wrong one', () => {
    expect(askedSinceFrom('2026-10-01')).toBe('2026-10-01T00:00:00.000Z');
    expect(askedSinceFrom(undefined)).toBeNull();
    expect(askedSinceFrom('yesterday-ish')).toBeUndefined();
  });

  it('filters on the time the ask went out', () => {
    const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
    expect(routes).toContain('AND ($4::timestamptz IS NULL OR p.asked_at >= $4::timestamptz)');
  });
});

/** D544, the tester's 954: each ask says whether its inviter's tie is confirmed. */
describe('each chorus ask says whether its tie was confirmed', () => {
  it('uses the same test as every send', () => {
    const routes = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
    expect(routes).toContain(
      "${confirmedWarmTieSql('p.inviter_user_id', 'c.target_phone')} AS confirmed_tie",
    );
  });
});
