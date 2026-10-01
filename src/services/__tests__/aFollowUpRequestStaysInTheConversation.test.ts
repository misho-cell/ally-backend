jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({
  __esModule: true,
  emitThreadCreated: jest.fn(),
  emitMessageAppended: jest.fn(),
  emitThreadUpdated: jest.fn(),
}));
jest.mock('../threadStatus.service', () => ({
  __esModule: true,
  setThreadStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createIncomingRequestThread: jest.fn().mockResolvedValue({
    id: 27194,
    title: 'Netai Test 68 → Nika',
    type: 'incoming_request',
    is_task: true,
    status: 'needs_you',
    status_line: null,
  }),
  createOutgoingRequestThread: jest.fn().mockResolvedValue({
    id: 27195,
    title: 'Netai Test 65 → Nika',
    type: 'outgoing_request',
    is_task: true,
    status: 'waiting',
    status_line: null,
  }),
  incomingRequestLine: jest
    .fn()
    .mockResolvedValue({ language: 'en', text: 'Netai Test 65 asks you to introduce Nika.' }),
  outgoingRequestLine: jest
    .fn()
    .mockResolvedValue({ language: 'en', text: 'Your request has gone to Netai Test 68.' }),
  saveServerLine: jest.fn((threadId: number, _userId: number, content: string) =>
    Promise.resolve({ id: threadId * 10, content }),
  ),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('en'),
  getThreadsByIntroRequestId: jest.fn().mockResolvedValue([]),
  createThread: jest.fn().mockResolvedValue({ id: 77 }),
}));
jest.mock('../askOptOut.service', () => ({
  __esModule: true,
  isOptedOutFromAsks: jest.fn().mockResolvedValue(false),
}));
jest.mock('../privacyRights.service', () => ({
  __esModule: true,
  isPhoneOptedOut: jest.fn().mockResolvedValue(false),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../debrief.service', () => ({
  __esModule: true,
  armIntroDebrief: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../taskEngine.service', () => ({ __esModule: true, startIntroOutcome: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { emitMessageAppended, emitThreadCreated } from '../sse.service';
import { setThreadStatus } from '../threadStatus.service';
import {
  createIncomingRequestThread,
  createOutgoingRequestThread,
  getThreadsByIntroRequestId,
  saveServerLine,
  saveThreadMessage,
} from '../threads.service';
import { requestIntroduction } from '../tools/requestIntroduction';
import {
  cancelIntroductionRequestsForTask,
  introStillAwaitedOnThread,
  resolveIntroductionRequest,
} from '../introduction.service';
import {
  buildTwoItemsSection,
  requestScopeForRun,
  shouldLoadMemory,
} from '../requestInConversation';
import { SharedRequestSide } from '../requestThreadSide';
import { buildToolsForThread } from '../chat.service';
import { runPayerFor } from '../taskAsks.service';

/**
 * ROW 305 (b) / D530 — goal 11323, the case it was decided on.
 *
 * Netai Test 65 (172836) asked Netai Test 68 (172833) about an electrician;
 * that conversation is ask thread 26997 on 68's side, and the goal lives in
 * thread 21504 on 65's. Then 65 asked 68, for the same goal, to introduce
 * Nika. Tornike: „a follow-up introduction request between the same people
 * about the same goal continues their EXISTING conversation."
 */
const REQUESTER = 172836;
const MEDIATOR = 172833;
const GOAL = 11323;
const ASK_THREAD = 26997;
const GOAL_THREAD = 21504;
const REQUEST_ID = 2146;
const REQUEST_REF = 'ref-2146';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSetStatus = setThreadStatus as jest.MockedFunction<typeof setThreadStatus>;
const mockSave = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;
const mockServerLine = saveServerLine as jest.MockedFunction<typeof saveServerLine>;
const mockThreads = getThreadsByIntroRequestId as jest.MockedFunction<
  typeof getThreadsByIntroRequestId
>;

type Rows = { rows: unknown[]; rowCount: number };
const rows = (data: unknown[]): Rows => ({ rows: data, rowCount: data.length });

interface World {
  /** The newest ask this goal sent the mediator, by status. Null = never asked. */
  readonly askStatus: 'sent' | 'answered' | 'cancelled' | null;
  /** The goal lives in a thread the requester owns. */
  readonly goalThread?: boolean;
  /** A pending request already sits in the ask thread. */
  readonly busy?: boolean;
  /** The lookup itself fails. */
  readonly lookupFails?: boolean;
}

/** The ask lookup, answered the way Postgres would for the scope it was given. */
function askRows(sql: string, params: unknown[], world: World): Rows {
  if (world.lookupFails) throw new Error('timeout');
  if (world.askStatus === null || params[0] !== GOAL) return rows([]);
  const openOnly = sql.includes("a.status IN ('sent', 'answered')");
  if (openOnly && world.askStatus === 'cancelled') return rows([]);
  return rows([{ id: ASK_THREAD, title: 'Netai Test 65: do you know an electrician?' }]);
}

let inserted: unknown[] = [];

function theWorldIs(world: World): void {
  inserted = [];
  mockQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (text.includes('FROM task_asks a')) return Promise.resolve(askRows(text, params, world));
    if (text.includes('FROM tasks k'))
      return Promise.resolve(rows(world.goalThread === false ? [] : [{ id: GOAL_THREAD }]));
    if (text.includes('WHERE mediator_thread_id = $1 AND status'))
      return Promise.resolve(rows(world.busy ? [{ id: 2001 }] : []));
    if (text.includes('INSERT INTO introduction_requests')) {
      inserted = params;
      return Promise.resolve(rows([{ id: REQUEST_ID, request_ref: REQUEST_REF }]));
    }
    if (text.includes('"UserAlias"'))
      return Promise.resolve(rows([{ phone: '+12025550142', display_name: 'Netai Test 68' }]));
    if (text.includes('FROM "UserPhone"')) return Promise.resolve(rows([{ userId: MEDIATOR }]));
    if (text.includes('COUNT(*) AS threads')) return Promise.resolve(rows([{ threads: '4' }]));
    if (text.includes('push_subscriptions')) return Promise.resolve(rows([{ id: 1 }]));
    if (text.includes('SELECT name FROM "User"'))
      return Promise.resolve(rows([{ name: 'Netai Test 65' }]));
    return Promise.resolve(rows([]));
  }) as never);
}

/** `null` is „raised outside any goal" — a default parameter would swallow `undefined`. */
async function askForAnIntroduction(taskId: number | null = GOAL): Promise<unknown> {
  return requestIntroduction(
    String(REQUESTER),
    'Netai Test 68',
    'Nika',
    'could you introduce us?',
    '+12025550142',
    undefined,
    undefined,
    'intro',
    false,
    taskId === null ? {} : { requesterTaskId: taskId, originThreadId: GOAL_THREAD },
  );
}

const pushUrl = (): unknown =>
  (sendPushNotification as jest.Mock).mock.calls[0]?.[1]?.url as unknown;

beforeEach(() => {
  jest.clearAllMocks();
  mockThreads.mockResolvedValue([]);
});

describe('a follow-up request continues the open conversation', () => {
  it('opens no thread on either side', async () => {
    theWorldIs({ askStatus: 'sent' });

    await expect(askForAnIntroduction()).resolves.toMatchObject({ success: true });

    expect(createIncomingRequestThread).not.toHaveBeenCalled();
    expect(createOutgoingRequestThread).not.toHaveBeenCalled();
    expect(emitThreadCreated).not.toHaveBeenCalled();
  });

  it('stores the two threads it continues on the request itself', async () => {
    theWorldIs({ askStatus: 'answered' });

    await askForAnIntroduction();

    // $10, $11: mediator_thread_id, requester_thread_id.
    expect(inserted[9]).toBe(ASK_THREAD);
    expect(inserted[10]).toBe(GOAL_THREAD);
  });

  it("writes the request into the mediator's ask thread and sets it to needs you", async () => {
    theWorldIs({ askStatus: 'sent' });

    await askForAnIntroduction();

    expect(mockServerLine).toHaveBeenCalledWith(
      ASK_THREAD,
      MEDIATOR,
      'Netai Test 65 asks you to introduce Nika.',
    );
    expect(emitMessageAppended).toHaveBeenCalledWith(
      String(MEDIATOR),
      ASK_THREAD,
      expect.any(String),
      expect.objectContaining({
        messageId: String(ASK_THREAD * 10),
        kind: 'request',
        ref: {},
      }),
    );
    expect(mockSetStatus).toHaveBeenCalledWith(
      String(MEDIATOR),
      ASK_THREAD,
      'needs_you',
      expect.objectContaining({ requestRef: REQUEST_REF, isTask: true }),
    );
  });

  it("tells the requester in the goal's own thread, and leaves the goal's status to the goal", async () => {
    theWorldIs({ askStatus: 'sent' });

    await askForAnIntroduction();

    expect(mockServerLine).toHaveBeenCalledWith(
      GOAL_THREAD,
      REQUESTER,
      'Your request has gone to Netai Test 68.',
    );
    expect(emitMessageAppended).toHaveBeenCalledWith(
      String(REQUESTER),
      GOAL_THREAD,
      expect.any(String),
      expect.objectContaining({ kind: 'request' }),
    );
    expect(mockSetStatus.mock.calls.some((call) => call[1] === GOAL_THREAD)).toBe(false);
  });

  it('opens the ask thread from the push, and writes no pointer lines', async () => {
    theWorldIs({ askStatus: 'sent' });

    await askForAnIntroduction();

    expect(pushUrl()).toBe(`/chat/${ASK_THREAD}`);
    // Row 305 (a)'s lines go through saveThreadMessage; there is nothing to point between.
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('every other request is exactly what it was', () => {
  const expectTodaysTwoThreads = (): void => {
    expect(createIncomingRequestThread).toHaveBeenCalledTimes(1);
    expect(createOutgoingRequestThread).toHaveBeenCalledTimes(1);
    expect(emitThreadCreated).toHaveBeenCalledTimes(2);
    expect(mockServerLine).not.toHaveBeenCalled();
    expect(inserted[9]).toBeNull();
    expect(inserted[10]).toBeNull();
    expect(pushUrl()).toBe('/chat');
  };

  it('with no earlier ask', async () => {
    theWorldIs({ askStatus: null });
    await askForAnIntroduction();
    expectTodaysTwoThreads();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('with no goal at all', async () => {
    theWorldIs({ askStatus: 'sent' });
    await askForAnIntroduction(null);
    expectTodaysTwoThreads();
  });

  it('for a different goal, even between the same two people', async () => {
    theWorldIs({ askStatus: 'sent' });
    await askForAnIntroduction(GOAL + 1);
    expectTodaysTwoThreads();
  });

  it("when the ask's conversation has ended — and (a)'s pointer lines still go in", async () => {
    theWorldIs({ askStatus: 'cancelled' });

    await askForAnIntroduction();

    expectTodaysTwoThreads();
    expect(mockSave.mock.calls.map((call) => call[0])).toEqual([27194, ASK_THREAD]);
  });

  it('when the goal has no thread of the requester to write into', async () => {
    theWorldIs({ askStatus: 'sent', goalThread: false });
    await askForAnIntroduction();
    expectTodaysTwoThreads();
  });

  it('when another request is already waiting in that conversation', async () => {
    theWorldIs({ askStatus: 'sent', busy: true });
    await askForAnIntroduction();
    expectTodaysTwoThreads();
  });

  it('when the lookup fails — two threads, never a guess', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    theWorldIs({ askStatus: 'sent', lookupFails: true });

    await expect(askForAnIntroduction()).resolves.toMatchObject({ success: true });

    expect(createIncomingRequestThread).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

/** The two threads a shared request is shown in, as getThreadsByIntroRequestId returns them. */
const SHARED_THREADS = [
  {
    id: ASK_THREAD,
    user_id: MEDIATOR,
    type: 'incoming_ask',
    shared_side: SharedRequestSide.Mediator,
  },
  {
    id: GOAL_THREAD,
    user_id: REQUESTER,
    type: 'regular',
    shared_side: SharedRequestSide.Requester,
  },
];

const PENDING_REQUEST = {
  id: REQUEST_ID,
  request_ref: REQUEST_REF,
  requester_user_id: REQUESTER,
  mediator_user_id: MEDIATOR,
  target_name: 'Nika',
  target_user_id: null,
  target_phone: null,
  message: null,
  status: 'pending',
  requester_task_id: GOAL,
  origin_thread_id: GOAL_THREAD,
};

/** The resolve path's reads, with the ask in the shared thread in the given state. */
function aSharedRequestIsAnswered(askStatus: 'sent' | 'answered'): void {
  mockThreads.mockResolvedValue(SHARED_THREADS as never);
  mockQuery.mockImplementation(((sql: string) => {
    const text = String(sql);
    if (text.includes('UPDATE introduction_requests'))
      return Promise.resolve(rows([{ target_phone: null, id: REQUEST_ID, target_name: 'Nika' }]));
    if (text.includes('FROM task_asks')) return Promise.resolve(rows([{ status: askStatus }]));
    if (text.includes('FROM introduction_requests ir'))
      return Promise.resolve(rows([PENDING_REQUEST]));
    if (text.includes('SELECT name FROM "User"'))
      return Promise.resolve(rows([{ name: 'Netai Test 68' }]));
    return Promise.resolve(rows([]));
  }) as never);
}

const decline = (): ReturnType<typeof resolveIntroductionRequest> =>
  resolveIntroductionRequest(String(MEDIATOR), { requestRef: REQUEST_REF }, 'decline', {
    response: 'I do not know Nika well enough',
    source: 'button',
  });

describe('answering the request in the shared conversation', () => {
  it('does not close the ask thread while its question is still open', async () => {
    aSharedRequestIsAnswered('sent');

    await expect(decline()).resolves.toMatchObject({ ok: true });

    const onAsk = mockSetStatus.mock.calls.filter((call) => call[1] === ASK_THREAD);
    expect(onAsk).toHaveLength(1);
    expect(onAsk[0][2]).toBe('needs_you');
  });

  it('closes it when the question was answered too', async () => {
    aSharedRequestIsAnswered('answered');

    await decline();

    expect(mockSetStatus).toHaveBeenCalledWith(
      String(MEDIATOR),
      ASK_THREAD,
      'done',
      expect.objectContaining({ requestRef: REQUEST_REF }),
    );
  });

  it("writes the outcome into the goal thread and leaves that thread's status alone", async () => {
    aSharedRequestIsAnswered('sent');

    await decline();

    const toGoal = mockSave.mock.calls.find((call) => call[0] === GOAL_THREAD);
    expect(toGoal?.[1]).toBe(REQUESTER);
    expect(toGoal?.[3]).toContain('I do not know Nika well enough');
    expect(mockSetStatus.mock.calls.some((call) => call[1] === GOAL_THREAD)).toBe(false);
  });

  it('tells the mediator, in the ask thread, what was done in their name', async () => {
    aSharedRequestIsAnswered('sent');

    await decline();

    expect(mockSave.mock.calls.some((call) => call[0] === ASK_THREAD)).toBe(true);
  });

  it('withdraws into both threads when the goal is stopped, without closing the goal thread', async () => {
    mockThreads.mockResolvedValue(SHARED_THREADS as never);
    mockQuery.mockImplementation(((sql: string) => {
      const text = String(sql);
      if (text.includes('UPDATE introduction_requests'))
        return Promise.resolve(
          rows([{ id: REQUEST_ID, mediator_user_id: MEDIATOR, target_name: 'Nika' }]),
        );
      if (text.includes('FROM task_asks')) return Promise.resolve(rows([{ status: 'sent' }]));
      return Promise.resolve(rows([]));
    }) as never);

    await expect(cancelIntroductionRequestsForTask(GOAL)).resolves.toBe(1);

    expect(mockSave.mock.calls.map((call) => call[0]).sort()).toEqual(
      [ASK_THREAD, GOAL_THREAD].sort(),
    );
    expect(mockSetStatus).toHaveBeenCalledWith(String(MEDIATOR), ASK_THREAD, 'needs_you');
    expect(mockSetStatus.mock.calls.some((call) => call[1] === GOAL_THREAD)).toBe(false);
  });
});

describe('the requester waits in the goal thread', () => {
  it('is asked of the goal thread, which carries no request id', async () => {
    mockQuery.mockResolvedValue(rows([{ id: REQUEST_ID }]) as never);

    await expect(
      introStillAwaitedOnThread({
        id: GOAL_THREAD,
        type: 'regular',
        introduction_request_id: null,
      }),
    ).resolves.toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("requester_thread_id = $1 AND status = 'pending'");
    expect(params).toEqual([GOAL_THREAD]);
  });

  it("never on the mediator's ask thread", async () => {
    await expect(
      introStillAwaitedOnThread({
        id: ASK_THREAD,
        type: 'incoming_ask',
        introduction_request_id: null,
      }),
    ).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the ref the client draws Accept / Decline from', () => {
  const actual = jest.requireActual<typeof import('../threads.service')>('../threads.service');

  it('comes from the pending request sharing the thread — and only a pending one', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await actual.getThreadsForUser(String(MEDIATOR));

    const sql = mockQuery.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain("WHERE sr.mediator_thread_id = t.id AND sr.status = 'pending'");
    expect(sql).toContain("WHEN ir.status = 'pending' THEN ir.request_ref");
    expect(sql).toContain('ELSE shared_ir.request_ref');
  });

  it('is not handed out on the goal thread, which only the requester reads', () => {
    const source = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    const joins = source.slice(source.indexOf('const THREAD_LIST_JOINS'));
    expect(joins.slice(0, 800)).not.toContain('requester_thread_id');
  });

  it("reads a waiting request's thread as needs you, whatever the ask's own row says", async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await actual.getThread(ASK_THREAD, String(MEDIATOR));

    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(
      /WHEN t\.status = 'done' AND EXISTS \(\s+SELECT 1 FROM introduction_requests wr/,
    );
    expect(sql).toContain('wr.snoozed_until IS NULL OR wr.snoozed_until <= NOW()');
  });

  it('finds both sides of a shared request, and says which is which', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await actual.getThreadsByIntroRequestId(REQUEST_ID);

    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('t.id = ir.mediator_thread_id OR t.id = ir.requester_thread_id');
    expect(params?.slice(0, 3)).toEqual([
      REQUEST_ID,
      SharedRequestSide.Mediator,
      SharedRequestSide.Requester,
    ]);
    expect(timeout).toBeGreaterThan(0);
  });
});

describe('a run in the shared conversation', () => {
  it('knows the request is here, by lookup rather than by thread type', async () => {
    mockQuery.mockResolvedValue(rows([{ id: REQUEST_ID }]) as never);

    const scope = await requestScopeForRun(String(MEDIATOR), 'incoming_ask', null, ASK_THREAD);

    expect(scope).toEqual({ requestId: REQUEST_ID, requestIsHere: true, sharedWithAsk: true });
    expect(String(mockQuery.mock.calls[0][0])).toContain("ir.status = 'pending'");
  });

  it('does not load private memory while a request is waiting in it', async () => {
    mockQuery.mockResolvedValue(rows([{ id: REQUEST_ID }]) as never);
    const waiting = await requestScopeForRun(String(MEDIATOR), 'incoming_ask', null, ASK_THREAD);

    expect(shouldLoadMemory('incoming_ask', waiting)).toBe(false);
  });

  it('loads it as any ask thread does once nothing is waiting', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    const plain = await requestScopeForRun(String(MEDIATOR), 'incoming_ask', null, ASK_THREAD);

    expect(plain.requestIsHere).toBe(false);
    expect(shouldLoadMemory('incoming_ask', plain)).toBe(true);
  });

  it("leaves a request's own thread exactly as it was", async () => {
    const own = await requestScopeForRun(String(MEDIATOR), 'incoming_request', 2001, 27194);

    expect(own).toEqual({ requestId: 2001, requestIsHere: true, sharedWithAsk: false });
    expect(shouldLoadMemory('incoming_request', own)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('holds the tools for both: the answer to the ask and the answer to the request', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const names = (await buildToolsForThread(String(MEDIATOR), 'incoming_ask')).map((t) => t.name);

    expect(names).toContain('send_answer_to_asker');
    expect(names).toContain('respond_to_introduction');
  });

  it('names the two items apart, so a bare „yes" is asked about', () => {
    const section = buildTwoItemsSection(9001, REQUEST_ID, 'Nika');

    expect(section).toContain(`ask_id=9001, request_id=${REQUEST_ID}`);
    expect(section).toContain('send_answer_to_asker');
    expect(section).toContain('respond_to_introduction');
    expect(section).toContain('„კი"');
    expect(section).toContain('Nika');
  });

  it('is built from that scope in the prompt, beside both sections', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

    expect(chat).toContain('requestScopeForRun(userId, threadType, introRequestId, threadId)');
    expect(chat).toContain('shouldLoadMemory(threadType, requestScope)');
    expect(chat).toContain('resolvePendingRequests(userId, threadType, requestScope)');
    expect(chat).toContain('!PENDING_AS_MESSAGES_OFF && !requestScope.requestIsHere');
    expect(chat).toContain('buildTwoItemsSection(incomingAsk.id, threadRequest.id');
  });

  it('is paid for by the person who asked, as every ask thread is', async () => {
    mockQuery.mockResolvedValue(rows([{ origin_user_id: REQUESTER }]) as never);

    await expect(runPayerFor(String(MEDIATOR), ASK_THREAD, 'incoming_ask')).resolves.toBe(
      String(REQUESTER),
    );
  });
});
