jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getThreadsByIntroRequestId: jest.fn().mockResolvedValue([]),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  createThread: jest.fn().mockResolvedValue({ id: 77 }),
  // The target's own language, read at the moment their thread is created
  // (20 September). Georgian here keeps every assertion below about the
  // Georgian wording true.
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../debrief.service', () => ({
  __esModule: true,
  armIntroDebrief: jest.fn().mockResolvedValue(undefined),
}));
// Row 210: reached through a dynamic import, because the engine pulls in the
// chat service, which pulls in this one.
jest.mock('../taskEngine.service', () => ({ __esModule: true, startIntroOutcome: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { armIntroDebrief } from '../debrief.service';
import { sendPushNotification } from '../notification.service';
import { recordProductEvent } from '../productEvents.service';
import { setThreadStatus } from '../threadStatus.service';
import { createThread, getThreadsByIntroRequestId, saveThreadMessage } from '../threads.service';
import { startIntroOutcome } from '../taskEngine.service';
import {
  cancelIntroductionRequestsForTask,
  resolveIntroductionRequest,
} from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;
const mockEvent = recordProductEvent as jest.MockedFunction<typeof recordProductEvent>;
const mockSetStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockThreads = getThreadsByIntroRequestId as jest.MockedFunction<
  typeof getThreadsByIntroRequestId
>;
const mockCreateThread = createThread as jest.MockedFunction<typeof createThread>;

const REQUEST_ROW = {
  id: 5,
  request_ref: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  requester_user_id: 9,
  mediator_user_id: 7,
  target_name: 'გიორგი',
  target_user_id: null,
  target_phone: null,
  message: null,
  status: 'pending',
  requester_task_id: null,
};

const mockWakeGoal = startIntroOutcome as jest.MockedFunction<typeof startIntroOutcome>;

/** The dynamic import in wakeRequestersGoal resolves a tick after the return. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

// Route mocked query calls by SQL fragment so call order never matters.
function setup(opts: {
  request?: Record<string, unknown> | null;
  updateCount?: number;
  aliasPhones?: unknown[];
  memberRows?: unknown[];
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('UPDATE introduction_requests')) {
      const count = opts.updateCount ?? 1;
      if (sql.includes('RETURNING snoozed_until')) {
        return Promise.resolve(
          rows(count > 0 ? [{ snoozed_until: '2026-08-01T00:00:00Z' }] : [], count) as never,
        );
      }
      return Promise.resolve(rows([], count) as never);
    }
    if (sql.includes('FROM "UserAlias"'))
      return Promise.resolve(rows(opts.aliasPhones ?? []) as never);
    if (sql.includes('FROM "UserPhone"'))
      return Promise.resolve(rows(opts.memberRows ?? []) as never);
    if (sql.includes('SELECT name FROM "User"'))
      return Promise.resolve(rows([{ name: 'ნინო კახიძე' }]) as never);
    return Promise.resolve(rows(opts.request ? [opts.request] : []) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockThreads.mockResolvedValue([]);
});

const mockSaveThreadMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

describe('resolveIntroductionRequest', () => {
  it("a DECLINE is written INTO the requester's thread, not just fired as a notification", async () => {
    setup({ request: REQUEST_ROW });
    mockThreads.mockResolvedValue([
      { id: 11, user_id: 7, type: 'incoming_request' },
      { id: 12, user_id: 9, type: 'outgoing_request' },
    ] as never);

    const out = await resolveIntroductionRequest(
      '7',
      { requestRef: REQUEST_ROW.request_ref },
      'decline',
      { response: 'ვერ დავეხმარები', source: 'button' },
    );

    expect(out.ok).toBe(true);
    // A push fires once and is gone; the thread is what persists — before this
    // the outgoing thread kept reading "ველოდები პასუხს" forever after a
    // decline (ticket 4 PART B miss 3).
    expect(mockSaveThreadMessage).toHaveBeenCalledWith(
      12,
      9,
      'assistant',
      expect.stringContaining('უარი'),
    );
    const requesterMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 12);
    expect(requesterMsg?.[3]).toContain('ვერ დავეხმარები');
    // Ticket 8 task 3: the RESPONDER's own thread gets a closing line too —
    // request 925's accepter got pure silence, just a status flip.
    const responderMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 11);
    expect(responderMsg?.[3]).toContain('უარი');
  });

  it('accepts a pending request: updates, notifies requester, records analytics, syncs threads', async () => {
    setup({ request: REQUEST_ROW });
    mockThreads.mockResolvedValue([
      { id: 11, user_id: 7, type: 'incoming_request' },
      { id: 12, user_id: 9, type: 'outgoing_request' },
    ] as never);

    const out = await resolveIntroductionRequest(
      '7',
      { requestRef: REQUEST_ROW.request_ref },
      'accept',
      { response: 'დაუკავშირდი', source: 'button' },
    );

    expect(out).toEqual({ ok: true, status: 'accepted' });
    const update = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('UPDATE introduction_requests'),
    );
    // The pending-only guard makes simultaneous answers race-safe. The row
    // carries WHO responded (ticket 8 task 3 — the caller, works for direct
    // requests where mediator_user_id is NULL by design).
    expect(update?.[0]).toContain("status = 'pending'");
    expect(update?.[0]).toContain('responded_by_user_id');
    // The fifth parameter is item 5's `intro_channel`, COALESCE'd so a call
    // that passes none leaves whatever is stored alone. Null here because this
    // test predates the channel and answers without one - which is the same
    // shape as every request answered before the question existed.
    expect(update?.[1]).toEqual(['accepted', 'დაუკავშირდი', 5, '7', null]);
    expect(mockPush).toHaveBeenCalledWith(
      '9',
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(mockEvent).toHaveBeenCalledWith('7', 'request_resolved', {
      action: 'accept',
      source: 'button',
      request_ref: REQUEST_ROW.request_ref,
    });
    /**
     * BOTH threads settle. Both events carry the ref so the client can keep
     * targeting /requests/:ref without a refetch.
     *
     * The requester's side read `needs_you` until 22 September, and B31 caught
     * it on thread 21454: the mediator accepted at 08:41, the outcome was
     * written correctly with the answer quoted, and the badge over it said
     * „Needs your answer". Nothing was needed from him, and it was never his
     * move — the whole thread is somebody else answering a question he asked.
     * One fact, one event, and one side of it was being closed while the other
     * stayed open.
     *
     * The caption still says what happened; only the state changes.
     */
    expect(mockSetStatus).toHaveBeenCalledWith('7', 11, 'done', {
      requestRef: REQUEST_ROW.request_ref,
    });
    expect(mockSetStatus).toHaveBeenCalledWith('9', 12, 'done', {
      statusLine: 'პასუხი მოვიდა',
      requestRef: REQUEST_ROW.request_ref,
    });
    // D49: the accept arms the REQUESTER's 3-day debrief, keyed to this request.
    expect(armIntroDebrief).toHaveBeenCalledWith('9', 5, 'გიორგი');
  });

  it('is idempotent: repeating the already-applied answer succeeds without re-updating', async () => {
    setup({ request: { ...REQUEST_ROW, status: 'accepted' } });

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', {
      source: 'chat',
    });

    expect(out).toEqual({ ok: true, already: true, status: 'accepted' });
    expect(armIntroDebrief).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the SELECT
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockEvent).not.toHaveBeenCalled();
  });

  it('refuses a CONFLICTING answer on an already-resolved request', async () => {
    setup({ request: { ...REQUEST_ROW, status: 'accepted' } });

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'decline', {
      source: 'button',
    });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('conflict');
    expect(out.status).toBe('accepted');
  });

  it('reports the conflict when a simultaneous answer wins the race', async () => {
    setup({ request: REQUEST_ROW, updateCount: 0 });

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'decline', {
      source: 'button',
    });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('conflict');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("returns not_found for a ref outside this mediator's requests", async () => {
    setup({ request: null });

    const out = await resolveIntroductionRequest(
      '7',
      { requestRef: REQUEST_ROW.request_ref },
      'accept',
      {
        source: 'button',
      },
    );

    expect(out.ok).toBe(false);
    expect(out.code).toBe('not_found');
  });

  it('snoozes a pending request, keeps it pending, marks the incoming thread waiting', async () => {
    setup({ request: REQUEST_ROW });
    mockThreads.mockResolvedValue([
      { id: 11, user_id: 7, type: 'incoming_request' },
      { id: 12, user_id: 9, type: 'outgoing_request' },
    ] as never);

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'snooze', {
      snoozeDays: 5,
      source: 'button',
    });

    expect(out.ok).toBe(true);
    expect(out.status).toBe('pending');
    expect(out.snoozedUntil).toBe('2026-08-01T00:00:00Z');
    expect(mockEvent).toHaveBeenCalledWith('7', 'request_resolved', {
      action: 'snooze',
      source: 'button',
      request_ref: REQUEST_ROW.request_ref,
      days: 5,
    });
    expect(mockSetStatus).toHaveBeenCalledWith('7', 11, 'waiting', {
      statusLine: 'გადადებულია',
      requestRef: REQUEST_ROW.request_ref,
    });
    // Snooze is the mediator's private deferral — the requester's thread is untouched.
    expect(mockSetStatus).not.toHaveBeenCalledWith('9', 12, expect.anything(), expect.anything());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('refuses to snooze an already-answered request', async () => {
    setup({ request: { ...REQUEST_ROW, status: 'declined' } });

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'snooze', {
      source: 'button',
    });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('conflict');
  });

  it('clamps snooze days into the allowed range', async () => {
    setup({ request: REQUEST_ROW });

    await resolveIntroductionRequest('7', { requestId: 5 }, 'snooze', {
      snoozeDays: 500,
      source: 'button',
    });

    const update = mockQuery.mock.calls.find((c) =>
      (c[0] as string).includes('snoozed_until = NOW()'),
    );
    expect(update?.[1]).toEqual([5, 30]);
  });
});

describe('accept outcome (tasks 16/18)', () => {
  const OUTGOING = { id: 12, user_id: 9, type: 'outgoing_request' };
  const INCOMING = { id: 11, user_id: 7, type: 'incoming_request' };

  it('a mediated accept hands the requester the contact and tells a registered target', async () => {
    setup({
      request: REQUEST_ROW,
      aliasPhones: [{ phone: '+995555000005' }],
      memberRows: [{ userId: 170750 }],
    });
    mockThreads.mockResolvedValue([INCOMING, OUTGOING] as never);

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', {
      source: 'button',
    });

    expect(out.ok).toBe(true);
    // The requester's thread carries a WAY TO TALK: the target's number.
    const requesterMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 12);
    expect(requesterMsg?.[3]).toContain('+995555000005');
    // The registered target got their own thread + push.
    expect(mockCreateThread).toHaveBeenCalledWith('170750', 'regular', expect.any(String));
    const targetMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 77);
    expect(targetMsg?.[3]).toContain('ნინო კახიძე');
    // The mediator sees what happened in their name.
    const mediatorMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 11);
    expect(mediatorMsg?.[3]).toContain('გადავეცი');
  });

  it('degrades honestly when no contact can be found — and never invents one', async () => {
    setup({ request: REQUEST_ROW, aliasPhones: [], memberRows: [] });
    mockThreads.mockResolvedValue([OUTGOING] as never);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', { source: 'button' });

    const requesterMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 12);
    expect(requesterMsg?.[3]).toContain('ვერ მოვძებნე');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a DIRECT accept reads "X agreed" and shares no contact (task 18)', async () => {
    setup({
      request: { ...REQUEST_ROW, mediator_user_id: null, target_user_id: 7 },
    });
    mockThreads.mockResolvedValue([OUTGOING] as never);

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', {
      source: 'chat',
    });

    expect(out.ok).toBe(true);
    const requesterMsg = mockSaveThreadMessage.mock.calls.find((c) => c[0] === 12);
    expect(requesterMsg?.[3]).toContain('დათანხმდა გაცნობას');
    expect(requesterMsg?.[3]).not.toContain('+995');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });
});

/**
 * Ticket 20 row 210 — the answer walks to the goal.
 *
 * Salome's introduction was agreed at 13:41:02 and her own goal thread said
 * nothing until she typed „arapheria akhali?" at 14:06:46. Her push went
 * (twice) and the request's own thread was written to a second later. What was
 * never told is the GOAL, the thread she was living in.
 */
describe('row 210 — the requester’s goal hears the answer', () => {
  it('wakes the goal the introduction was raised for, on an ACCEPT', async () => {
    setup({ request: { ...REQUEST_ROW, requester_task_id: 4830 } });

    await resolveIntroductionRequest('7', { requestRef: REQUEST_ROW.request_ref }, 'accept', {
      source: 'button',
    });
    await settled();

    expect(mockWakeGoal).toHaveBeenCalledTimes(1);
    const [taskId, event] = mockWakeGoal.mock.calls[0];
    expect(taskId).toBe(4830);
    // The text is the outcome event, in every language, naming the person.
    expect((event as Record<string, string>).ka).toContain('გიორგი');
  });

  it('wakes it on a DECLINE too — a closed route is news the goal needs', async () => {
    setup({ request: { ...REQUEST_ROW, requester_task_id: 4830 } });

    await resolveIntroductionRequest('7', { requestRef: REQUEST_ROW.request_ref }, 'decline', {
      source: 'chat',
    });
    await settled();

    expect(mockWakeGoal).toHaveBeenCalledTimes(1);
    expect((mockWakeGoal.mock.calls[0][1] as Record<string, string>).ka).toMatch(/უარი/);
  });

  it('wakes nothing when the request was not raised for a goal', async () => {
    // An introduction asked for in an ordinary chat has no goal, and an absent
    // link must read as „no goal" rather than as something to guess at.
    setup({ request: REQUEST_ROW });

    await resolveIntroductionRequest('7', { requestRef: REQUEST_ROW.request_ref }, 'accept', {
      source: 'button',
    });
    await settled();

    expect(mockWakeGoal).not.toHaveBeenCalled();
  });

  it('does not wake on a SNOOZE — nothing has been answered', async () => {
    setup({ request: { ...REQUEST_ROW, requester_task_id: 4830 } });

    await resolveIntroductionRequest('7', { requestRef: REQUEST_ROW.request_ref }, 'snooze', {
      source: 'button',
      snoozeDays: 3,
    });
    await settled();

    expect(mockWakeGoal).not.toHaveBeenCalled();
  });

  it('still accepts the introduction when the wake cannot be scheduled', async () => {
    setup({ request: { ...REQUEST_ROW, requester_task_id: 4830 } });
    mockWakeGoal.mockImplementationOnce(() => {
      throw new Error('engine unavailable');
    });

    const out = await resolveIntroductionRequest(
      '7',
      { requestRef: REQUEST_ROW.request_ref },
      'accept',
      { source: 'button' },
    );
    await settled();

    // The answer itself is recorded and visible whatever happens to the wake.
    expect(out.ok).toBe(true);
  });
});

/**
 * Row 210, reopened by the seat's 394 — and the split they proposed is not the
 * one in the data.
 *
 * They read three cases as „with an approved plan the watched chat is told,
 * without one it never is". Two of the three WERE told, in their own threads:
 * goal 7162 accepted 13:24:57 told 13:25:20 (23 s), goal 7195 accepted
 * 13:43:38 told 13:44:19 (41 s). Both had no plan.
 *
 * What the silent one actually is: a REAL person, 10:19, who typed
 * „სთხოვე ლიკას გამაცნოს ნიტა ჩხეიძე" into an ordinary chat. Request 1156,
 * `requester_task_id` NULL, so `wakeRequestersGoal` returns on its first line
 * and the outcome reached only the request's own thread. Since column 156
 * shipped there have been six requests: five from test seats, all inside a
 * goal, all told; one from a real account, with no goal, not told.
 */
describe('an introduction asked in a plain chat answers into that chat', () => {
  const NO_GOAL = { ...REQUEST_ROW, requester_task_id: null, origin_thread_id: 20131 };

  it('writes the outcome into the chat it was asked in', async () => {
    setup({ request: NO_GOAL });
    mockThreads.mockResolvedValue([{ id: 11, user_id: 7, type: 'incoming_request' }] as never);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', {
      response: 'კი, სიამოვნებით',
      channel: 'via_mediator',
    });
    await settled();

    const intoOrigin = mockSaveThreadMessage.mock.calls.filter((c) => c[0] === 20131);
    expect(intoOrigin).toHaveLength(1);
    expect(intoOrigin[0][1]).toBe(9); // the requester, not the mediator
    expect(intoOrigin[0][2]).toBe('assistant');
    expect(String(intoOrigin[0][3])).toContain('კი, სიამოვნებით');
  });

  /** A goal-backed request is told by its wake — a second copy would be noise. */
  it('stays out of the way when there IS a goal to wake', async () => {
    setup({ request: { ...NO_GOAL, requester_task_id: 7063 } });
    mockThreads.mockResolvedValue([]);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', { channel: 'direct' });
    await settled();

    expect(mockWakeGoal).toHaveBeenCalledWith(7063, expect.anything());
    expect(mockSaveThreadMessage.mock.calls.filter((c) => c[0] === 20131)).toHaveLength(0);
  });

  /** Nothing to write into: the connector has no conversation. */
  it('does nothing when the request carries no thread either', async () => {
    setup({ request: { ...NO_GOAL, origin_thread_id: null } });
    mockThreads.mockResolvedValue([]);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', { channel: 'direct' });
    await settled();

    expect(mockSaveThreadMessage).not.toHaveBeenCalled();
  });

  /**
   * When the request was raised inside its own outgoing thread, `syncRequestThreads`
   * has already written there and a second copy would be the same sentence twice.
   */
  it('does not write twice into the request’s own thread', async () => {
    setup({ request: { ...NO_GOAL, origin_thread_id: 12 } });
    mockThreads.mockResolvedValue([{ id: 12, user_id: 9, type: 'outgoing_request' }] as never);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', { channel: 'direct' });
    await settled();

    expect(mockSaveThreadMessage.mock.calls.filter((c) => c[0] === 12)).toHaveLength(1);
  });

  /** A snooze is not an answer, and the chat has nothing to hear yet. */
  it('says nothing on a snooze', async () => {
    setup({ request: NO_GOAL });
    mockThreads.mockResolvedValue([]);

    await resolveIntroductionRequest('7', { requestId: 5 }, 'snooze', {});
    await settled();

    expect(mockSaveThreadMessage.mock.calls.filter((c) => c[0] === 20131)).toHaveLength(0);
  });
});

/**
 * Row 232 (the seat's 401) — a stopped goal leaves its introduction standing.
 *
 * Goal 7262 was stopped at 14:36:16 („Nothing further will be sent"). At 14:48
 * its request 1290 was still `pending`, still in the mediator's waiting list,
 * its incoming thread still reading „Needs your answer" — and at 14:44:42 the
 * same person was asked the same thing AGAIN, with Yes/No/Later, inside a
 * brand-new goal.
 *
 * An ASK on a stopped goal has had its note in four or five seconds since
 * Ticket 6. An introduction asks a bigger favour of the same person and got
 * nothing, because nothing connected the two tables in this direction.
 */
describe('a stopped goal withdraws the introduction it asked for', () => {
  beforeEach(() => {
    mockThreads.mockResolvedValue([{ id: 31, user_id: 7, type: 'incoming_request' }] as never);
  });

  it('cancels only the PENDING ones, and tells the mediator', async () => {
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: 7, target_name: 'ნიტა' }]) as never,
    );

    const n = await cancelIntroductionRequestsForTask(7262);

    expect(n).toBe(1);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("SET status = 'cancelled'");
    expect(sql).toContain("status = 'pending'");
    expect(mockQuery.mock.calls[0][1]).toEqual([7262]);

    expect(mockSaveThreadMessage).toHaveBeenCalledTimes(1);
    const [threadId, , role, text] = mockSaveThreadMessage.mock.calls[0];
    expect(threadId).toBe(31);
    expect(role).toBe('assistant');
    expect(String(text)).toContain('ნიტა');
  });

  /**
   * Row 233's fault, not repeated: the note and the header have to agree, or
   * „no longer needed" sits under „Needs your answer" and the reader resolves
   * the contradiction themselves — the wrong way.
   */
  it('clears the header too, so the thread stops asking for an answer', async () => {
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: 7, target_name: 'ნიტა' }]) as never,
    );

    await cancelIntroductionRequestsForTask(7262);

    expect(mockSetStatus).toHaveBeenCalledWith('7', 31, 'done', expect.anything());
  });

  /** A stop must never fail because a thread could not be written to. */
  it('returns 0 rather than throwing when the update fails', async () => {
    mockQuery.mockRejectedValue(new Error('db down') as never);
    await expect(cancelIntroductionRequestsForTask(7262)).resolves.toBe(0);
  });

  it('says nothing when the goal had no request out', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    await expect(cancelIntroductionRequestsForTask(7262)).resolves.toBe(0);
    expect(mockSaveThreadMessage).not.toHaveBeenCalled();
  });

  /**
   * B31, 22 September — THE OTHER SIDE OF THE WITHDRAWAL.
   *
   * The mediator has been let off since row 232. The person who let them off
   * was left holding a chat that still said, with a smiling face, that the
   * request „has gone to Netai Test 8, they will see it next time they open
   * Netai and reply" — status „waiting", nothing after it, ever. Requests 1387
   * and 1453, cancelled at 08:38 and 08:52, still saying it at 09:25.
   *
   * The loop skipped every thread that was not the mediator's, and skipped the
   * whole row when there was no mediator at all.
   */
  it('tells the person who withdrew it, on their own thread', async () => {
    mockThreads.mockResolvedValue([
      { id: 31, user_id: 7, type: 'incoming_request' },
      { id: 32, user_id: 9, type: 'outgoing_request' },
    ] as never);
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: 7, target_name: 'ნიტა' }]) as never,
    );

    await cancelIntroductionRequestsForTask(7262);

    const written = mockSaveThreadMessage.mock.calls.map((call) => [call[0], String(call[3])]);
    const mine = written.find(([threadId]) => threadId === 32);
    expect(mine).toBeDefined();
    // It names the person and it promises nothing: no reply is coming.
    expect(String(mine?.[1])).toContain('ნიტა');
    expect(String(mine?.[1])).toContain('პასუხიც აღარ მოვა');
  });

  it('leaves that thread settled rather than waiting for a reply that cannot come', async () => {
    mockThreads.mockResolvedValue([{ id: 32, user_id: 9, type: 'outgoing_request' }] as never);
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: 7, target_name: 'ნიტა' }]) as never,
    );

    await cancelIntroductionRequestsForTask(7262);

    expect(mockSetStatus).toHaveBeenCalledWith('9', 32, 'done', expect.anything());
  });

  /**
   * A null mediator means there is no INCOMING thread to write. It never meant
   * there was nothing to do — a direct request has a requester and a thread of
   * his like any other, and the old `continue` threw both away.
   */
  it('still tells the requester when the request had no mediator', async () => {
    mockThreads.mockResolvedValue([{ id: 32, user_id: 9, type: 'outgoing_request' }] as never);
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: null, target_name: 'ნიტა' }]) as never,
    );

    await cancelIntroductionRequestsForTask(7262);

    expect(mockSaveThreadMessage).toHaveBeenCalledTimes(1);
    expect(mockSaveThreadMessage.mock.calls[0][0]).toBe(32);
  });

  /** Neither side's thread is the other's: a regular chat is left alone. */
  it('does not write into the goal’s own chat, which is told by its own path', async () => {
    mockThreads.mockResolvedValue([{ id: 40, user_id: 9, type: 'regular' }] as never);
    mockQuery.mockResolvedValue(
      rows([{ id: 90, mediator_user_id: 7, target_name: 'ნიტა' }]) as never,
    );

    await cancelIntroductionRequestsForTask(7262);

    expect(mockSaveThreadMessage).not.toHaveBeenCalled();
  });
});

/**
 * And the function has to be CALLED. Row 232 was never a missing function — it
 * was a stop path that cancelled asks and stopped there. Comments stripped:
 * the block above quotes the fix, and a plain search would go green against my
 * own note about it.
 */
describe('the stop path calls it', () => {
  it('cancels the introductions beside the asks', () => {
    const code = readFileSync(join(__dirname, '..', 'goalStop.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).toContain('await cancelIntroductionRequestsForTask(task.id)');
    expect(code).toContain('await cancelAsksForTask(task.id)');
  });
});
