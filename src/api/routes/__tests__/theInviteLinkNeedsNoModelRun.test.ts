jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../../services/referralCode.service', () => ({
  __esModule: true,
  getOrCreateReferralCode: jest.fn().mockResolvedValue('QDKQMNXC'),
  findUserByReferralCode: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../../db/postgres/client';
import { INVITE_LINK_NOT_READY, inviteLinkForScreen } from '../../../services/referralLink.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const routes = readFileSync(join(__dirname, '..', 'profile.routes.ts'), 'utf8');

/**
 * Row 320's other half: the founder's invite link cost three paid runs and a
 * task. The screen now asks the server for it directly.
 */
describe('GET /profile/invite-link gives the link with no model run', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns the link, the code and the sendable text when the link is ready', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    const out = await inviteLinkForScreen('501', 'ka');
    expect(out.status).toBe(200);
    if (out.status === 200) {
      expect(out.link).toMatch(/\/join\?ref=QDKQMNXC$/);
      expect(out.code).toBe('QDKQMNXC');
      expect(out.share_text).toContain(out.link);
    }
  });

  it('answers 404 with a plain reason when the link is switched off', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ enabled: false }], rowCount: 1 } as never);
    expect(await inviteLinkForScreen('501', 'ka')).toEqual({
      status: 404,
      error: INVITE_LINK_NOT_READY,
    });
  });

  /** Row 320, the seat's 870: the share text was Georgian for an English user. */
  it("writes the share text in the person's language", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    const out = await inviteLinkForScreen('501', 'en');
    expect(out.status).toBe(200);
    if (out.status === 200) {
      expect(out.share_text).toMatch(/^I use Netai/);
      expect(out.share_text).not.toMatch(/[ა-ჰ]/);
    }
  });

  it('reads the language from the app when it says', () => {
    expect(routes).toContain("asRunLanguage(req.get('X-Locale'))");
  });

  it('is behind auth, the user role and a rate limit, and starts no run', () => {
    const at = routes.indexOf("'/invite-link'");
    const block = routes.slice(at, routes.indexOf('profileRouter.', at + 1));
    expect(at).toBeGreaterThan(0);
    expect(block).toContain('authenticateJwt');
    expect(block).toContain('requireUserRole');
    expect(block).toContain('rateLimit(');
    expect(block).not.toMatch(/processChat|createTask|wakeTask/);
  });
});
