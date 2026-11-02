const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { isOwnersFirstLine } from '../firstOwnerLine';

beforeEach(() => jest.resetAllMocks());

/**
 * #8519 (the tester's 80752 item 5, case 48): a new member's first „გამარჯობა"
 * got a fixed greeting from the small-talk shortcut, with no look at their
 * network and no first question.
 */
describe('a new member’s first hello', () => {
  it('is the first line when nothing, or only this line, was typed before', async () => {
    mockQuery.mockResolvedValue({ rows: [{ n: '1' }] });
    expect(await isOwnersFirstLine('42')).toBe(true);
    mockQuery.mockResolvedValue({ rows: [{ n: '0' }] });
    expect(await isOwnersFirstLine('42')).toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("user_id = $1::int AND role = 'user'");
    expect(params).toEqual(['42', 2]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is not the first line once the member has typed before', async () => {
    mockQuery.mockResolvedValue({ rows: [{ n: '2' }] });
    expect(await isOwnersFirstLine('42')).toBe(false);
  });

  it('keeps the shortcut when the lookup fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await isOwnersFirstLine('42')).toBe(false);
  });

  it('turns the shortcut off for that run in all three places', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('if (smallTalkLine && (await isOwnersFirstLine(userId))) {');
    expect(chat).toContain(
      'const listedSmallTalk = smallTalkLine && !runIsOwnersFirstLine.has(runId);',
    );
    expect(chat).toContain('!runIsOwnersFirstLine.has(runId) &&\n    isToolFreeSmallTalk(');
    expect(chat).toContain(
      '!ownerAbsent && !runIsOwnersFirstLine.has(runId) && isToolFreeSmallTalk(userMessage)',
    );
    expect(chat).toContain('runIsOwnersFirstLine.delete(runId);');
    // #8519 RETEST: the server's own greeting answered first, before any of these.
    expect(chat).toContain(
      'if (!ownerAbsent && isBareGreeting(userMessage) && !(await isOwnersFirstLine(userId))) {',
    );
  });
});
