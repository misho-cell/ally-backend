jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../taskStore.service', () => ({ __esModule: true, wakeTaskNoLaterThan: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { wakeTaskNoLaterThan } from '../taskStore.service';
import { askStateOf, AskState, isOpenAskState, ownerAskLine } from '../askState';
import {
  askStatusSection,
  nobodyAnsweredIsUntrue,
  openAskLines,
  withAskLines,
  withoutNobodyAnswered,
} from '../askStatusSection';
import { claimExpiredAsksToTell, expireSilentAsks, expiredAsksNote } from '../askExpiry.service';
import { toAdminAskRow } from '../adminUserAsks.service';
import { markAsksSeen } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWake = wakeTaskNoLaterThan as jest.MockedFunction<typeof wakeTaskNoLaterThan>;

/** #1684 (A1): per person asked — waiting, seen, later until a day, declined, answered, expired. */
const NOW = new Date('2026-10-06T12:00:00Z');
const THURSDAY = '2026-10-08T10:00:00Z';

beforeEach(() => {
  mockQuery.mockReset();
  mockWake.mockReset();
});

describe('the state of one ask', () => {
  it('reads every state from the stamps, never from status alone', () => {
    expect(askStateOf({ status: 'sent' }, NOW)).toBe(AskState.Sent);
    expect(askStateOf({ status: 'sent', seen_at: '2026-10-05T09:00:00Z' }, NOW)).toBe(
      AskState.Seen,
    );
    expect(askStateOf({ status: 'sent', later_until: THURSDAY }, NOW)).toBe(AskState.Later);
    expect(askStateOf({ status: 'answered' }, NOW)).toBe(AskState.Answered);
    expect(askStateOf({ status: 'answered', declined_at: '2026-10-05T09:00:00Z' }, NOW)).toBe(
      AskState.Declined,
    );
    expect(askStateOf({ status: 'sent', expired_at: '2026-10-05T09:00:00Z' }, NOW)).toBe(
      AskState.Expired,
    );
    expect(askStateOf({ status: 'cancelled' }, NOW)).toBe(AskState.Cancelled);
    expect(askStateOf({ status: 'held', held_until: THURSDAY }, NOW)).toBe(AskState.Held);
  });

  it('lets a „later" that has run out fall back to waiting', () => {
    expect(
      askStateOf({ status: 'sent', later_until: '2026-10-05T09:00:00Z', seen_at: THURSDAY }, NOW),
    ).toBe(AskState.Seen);
  });

  it('counts an answer that came after the expiry as an answer', () => {
    expect(askStateOf({ status: 'answered', expired_at: '2026-10-05T09:00:00Z' }, NOW)).toBe(
      AskState.Answered,
    );
  });

  it('calls held, sent, seen and later open — and nothing else', () => {
    const open = Object.values(AskState).filter(isOpenAskState);
    expect(open.sort()).toEqual(
      [AskState.Held, AskState.Later, AskState.Seen, AskState.Sent].sort(),
    );
  });
});

describe('the owner’s line', () => {
  it('names the day a „later" holds until, in the conversation’s language', () => {
    const ask = { status: 'sent', later_until: THURSDAY };
    expect(ownerAskLine('Zurab', ask, AskState.Later, 'en')).toBe(
      'Zurab: until Thursday 8 October',
    );
    expect(ownerAskLine('ზურაბი', ask, AskState.Later, 'ka')).toContain('ხუთშაბათი');
  });

  it('ends the goal reply with one line per OPEN ask, the newest ask per person deciding', () => {
    const asks = [
      { to_user_id: 1, to_name: 'Zurab', status: 'sent', later_until: THURSDAY },
      { to_user_id: 2, to_name: 'Nino', status: 'sent', seen_at: '2026-10-06T08:00:00Z' },
      { to_user_id: 3, to_name: 'Levan', status: 'answered', declined_at: THURSDAY },
      { to_user_id: 4, to_name: 'Eka', status: 'sent' },
      { to_user_id: 4, to_name: 'Eka', status: 'answered' },
    ];
    const held = [{ to_user_id: 5, contact_name: 'Gela', reopens_at: THURSDAY }];
    expect(openAskLines(asks, held, 'en', NOW)).toEqual([
      'Zurab: until Thursday 8 October',
      'Nino: has seen it, waiting for the answer',
      'Gela: will be asked on Thursday 8 October',
    ]);
  });

  it('forbids „nobody answered" while anyone is listed, and is empty when nobody is', () => {
    const section = askStatusSection(['Nino: has seen it, waiting for the answer']);
    expect(section).toContain('- Nino: has seen it, waiting for the answer');
    expect(section).toContain('არავინ უპასუხა');
    expect(section).toContain('თვითონ დაუმატებს');
    expect(askStatusSection([])).toBe('');
  });
});

describe('two weeks of silence', () => {
  it('expires the asks past 14 days, never one whose „later" still holds, and wakes each goal once', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ task_id: 7 }, { task_id: 7 }, { task_id: 9 }],
    } as never);
    mockWake.mockResolvedValue(true);

    expect(await expireSilentAsks()).toBe(3);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("status = 'sent' AND expired_at IS NULL");
    expect(String(sql)).toContain('(later_until IS NULL OR later_until <= NOW())');
    expect(params?.[0]).toBe(14);
    expect(mockWake.mock.calls.map((c) => c[0]).sort()).toEqual([7, 9]);
  });

  it('tells the owner once: the claim stamps expiry_told_at', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Levan' }, { name: null }] } as never);

    expect(await claimExpiredAsksToTell(7)).toEqual(['Levan', 'კონტაქტი']);
    expect(String(mockQuery.mock.calls[0][0])).toContain('expiry_told_at IS NULL');
    expect(expiredAsksNote(['Levan'])).toContain('Levan');
    expect(expiredAsksNote([])).toBeNull();
  });

  it('closes the backlog quietly in the migration, so the deploy wakes nobody', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '207_an_ask_has_a_state.sql'),
      'utf8',
    );
    expect(sql).toContain('UPDATE task_asks SET expired_at = NOW(), expiry_told_at = NOW()');
  });
});

describe('seen', () => {
  it('is stamped only for the reader, only once, only while unanswered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    expect(await markAsksSeen(41, '501')).toBe(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("to_user_id = $2::int AND status = 'sent' AND seen_at IS NULL");
    expect(params).toEqual([41, '501']);
  });

  it('is called when the reader opens an ask conversation', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    expect(routes).toContain(
      "if (thread.type === 'incoming_ask') {\n        markAsksSeen(threadId, userId)",
    );
  });
});

describe('the admin page row', () => {
  it('carries the state and the day it closed', () => {
    const row = toAdminAskRow(
      {
        id: 3,
        task_id: 7,
        direction: 'sent',
        other_user_id: 12,
        other_name: 'Levan',
        status: 'answered',
        created_at: new Date('2026-10-01T09:00:00Z'),
        seen_at: new Date('2026-10-01T10:00:00Z'),
        later_until: null,
        answered_at: new Date('2026-10-02T09:00:00Z'),
        declined_at: new Date('2026-10-02T09:00:00Z'),
        expired_at: null,
      },
      NOW,
    );
    expect(row.state).toBe(AskState.Declined);
    expect(row.closed_at).toBe('2026-10-02T09:00:00.000Z');
    // A „no" closes the ask; it is not an answer (tester 41786).
    expect(row.first_answer_at).toBeNull();
  });
});

describe('the reply itself (tester 41786)', () => {
  it('drops „nobody answered" before any ask went, and keeps every other sentence', () => {
    const reply =
      'გეგმა დამტკიცდა. ჯერ არცერთს არ უპასუხია, გაგრძელებას ველოდები. ვწერ სამ ადამიანს.';
    expect(nobodyAnsweredIsUntrue([], [], NOW)).toBe(true);
    expect(withoutNobodyAnswered(reply)).toBe('გეგმა დამტკიცდა. ვწერ სამ ადამიანს.');
    expect(withoutNobodyAnswered('Nobody has answered yet. I will keep going.')).toBe(
      'I will keep going.',
    );
  });

  it('keeps the claim when every ask is closed without an answer', () => {
    const closed = [{ to_user_id: 1, to_name: 'Levan', status: 'sent', expired_at: THURSDAY }];
    expect(nobodyAnsweredIsUntrue(closed, [], NOW)).toBe(false);
    const open = [{ to_user_id: 1, to_name: 'Zurab', status: 'sent', later_until: THURSDAY }];
    expect(nobodyAnsweredIsUntrue(open, [], NOW)).toBe(true);
  });

  it('appends the lines the reply lacks, once', () => {
    const lines = ['Zurab: until Thursday 8 October', 'Nino: has seen it, waiting for the answer'];
    const once = withAskLines('Still on it.', lines);
    expect(once).toBe(`Still on it.\n\n${lines.join('\n')}`);
    expect(withAskLines(once, lines)).toBe(once);
  });

  it('is done on every goal reply, after the reply is otherwise final', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "if (effectiveFinal.trim() !== '')\n    effectiveFinal = await withGoalAskLines(effectiveFinal, threadId);",
    );
  });
});
