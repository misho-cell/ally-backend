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
}));

import { query } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { recordProductEvent } from '../productEvents.service';
import { setThreadStatus } from '../threadStatus.service';
import { createThread, getThreadsByIntroRequestId, saveThreadMessage } from '../threads.service';
import { resolveIntroductionRequest } from '../introduction.service';

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
};

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
    expect(mockSaveThreadMessage.mock.calls[0][3]).toContain('ვერ დავეხმარები');
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
    // The pending-only guard makes simultaneous answers race-safe.
    expect(update?.[0]).toContain("status = 'pending'");
    expect(update?.[1]).toEqual(['accepted', 'დაუკავშირდი', 5]);
    expect(mockPush).toHaveBeenCalledWith(
      '9',
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(mockEvent).toHaveBeenCalledWith('7', 'request_resolved', {
      action: 'accept',
      source: 'button',
      request_ref: REQUEST_ROW.request_ref,
    });
    // Mediator's incoming thread settles; requester's outgoing flips to
    // needs_you. Both events carry the ref so the client can keep targeting
    // /requests/:ref without a refetch.
    expect(mockSetStatus).toHaveBeenCalledWith('7', 11, 'done', {
      requestRef: REQUEST_ROW.request_ref,
    });
    expect(mockSetStatus).toHaveBeenCalledWith('9', 12, 'needs_you', {
      statusLine: 'პასუხი მოვიდა',
      requestRef: REQUEST_ROW.request_ref,
    });
  });

  it('is idempotent: repeating the already-applied answer succeeds without re-updating', async () => {
    setup({ request: { ...REQUEST_ROW, status: 'accepted' } });

    const out = await resolveIntroductionRequest('7', { requestId: 5 }, 'accept', {
      source: 'chat',
    });

    expect(out).toEqual({ ok: true, already: true, status: 'accepted' });
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
