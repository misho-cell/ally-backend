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
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { createThread, saveThreadMessage } from '../threads.service';
import { createAsk, recordAskAnswer, cancelAsksForTask } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCreateThread = createThread as jest.MockedFunction<typeof createThread>;
const mockSaveMessage = saveThreadMessage as jest.MockedFunction<typeof saveThreadMessage>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

beforeEach(() => jest.clearAllMocks());

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
  it('sends: ask row + recipient thread + opening message', async () => {
    routeAskQueries({ member: { userId: 7, name: 'გია' } });

    const out = await createAsk('42', 3, '+995599111222', 'BMW-ს კარგი ხელოსანი ხომ არ იცი?');

    expect(out).toEqual({ sent: true, ask_id: 9, to_name: 'გია' });
    expect(mockCreateThread).toHaveBeenCalledWith(
      '7',
      'incoming_ask',
      expect.any(String),
      undefined,
      {
        isTask: true,
        status: 'needs_you',
        statusLine: 'პასუხს ელოდება',
      },
    );
    expect(mockSaveMessage).toHaveBeenCalled();
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

  it('refuses asking yourself', async () => {
    routeAskQueries({ member: { userId: 42, name: 'მიშო' } });

    const out = await createAsk('42', 3, '+995599111222', 'q');

    expect(out.sent).toBe(false);
  });
});

describe('recordAskAnswer', () => {
  it('captures the FIRST reply and reports which task to wake', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE task_asks'))
        return Promise.resolve(rows([{ task_id: 3, status: 'answered' }]) as never);
      return Promise.resolve(rows([{ answer: 'ბიძაშვილი აკეთებს BMW-ებს' }]) as never);
    });

    const out = await recordAskAnswer(55, 'ბიძაშვილი აკეთებს BMW-ებს');

    expect(out).toEqual({ taskId: 3, firstAnswer: true });
  });

  it('returns null when the thread carries no live ask', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await recordAskAnswer(55, 'hello')).toBeNull();
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
