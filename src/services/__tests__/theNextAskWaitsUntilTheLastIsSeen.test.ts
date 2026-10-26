const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { PACE_UNTIL_SEEN_ON, previousAskUnseen, previousAskUnseenNote } from '../paceUntilSeen';

const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

beforeEach(() => jest.resetAllMocks());

/** #7659: no new message to a person until they have seen the previous one. */
describe('the next ask waits until the last one is seen', () => {
  it('finds an unopened ask from the same asker to the same person', async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: true }] });
    expect(await previousAskUnseen('7', 42)).toBe(true);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain("status = 'sent' AND seen_at IS NULL");
    expect(sql).toContain('from_user_id = $1::int AND to_user_id = $2::int');
    expect(params).toEqual(['7', 42, expect.any(Number)]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('lets the ask go once the last one is seen or answered', async () => {
    mockQuery.mockResolvedValue({ rows: [{ found: false }] });
    expect(await previousAskUnseen('7', 42)).toBe(false);
  });

  it('names the person and keeps the question for the next message', () => {
    const note = previousAskUnseenNote('ნიკა');
    expect(note).toContain('ნიკა');
    expect(note).toContain('შემდეგ შეტყობინებაში');
  });

  it("is on (Misho, 26 Oct), never holds a relay or the card, and holds the owner's line too", () => {
    expect(PACE_UNTIL_SEEN_ON).toBe(true);
    const gate = asks.slice(asks.indexOf('PACE_UNTIL_SEEN_ON &&'));
    const head = gate.slice(0, 400);
    for (const exempt of ['parentAskId === undefined', 'card === undefined']) {
      expect(head).toContain(exempt);
    }
    // #7659 retest 6/10: the server's send of the owner's line was let through.
    expect(head).not.toContain('fromOwnersLine !== true');
    expect(head).not.toContain('!ownerAddedSomething');
    expect(gate.slice(0, 800)).toContain("reason: 'previous_ask_unseen'");
  });
});
