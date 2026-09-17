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
        // was_asked: the owner typed here, so a reply of theirs is genuinely
        // owed and „it could not be finished" is a true sentence (row 33).
        {
          id: 11,
          user_id: 7,
          status: 'failed',
          status_line: 'შეფერხდა — სცადე თავიდან',
          was_asked: true,
        },
        {
          id: 12,
          user_id: 9,
          status: 'failed',
          status_line: 'შეფერხდა — სცადე თავიდან',
          was_asked: true,
        },
      ],
      rowCount: 2,
    } as never);

    const reaped = await sweepOrphanedRuns();

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
      rows: [
        {
          id: 9406,
          user_id: 501,
          status: 'needs_you',
          status_line: 'შენი პასუხი სჭირდება',
          was_asked: true,
        },
      ],
      rowCount: 1,
    } as never);

    await sweepOrphanedRuns();

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

    const reaped = await sweepOrphanedRuns();

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

/**
 * Ticket 20 row 114 — a deploy swallowed somebody's line and said nothing.
 *
 * 16 September, thread 15610: a message at 09:10:27, steps at 09:10:31, two web
 * searches by 09:10:41, then 63a401f went live at 09:11:19 and took the process
 * with it. No answer, no error. The chat sat on „working" with a starting line
 * on screen until the person gave up and typed it again at 09:14:28.
 *
 * The reaper existed and would have caught it — in about five minutes. It asked
 * an AGE: how long has this thread been working? An age has to sit above the
 * longest run a person may legitimately wait through, so it can never answer
 * quickly. And nothing a live run did reached the DATABASE between its steps, so
 * an age was the only thing there was to ask.
 *
 * Now a live run touches its thread on every heartbeat and the question is a
 * SILENCE. That is a different question, and it is the right one: it does not
 * care how long the run was meant to take, and it holds whether one process is
 * running or five.
 */
describe('the reaper asks about silence, not about age', () => {
  it('reaps on how long the thread has been QUIET, in seconds', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await sweepOrphanedRuns();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("seconds')::interval");
    // Not minutes, and not the run's age: the old rule is gone rather than
    // left as an unreachable OR branch beside the new one.
    expect(sql).not.toContain("minutes')::interval");
    expect(params[2]).toBe(75);
  });

  it('takes no age argument at all — one rule, not two', () => {
    expect(sweepOrphanedRuns).toHaveLength(0);
  });
});
