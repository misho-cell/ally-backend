jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
  default: {},
}));
jest.mock('../notification.service', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../sse.service', () => ({ emitThreadCreated: jest.fn(), emitThreadUpdated: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query, withTransaction } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { emitThreadCreated, emitThreadUpdated } from '../sse.service';
import {
  NETAI_THREAD_TITLE,
  isNetaiThread,
  markNetaiSeen,
  netaiPushBody,
  netaiRecipient,
  recordNetaiReply,
  sendNetaiMessage,
} from '../netaiMessage.service';

const mockQuery = query as jest.Mock;
const mockTransaction = withTransaction as jest.Mock;
const mockPush = sendPushNotification as jest.Mock;
const USER = 13927;
const THREAD = 70001;
const TEXT = 'ლია, გამარჯობა! ნეტაი გწერს.';
const BUTTONS = ['კი, გადაეცით', 'არა, მადლობა'];

/** A transaction client answering each statement in turn; records what it ran. */
function clientAnswering(...answers: { rows: unknown[] }[]): { query: jest.Mock } {
  const client = { query: jest.fn() };
  for (const answer of answers) client.query.mockResolvedValueOnce(answer);
  client.query.mockResolvedValue({ rows: [] });
  mockTransaction.mockImplementationOnce(async (cb: (c: unknown) => Promise<unknown>) =>
    cb(client),
  );
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** #7360 (founder's word D871 / D873): Netai's own message to one user. */
describe('Netai writes to one user in its own name', () => {
  it('opens a „Netai" conversation the first time, with the text exactly as approved', async () => {
    const client = clientAnswering(
      { rows: [] },
      { rows: [{ id: THREAD }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 5 }] },
    );
    const sent = await sendNetaiMessage({
      userId: USER,
      text: TEXT,
      choices: BUTTONS,
      sentBy: '1',
    });

    expect(sent).toEqual({ id: 5, threadId: THREAD, newThread: true });
    const [threadSql, threadParams] = client.query.mock.calls[1];
    expect(threadSql).toContain('INSERT INTO threads');
    expect(threadParams).toEqual([USER, NETAI_THREAD_TITLE]);
    const [, convParams] = client.query.mock.calls[2];
    expect(convParams).toEqual([THREAD, USER, TEXT, JSON.stringify(BUTTONS)]);
    expect(emitThreadCreated).toHaveBeenCalledWith(
      String(USER),
      expect.objectContaining({ id: THREAD, title: 'Netai' }),
    );
    expect(mockPush).toHaveBeenCalledWith(String(USER), {
      title: 'Netai',
      body: TEXT,
      url: `/chat/${THREAD}`,
    });
  });

  it('reuses the user’s „Netai" conversation and saves no buttons when none are given', async () => {
    const client = clientAnswering(
      { rows: [{ thread_id: THREAD }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 6 }] },
    );
    const sent = await sendNetaiMessage({ userId: USER, text: TEXT, choices: [], sentBy: '1' });

    expect(sent).toEqual({ id: 6, threadId: THREAD, newThread: false });
    expect(
      client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO threads')),
    ).toBe(false);
    expect(client.query.mock.calls[1][1]).toEqual([THREAD, USER, TEXT, null]);
    expect(emitThreadUpdated).toHaveBeenCalled();
    expect(emitThreadCreated).not.toHaveBeenCalled();
  });

  it('keeps the message when the push fails, and says so in the log', async () => {
    clientAnswering(
      { rows: [{ thread_id: THREAD }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 7 }] },
    );
    mockPush.mockRejectedValueOnce(new Error('no subscription'));
    await expect(
      sendNetaiMessage({ userId: USER, text: TEXT, choices: [], sentBy: '1' }),
    ).resolves.toEqual(expect.objectContaining({ id: 7 }));
    expect(console.warn).toHaveBeenCalled();
  });

  it('refuses a missing or deleted account, and names a test seat', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(netaiRecipient(118509)).resolves.toBeNull();
    expect(String(mockQuery.mock.calls[0][0])).toContain('"deletedAt" IS NULL');
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Seat', seat: true }] });
    await expect(netaiRecipient(191406)).resolves.toEqual({ name: 'Seat', testSeat: true });
  });

  it('shortens a long text for the lock screen only', () => {
    const long = 'ა '.repeat(200);
    expect(netaiPushBody(long).length).toBe(120);
    expect(netaiPushBody(long).endsWith('…')).toBe(true);
    expect(netaiPushBody('  ორი\n სიტყვა ')).toBe('ორი სიტყვა');
  });
});

describe('the user’s side of the „Netai" conversation', () => {
  it('knows the conversation, marks it seen, and keeps the reply on the latest message', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ found: true }] });
    await expect(isNetaiThread(THREAD)).resolves.toBe(true);

    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markNetaiSeen(THREAD, USER);
    expect(String(mockQuery.mock.calls[1][0])).toContain('seen_at IS NULL');

    mockQuery.mockResolvedValueOnce({ rows: [] });
    await recordNetaiReply(THREAD, USER, 'კი, გადაეცით');
    const [sql, params] = mockQuery.mock.calls[2];
    expect(String(sql)).toContain('ORDER BY sent_at DESC');
    expect(params).toEqual([THREAD, USER, 'კი, გადაეცით']);
  });

  it('keeps the reply for the team and still lets Netai answer it (#8284)', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'threads.routes.ts'),
      'utf8',
    );
    const hook = routes.indexOf('if (await isNetaiThread(threadId))');
    expect(hook).toBeGreaterThan(-1);
    const titleAt = routes.indexOf('const needsTitle =');
    expect(hook).toBeLessThan(titleAt);
    const block = routes.slice(hook, titleAt);
    expect(block).toContain('await recordNetaiReply(threadId, Number(userId), message);');
    expect(block).not.toContain('run: false');
    expect(block).not.toContain('return;');
  });

  it('has the admin routes to send and to read back', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.post(\n  '/users/:id/netai-messages'");
    expect(admin).toContain("adminRouter.get(\n  '/users/:id/netai-messages'");
    expect(admin).toContain('res.status(201)');
    expect(admin).toContain("error: 'No such account, or it was deleted.'");
  });
});
