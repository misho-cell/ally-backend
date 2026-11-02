const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PACE_UNTIL_SEEN_ON,
  previousAskUnseen,
  previousAskUnseenNote,
  questionHeldOnThread,
} from '../paceUntilSeen';
import { HELD_LINE } from '../instructionUnsent';

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

  it('names the person and says the question goes once they have read the last', () => {
    const note = previousAskUnseenNote('ნიკა');
    expect(note).toContain('ნიკა');
    expect(note).toContain('თავისით გაიგზავნება, როგორც კი წინას ნახავს');
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

/** #7659 (tester 77420, 0/2): the held question was refused and never went after seen. */
describe('a held question goes once the earlier one is seen', () => {
  it('is kept when held, and sent from markAsksSeen through createAsk', () => {
    const held = asks.slice(asks.indexOf("reason: 'previous_ask_unseen',") - 900);
    expect(held.slice(0, 1000)).toContain(
      'await keepHeldAsk(taskId, fromUserId, toUserId, contactPhone, trimmed)',
    );
    const seen = asks.slice(asks.indexOf('export async function markAsksSeen('));
    expect(seen.slice(0, 700)).toContain('if (seen > 0) void sendHeldAsks(readerUserId);');
    const send = asks.slice(asks.indexOf('export async function sendHeldAsks('));
    expect(send.slice(0, 900)).toContain('await createAsk(');
    expect(send.slice(0, 900)).toContain('await claimHeldAsks(readerUserId)');
  });
});

/** #8518 (the tester's 80752 item 4, case 94): a held question is not a failure. */
describe('a question held for an unseen message', () => {
  it('is found on the conversation while it waits, kept in the last minutes', async () => {
    mockQuery.mockResolvedValue({ rows: [{ held: true }] });
    expect(await questionHeldOnThread(76)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('k.thread_id = $1 AND h.released_at IS NULL');
    expect(params).toEqual([76, expect.any(Number)]);
  });

  it('reads as not held when the lookup fails', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await questionHeldOnThread(76)).toBe(false);
  });

  it('is told to the owner as waiting, never as our mistake', () => {
    for (const line of Object.values(HELD_LINE)) {
      expect(line).not.toMatch(/შეცდომ|mistake|fault|ошибк|fallo/iu);
    }
    expect(HELD_LINE.ka).toContain('თავისით გაიგზავნება');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('async function serverSendsOrSaysSo('));
    expect(fn.indexOf('questionHeldOnThread(threadId)')).toBeGreaterThan(-1);
    expect(fn.indexOf('questionHeldOnThread(threadId)')).toBeLessThan(
      fn.lastIndexOf('NOT_SENT_LINE[language]'),
    );
  });
});
