jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '171' };
    next();
  },
  requireUserRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../middleware/subscription.middleware', () => ({
  __esModule: true,
  requireSubscriptionUnlessAnswering: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));
jest.mock('../../../services/threads.service', () => ({
  ...jest.requireActual('../../../services/threads.service'),
  getThread: jest.fn(),
  getThreadMessages: jest.fn(),
  threadLanguage: jest.fn(() => Promise.resolve('ka')),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import threadsRouter from '../threads.routes';
import { getThread, getThreadMessages, ThreadMessage } from '../../../services/threads.service';

const mockThread = getThread as jest.MockedFunction<typeof getThread>;
const mockMessages = getThreadMessages as jest.MockedFunction<typeof getThreadMessages>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/threads', threadsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/threads`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

const MESSAGES = [
  {
    id: 'a',
    role: 'user',
    content: 'ნოტარიუსი მჭირდება',
    kind: 'message',
    run_id: null,
    created_at: '2026-10-19T09:30:00.000Z',
    choices: null,
  },
  {
    id: 'b',
    role: 'assistant',
    content: 'ნინოს ვკითხავ.',
    kind: 'message',
    run_id: null,
    created_at: '2026-10-19T09:31:00.000Z',
    choices: null,
  },
] as unknown as ThreadMessage[];

/** #6074, the founder's D842: one export of the whole chat, as Word or Markdown. */
describe('GET /threads/:id/export.md | export.docx', () => {
  it('gives the whole conversation as Markdown, both sides in order', async () => {
    mockThread.mockResolvedValue({ id: 60506, title: 'ნოტარიუსი' } as never);
    mockMessages.mockResolvedValueOnce(MESSAGES);
    const res = await fetch(`${base}/60506/export.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment;');
    const text = await res.text();
    expect(text.indexOf('ნოტარიუსი მჭირდება')).toBeLessThan(text.indexOf('ნინოს ვკითხავ.'));
    expect(text).toContain('**[2026-10-19 09:30] შენ:**');
    expect(mockThread).toHaveBeenCalledWith(60506, '171');
  });

  it('gives it as a Word document', async () => {
    mockThread.mockResolvedValue({ id: 60506, title: null } as never);
    mockMessages.mockResolvedValueOnce(MESSAGES);
    const res = await fetch(`${base}/60506/export.docx`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('wordprocessingml');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
  });

  it('says 404 for a conversation that is not theirs, 400 for another format', async () => {
    mockThread.mockResolvedValue(null);
    expect((await fetch(`${base}/60506/export.md`)).status).toBe(404);
    expect((await fetch(`${base}/60506/export.pdf`)).status).toBe(400);
  });

  it('says 500 without the database error', async () => {
    mockThread.mockRejectedValue(new Error('relation threads is locked'));
    const res = await fetch(`${base}/60506/export.docx`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});
