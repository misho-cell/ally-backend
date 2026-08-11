jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  createThread: jest.fn().mockResolvedValue({
    id: 55,
    type: 'incoming_ask',
    title: 'x',
    is_task: true,
    status: 'needs_you',
    status_line: 'პასუხს ელოდება',
  }),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitThreadCreated: jest.fn() }));
jest.mock('../askOptOut.service', () => ({
  __esModule: true,
  isOptedOutFromAsks: jest.fn().mockResolvedValue(false),
}));
jest.mock('../taskStore.service', () => ({ __esModule: true, getTaskById: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { getTaskById } from '../taskStore.service';
import { isOptedOutFromAsks } from '../askOptOut.service';
import { createThread, saveThreadMessage } from '../threads.service';
import {
  createAsk,
  createRelayAsk,
  recordAskAnswer,
  cancelAsksForTask,
  buildAnswerWakeEvent,
} from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetTask = getTaskById as jest.MockedFunction<typeof getTaskById>;
const mockOptedOut = isOptedOutFromAsks as jest.MockedFunction<typeof isOptedOutFromAsks>;
const mockCreateThread = createThread as jest.MockedFunction<typeof createThread>;
const mockSaveMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOptedOut.mockResolvedValue(false);
  // Default: an open task owned by the caller WITH the blanket permission —
  // the P0 gate lets these through; individual tests flip the fields.
  mockGetTask.mockResolvedValue({
    id: 3,
    user_id: 42,
    status: 'open',
    permission_granted: true,
  } as never);
});

function routeAskQueries(opts: {
  member?: { userId: number; name: string } | null;
  dup?: boolean;
  sentToday?: number;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserPhone"'))
      return Promise.resolve(rows(opts.member ? [opts.member] : []) as never);
    if (sql.includes('SELECT id FROM task_asks'))
      return Promise.resolve(rows(opts.dup ? [{ id: 1 }] : []) as never);
    if (sql.includes('COUNT(*)'))
      return Promise.resolve(rows([{ count: String(opts.sentToday ?? 0) }]) as never);
    if (sql.includes('SELECT name FROM "User"'))
      return Promise.resolve(rows([{ name: 'მიშო' }]) as never);
    if (sql.includes('INSERT INTO task_asks')) return Promise.resolve(rows([{ id: 9 }]) as never);
    return Promise.resolve(rows([]) as never);
  });
}

describe('createAsk', () => {
  it('REFUSES without granted permission — the server-side P0 gate (thread 7723)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockGetTask.mockResolvedValue({
      id: 3,
      user_id: 42,
      status: 'open',
      permission_granted: false,
    } as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('grant_task_permission');
    // Nothing left the building: no thread, no message, no push.
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a relay (parentAskId set) bypasses the sender-permission gate by design', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });
    mockGetTask.mockResolvedValue(null as never);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა', 11);

    expect(out.sent).toBe(true);
  });

  it('sends: ask row + recipient thread + opening message', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    const out = await createAsk('42', 3, '+995599111222', 'BMW-ს კარგი ხელოსანი ხომ არ იცი?');

    expect(out).toEqual({ sent: true, ask_id: 9, to_name: 'გია' });
    // The title carries the question itself, not a generic "კითხვა" — eight
    // asks from one sender must be tellable apart (ticket 3 §6.11).
    expect(mockCreateThread).toHaveBeenCalledWith(
      '7',
      'incoming_ask',
      'მიშო: BMW-ს კარგი ხელოსანი ხომ არ იცი?',
      undefined,
      {
        isTask: true,
        status: 'needs_you',
        statusLine: 'პასუხს ელოდება',
      },
    );
    // Plain text on the recipient's phone — no markdown asterisks (§6.3).
    const opening = mockSaveMessage.mock.calls[0][3] as string;
    expect(opening).not.toContain('**');
    expect(opening).toContain('მიშო-ის ასისტენტი გეკითხება');
  });

  it('refuses a non-member recipient', async () => {
    routeAskQueries({ member: null });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('never asks the same person twice on one task', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, dup: true });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('უკვე');
  });

  it('enforces the daily anti-runaway ceiling', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' }, sentToday: 20 });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('ლიმიტი');
  });

  it('REFUSES a person who asked not to be contacted — any sender, any task (ticket 4 item 00)', async () => {
    routeAskQueries({ member: { userId: 7, name: 'ლიკა' } });
    mockOptedOut.mockResolvedValue(true);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('აღარ მიეღო');
    // The asker hears the truth, not a technical excuse.
    expect((out as { error: string }).error).toContain('ტექნიკური შეფერხება');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a RELAY cannot route around the opt-out either — it is still a message on their phone', async () => {
    routeAskQueries({ member: { userId: 7, name: 'ლიკა' } });
    mockOptedOut.mockResolvedValue(true);

    const out = await createAsk('42', 3, '+995599111222', 'კითხვა', 11);

    expect(out.sent).toBe(false);
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('strips a greeting from the thread TITLE while the message keeps the sender wording', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    await createAsk('42', 3, '+995599111222', 'გამარჯობა ლიკა! გყავს კარგი სტომატოლოგი თბილისში?');

    // Every ask opened "გამარჯობა ლიკა!", so every row in her list read the
    // same (ticket 4 item 3).
    expect(mockCreateThread).toHaveBeenCalledWith(
      '7',
      'incoming_ask',
      'მიშო: გყავს კარგი სტომატოლოგი თბილისში?',
      undefined,
      expect.anything(),
    );
    // …but the question itself is delivered exactly as written.
    expect(mockSaveMessage.mock.calls[0][3]).toContain('გამარჯობა ლიკა!');
  });

  it('refuses asking yourself', async () => {
    routeAskQueries({ member: { userId: 42, name: 'მიშო' } });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
  });
});

describe('createRelayAsk', () => {
  const parentRow = {
    id: 11,
    task_id: 3,
    to_user_id: 42,
    question: 'BMW-ს ხელოსანი?',
    parent_ask_id: null,
  };

  function routeRelayQueries(opts: {
    parent?: typeof parentRow | null;
    aliasMatches?: { digits: string }[];
    member?: { userId: number; name: string } | null;
  }): void {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('parent_ask_id FROM task_asks'))
        return Promise.resolve(rows(opts.parent ? [opts.parent] : []) as never);
      if (sql.includes('FROM "UserAlias" ua WHERE'))
        return Promise.resolve(rows(opts.aliasMatches ?? []) as never);
      if (sql.includes('FROM "UserPhone"'))
        return Promise.resolve(rows(opts.member ? [opts.member] : []) as never);
      if (sql.includes('SELECT id FROM task_asks')) return Promise.resolve(rows([]) as never);
      if (sql.includes('COUNT(*)')) return Promise.resolve(rows([{ count: '0' }]) as never);
      if (sql.includes('SELECT name FROM "User"'))
        return Promise.resolve(rows([{ name: 'ლიკა' }]) as never);
      if (sql.includes('INSERT INTO task_asks'))
        return Promise.resolve(rows([{ id: 12 }]) as never);
      return Promise.resolve(rows([]) as never);
    });
  }

  it('resolves a NAME to the one matching contact server-side and relays', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }],
      member: { userId: 8, name: 'სალომე' },
    });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე');

    expect(out).toEqual({ sent: true, ask_id: 12, to_name: 'სალომე' });
  });

  it('an ambiguous name asks for the full name — never a candidate list, never counts', async () => {
    routeRelayQueries({
      parent: parentRow,
      aliasMatches: [{ digits: '995599333444' }, { digits: '995599555666' }],
    });

    const out = await createRelayAsk('42', 11, 'სალომე');

    expect(out.sent).toBe(false);
    const error = (out as { error: string }).error;
    expect(error).toContain('რამდენიმე კონტაქტი ემთხვევა');
    expect(error).toContain('კანდიდატები ნუ ჩამოთვლი');
    expect(error).toContain('უკვე გადაეცა');
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it('a no-match name gives the model an OUT when the user never asked to forward (blocker 2)', async () => {
    routeRelayQueries({ parent: parentRow, aliasMatches: [] });

    const out = await createRelayAsk('42', 11, 'თვითონ');

    expect(out.sent).toBe(false);
    const error = (out as { error: string }).error;
    expect(error).toContain('ვერ მოიძებნა');
    // The answer itself already reached the asker — the recipient must never
    // be told it failed, and must never be asked to spell her own phonebook
    // (ticket 4 items 0A/0AA/0C.1b).
    expect(error).toContain('უკვე მივიდა');
    expect(error).toContain('ორთოგრაფია არ ჰკითხო');
    // Resolution errors carry their own instructions — the neutral-close
    // suffix ("ამის გადაცემა ვერ მოხერხდა") must NOT ride on them: it made a
    // never-requested relay read as a malfunction.
    expect(error).not.toContain('ამის გადაცემა ამ ეტაპზე ვერ მოხერხდა');
  });

  it('every refusal carries the neutral-close rule (no "system error", no direct contact)', async () => {
    routeRelayQueries({ parent: { ...parentRow, parent_ask_id: 5 } });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('ჯაჭვი');
    expect((out as { error: string }).error).toContain('სისტემური შეცდომა');
    expect((out as { error: string }).error).toContain('არასოდეს ურჩიო');
    // Even a genuine relay failure must state that the ANSWER got through.
    expect((out as { error: string }).error).toContain('უკვე გადაეცა');
  });

  it('only the ask RECIPIENT can relay it', async () => {
    routeRelayQueries({ parent: { ...parentRow, to_user_id: 99 } });

    const out = await createRelayAsk('42', 11, 'სალომე ბერიძე');

    expect(out.sent).toBe(false);
    expect((out as { error: string }).error).toContain('Ask not found.');
  });

  it('a dictated phone number skips the name lookup and goes straight through', async () => {
    routeRelayQueries({ parent: parentRow, member: { userId: 8, name: 'სალომე' } });

    const out = await createRelayAsk('42', 11, '+995 599 333 444');

    expect(out.sent).toBe(true);
    const aliasLookups = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('FROM "UserAlias"'),
    );
    expect(aliasLookups).toHaveLength(0);
  });
});

describe('recordAskAnswer', () => {
  it('captures the FIRST reply and reports which task to wake', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve(rows([{ id: 77, task_id: 3, status: 'answered' }]) as never);
      return Promise.resolve(
        rows([{ answer: 'ბიძაშვილი აკეთებს BMW-ებს', from_name: 'გია' }]) as never,
      );
    });

    const out = await recordAskAnswer(55, 'ბიძაშვილი აკეთებს BMW-ებს');

    // The verbatim scrubbed text + ask id ride back for the wake event and
    // its delivery marker (ticket 3 §5, ticket 4 blocker 1).
    expect(out).toEqual({
      askId: 77,
      taskId: 3,
      firstAnswer: true,
      answer: 'ბიძაშვილი აკეთებს BMW-ებს',
      fromName: 'გია',
    });
  });

  it('returns null when the thread carries no live ask', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await recordAskAnswer(55, 'hello')).toBeNull();
  });
});

describe('buildAnswerWakeEvent', () => {
  it('survives double quotes in the answer — tag-delimited, never quote-wrapped (blocker 3)', () => {
    const event = buildAnswerWakeEvent('მან თქვა "არა" და წავიდა');

    expect(event).toContain('<answer>\nმან თქვა "არა" და წავიდა\n</answer>');
    // The old form wrapped the answer in its own quotes — thread 8201 got a
    // raw fragment when the answer itself contained one.
    expect(event).not.toContain('ტექსტია: "');
    expect(event).toContain('სიტყვასიტყვით');
  });
});

describe('cancelAsksForTask', () => {
  it('cancels sent asks and tells each recipient honestly', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { ask_thread_id: 61, to_user_id: 7 },
        { ask_thread_id: 62, to_user_id: 8 },
      ]) as never,
    );

    await cancelAsksForTask(3);

    expect(mockSaveMessage).toHaveBeenCalledTimes(2);
    expect(mockSaveMessage).toHaveBeenCalledWith(
      61,
      7,
      'assistant',
      expect.stringContaining('აღარ'),
    );
  });
});
