jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => {
  const actual = jest.requireActual('../threads.service');
  return { __esModule: true, ...actual, saveThreadMessage: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadUpdated: jest.fn() }));

import { query } from '../../db/postgres/client';
import { saveThreadMessage } from '../threads.service';
import { emitThreadUpdated } from '../sse.service';
import { sweepOrphanedRuns } from '../runReaper.service';
import { isCliffhangerReply, claimsNothingFound } from '../replyGuards';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockEmit = emitThreadUpdated as jest.MockedFunction<typeof emitThreadUpdated>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sweepOrphanedRuns', () => {
  it('marks stale working threads failed and persists a system-styled error', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 11, user_id: 7, status: 'failed', status_line: 'შეფერხდა — სცადე თავიდან' },
        { id: 12, user_id: 9, status: 'failed', status_line: 'შეფერხდა — სცადე თავიდან' },
      ],
      rowCount: 2,
    } as never);

    const reaped = await sweepOrphanedRuns(4);

    expect(reaped).toBe(2);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain(`status = 'working'`);
    expect(sql).toContain(`CASE WHEN o.awaits_owner THEN 'needs_you' ELSE 'failed' END`);
    // kind='error' → the client renders a retryable system failure, not
    // assistant speech.
    expect(mockSave).toHaveBeenCalledWith(11, 7, 'assistant', expect.any(String), 'error');
    expect(mockSave).toHaveBeenCalledWith(12, 9, 'assistant', expect.any(String), 'error');
    expect(mockEmit).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({ id: 11, status: 'failed' }),
    );
  });

  it('keeps needs_you on a reaped thread whose goal waits for its owner', async () => {
    // Ticket 9 task 20 (b): the run died and says so in the error row; the
    // badge belongs to the standing question, not to the retry.
    mockQuery.mockResolvedValue({
      rows: [{ id: 9406, user_id: 501, status: 'needs_you', status_line: 'შენი პასუხი სჭირდება' }],
      rowCount: 1,
    } as never);

    await sweepOrphanedRuns(4);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain(`k.status = 'open'`);
    expect(sql).toContain('k.pending_question_at IS NOT NULL');
    expect(mockSave.mock.calls[0]?.[4]).toBe('error');
    expect(mockEmit).toHaveBeenCalledWith('501', {
      id: 9406,
      status: 'needs_you',
      status_line: 'შენი პასუხი სჭირდება',
    });
  });

  it('does nothing when no thread is stuck', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const reaped = await sweepOrphanedRuns(4);

    expect(reaped).toBe(0);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('isCliffhangerReply', () => {
  it.each([
    // Thread 5942's literal shape and the battery variants.
    ['ვიპოვე ის ვინც გჭირდება. ახლა ვნახოთ ქსელიდან ვინ გაგიხსნის კარს', true],
    ['Checking their profiles', true],
    ['ერთი წუთით, ვამოწმებ კონტაქტებს', true],
    ["I'll check the network for a warm path", true],
    // Valid endings must not trigger.
    ['გინდა, რომ გავაგზავნო მოთხოვნა?', false],
    ['ვერაფერი მოიძებნა — სცადე სხვა სიტყვით.', false],
    ['', false],
  ])('%s → %s', (text, expected) => {
    expect(isCliffhangerReply(text)).toBe(expected);
  });

  it('never flags a long real answer that merely mentions checking', () => {
    const long =
      'აი შენი პასუხი: '.repeat(30) + 'საბოლოოდ, საჭიროების შემთხვევაში კიდევ შევამოწმებ სხვებსაც';
    expect(isCliffhangerReply(long)).toBe(false);
  });
});

describe('claimsNothingFound (contradiction guard, battery case 8)', () => {
  it.each([
    // The literal failure shape: steps found 23 people, final denies it.
    ['სამწუხაროდ PR-ის სპეციალისტები ვერ ვიპოვე შენს ქსელში.', true],
    ['ვერაფერი მოიძებნა ამ სახელით.', true],
    ["I couldn't find PR-specific people in your network.", true],
    ['ასეთი კონტაქტი არ მოიძებნა.', true],
    // Valid finals must not trigger.
    ['ვიპოვე 23 ადამიანი PR-ის თეგით. აი ისინი: …', false],
    ['', false],
  ])('%s → %s', (text, expected) => {
    expect(claimsNothingFound(text)).toBe(expected);
  });

  it('does not flag a LONG answer that only says nothing MORE was found', () => {
    const long =
      'აი 15 ადამიანი შენი ქსელიდან: '.padEnd(650, 'დეტალები. ') +
      'ამათ გარდა დამატებით ვერაფერი ვიპოვე.';
    expect(claimsNothingFound(long)).toBe(false);
  });
});
