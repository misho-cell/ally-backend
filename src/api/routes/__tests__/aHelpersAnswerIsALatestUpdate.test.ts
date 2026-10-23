jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '501' };
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
jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import updatesRouter from '../updates.routes';
import { query } from '../../../db/postgres/client';
import * as threads from '../../../services/threads.service';
import { LATEST_UPDATES_LIMIT } from '../../../services/pendingUpdates.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const GOAL_ID = 25973;
const THREAD_ID = 52283;

let server: Server;
let base: string;

beforeAll((done) => {
  jest.spyOn(threads, 'userLanguage').mockResolvedValue('ka');
  const app = express();
  app.use(express.json());
  app.use('/updates', updatesRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/updates`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});

interface Row {
  readonly update_ref: string;
  readonly kind: string;
  readonly thread_id: number | null;
  readonly title: string;
  readonly detail: string;
  readonly released_at: string;
}

function answerQueries(updates: unknown[], answers: unknown[], intros: unknown[] = []): void {
  mockQuery.mockImplementation((sql: unknown) =>
    Promise.resolve({
      rows: String(sql).includes('FROM pending_updates p')
        ? updates
        : String(sql).includes('FROM task_asks a')
          ? answers
          : String(sql).includes('FROM introduction_requests ir')
            ? intros
            : String(sql).includes('FROM tasks')
              ? [{ id: GOAL_ID, title: 'თემურ ბოლოთაშვილის გაცნობა' }]
              : [],
      rowCount: 0,
    } as never),
  );
}

const LIKA_SAID_YES = {
  ask_id: 24718,
  task_id: GOAL_ID,
  thread_id: THREAD_ID,
  case_title: 'ბოლოთაშვილი',
  to_name: 'ლიკა',
  declined: false,
  answered_at: new Date('2026-10-19T14:30:36.000Z'),
};

async function latest(): Promise<Row[]> {
  const res = await fetch(`${base}/latest`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { updates: Row[] } }).data.updates;
}

/** #6344 (Giorgi, G-089, goal 29308): a helper's answer shows in „ბოლო სიახლეები" at once. */
describe('GET /updates/latest — a helper’s answer', () => {
  it('is a row of its own, opening its case, in the goal’s own words', async () => {
    answerQueries([], [LIKA_SAID_YES]);
    const [row] = await latest();
    expect(row).toMatchObject({
      update_ref: 'ask_24718',
      kind: 'answer',
      thread_id: THREAD_ID,
      title: 'თემურ ბოლოთაშვილის გაცნობა',
      released_at: '2026-10-19T14:30:36.000Z',
    });
    expect(row.detail).toContain('უპასუხა');
  });

  it('stands among the updates by time, newest first', async () => {
    const update = (id: number, at: string): Record<string, unknown> => ({
      id,
      task_id: GOAL_ID,
      kind: 'search_result',
      payload: {},
      thread_id: THREAD_ID,
      case_title: null,
      released_at: new Date(at),
    });
    answerQueries(
      [
        update(1, '2026-10-19T15:00:00Z'),
        update(2, '2026-10-19T14:00:00Z'),
        update(3, '2026-10-19T13:00:00Z'),
      ],
      [LIKA_SAID_YES],
    );
    const rows = await latest();
    expect(rows.map((r) => r.update_ref)).toEqual(['upd_1', 'ask_24718', 'upd_2', 'upd_3']);
    expect(rows.length).toBeLessThanOrEqual(LATEST_UPDATES_LIMIT);
  });

  it('reads only the owner’s own answered questions of the last two weeks', async () => {
    answerQueries([], []);
    await latest();
    const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes('FROM task_asks a'));
    expect(String(call?.[0])).toContain('a.from_user_id = $1::int');
    expect(String(call?.[0])).toContain("a.status = 'answered'");
    expect(call?.[1]).toEqual([OWNER, 14, LATEST_UPDATES_LIMIT]);
  });
});

/** G-155 (#6344 merged into #6768, URGENT): Lika's yes to the introduction request. */
describe('GET /updates/latest — an answer to an introduction request', () => {
  const LIKA_AGREED = {
    request_id: 7,
    task_id: GOAL_ID,
    thread_id: THREAD_ID,
    case_title: 'ბოლოთაშვილი',
    mediator_name: 'ლიკა',
    target_name: 'თემურ ბოლოთაშვილი',
    accepted: true,
    answered_at: new Date('2026-10-19T14:37:51.000Z'),
  };

  it('is a row saying who answered and what, opening its case', async () => {
    answerQueries([], [], [LIKA_AGREED]);
    const [row] = await latest();
    expect(row).toMatchObject({
      update_ref: 'intro_7',
      kind: 'intro_answer',
      thread_id: THREAD_ID,
      title: 'თემურ ბოლოთაშვილის გაცნობა',
      released_at: '2026-10-19T14:37:51.000Z',
    });
    expect(row.detail).toBe('ლიკა: თემურ ბოლოთაშვილზე გაცნობის მოთხოვნა მიღებულია.');
  });

  it('reads only the owner’s own answered requests of the last two weeks', async () => {
    answerQueries([], []);
    await latest();
    const call = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('FROM introduction_requests ir'),
    );
    expect(String(call?.[0])).toContain('ir.requester_user_id = $1::int');
    expect(call?.[1]).toEqual([OWNER, 14, LATEST_UPDATES_LIMIT, ['accepted', 'declined']]);
  });
});
