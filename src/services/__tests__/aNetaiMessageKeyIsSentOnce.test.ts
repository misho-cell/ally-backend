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
import { withTransaction } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { sendNetaiMessage } from '../netaiMessage.service';

const mockTransaction = withTransaction as jest.Mock;
const mockPush = sendPushNotification as jest.Mock;
const USER = 13927;
const THREAD = 70001;

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
});

/** #7725 (tester's engagement desk C-0020): a retried send is one message. */
describe('a Netai message sent under the caller’s key', () => {
  it('is written with its key, under a per-person lock', async () => {
    const client = clientAnswering(
      { rows: [] },
      { rows: [] },
      { rows: [{ thread_id: THREAD }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 9 }] },
    );
    const sent = await sendNetaiMessage({
      userId: USER,
      text: 'გამარჯობა',
      choices: [],
      sentBy: '1',
      clientMsgId: 'k-1',
    });
    expect(sent).toEqual({ id: 9, threadId: THREAD, newThread: false });
    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    const insert = client.query.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO netai_messages'),
    );
    expect(insert?.[1]).toContain('k-1');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('sends nothing the second time, and answers with the first message', async () => {
    const client = clientAnswering({ rows: [] }, { rows: [{ id: 9, thread_id: THREAD }] });
    const sent = await sendNetaiMessage({
      userId: USER,
      text: 'გამარჯობა',
      choices: [],
      sentBy: '1',
      clientMsgId: 'k-1',
    });
    expect(sent).toEqual({ id: 9, threadId: THREAD, newThread: false, repeated: true });
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is read from the body or the Idempotency-Key header, a repeat answered 200', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("req.get('idempotency-key')");
    expect(routes).toContain('res.status(sent.repeated === true ? 200 : 201)');
  });
});
