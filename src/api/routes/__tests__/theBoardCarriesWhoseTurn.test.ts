jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  ...jest.requireActual('../../middleware/auth.middleware'),
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '167250' };
    next();
  },
  requireAdminRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../../services/teamTasks.service', () => ({
  __esModule: true,
  ...jest.requireActual('../../../services/teamTasks.service'),
  authorForLogin: jest.fn(),
  createTeamTask: jest.fn(),
  listTeamTasks: jest.fn(),
  countTeamTasks: jest.fn(),
  updateTeamTask: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import adminRouter from '../admin.routes';
import {
  authorForLogin,
  countsFrom,
  countTeamTasks,
  createTeamTask,
  listTeamTasks,
  TeamTask,
  TeamTaskAuthor,
  TeamTaskStatus,
  TeamTaskTurn,
  updateTeamTask,
  WHOSE_TURN_FILTER_INVALID,
  WHOSE_TURN_INVALID,
  WHOSE_TURN_NEEDED_ON_CREATE,
  WHOSE_TURN_NEEDED_WITH_STATUS,
} from '../../../services/teamTasks.service';

const mockAuthor = authorForLogin as jest.MockedFunction<typeof authorForLogin>;
const mockCreate = createTeamTask as jest.MockedFunction<typeof createTeamTask>;
const mockList = listTeamTasks as jest.MockedFunction<typeof listTeamTasks>;
const mockCount = countTeamTasks as jest.MockedFunction<typeof countTeamTasks>;
const mockUpdate = updateTeamTask as jest.MockedFunction<typeof updateTeamTask>;

const TASK: TeamTask = {
  id: 42,
  created_by: TeamTaskAuthor.Giorgi,
  problem: 'p',
  task: 't',
  priority: 2,
  status: TeamTaskStatus.ToBuild,
  page: 1,
  whose_turn: TeamTaskTurn.Misho,
  created_at: '2026-10-18T09:00:00.000Z',
  updated_at: '2026-10-18T09:00:00.000Z',
};

interface Answer {
  readonly status: number;
  readonly body: { readonly success: boolean; readonly data?: unknown; readonly error?: string };
}

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/team-tasks`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => {
  jest.clearAllMocks();
  mockAuthor.mockResolvedValue(TeamTaskAuthor.Giorgi);
  mockCreate.mockResolvedValue(TASK);
  mockUpdate.mockResolvedValue(TASK);
  mockList.mockResolvedValue([TASK]);
  mockCount.mockResolvedValue(countsFrom([{ status: 'to_build', whose_turn: 'misho', n: 1 }]));
});

async function send(method: string, path: string, body?: unknown): Promise<Answer> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Answer['body'] };
}

/** Board #5809 (the founder's D828). */
describe('POST /admin/team-tasks', () => {
  it('stores whose turn it is and answers 201 with it', async () => {
    const answer = await send('POST', '', { problem: 'p', task: 't', whose_turn: 'misho' });
    expect(answer.status).toBe(201);
    expect(answer.body).toEqual({ success: true, data: TASK });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ whoseTurn: 'misho' }));
  });

  it('refuses a task without whose_turn, before reading the login', async () => {
    const answer = await send('POST', '', { problem: 'p', task: 't' });
    expect(answer).toEqual({
      status: 400,
      body: { success: false, error: WHOSE_TURN_NEEDED_ON_CREATE },
    });
    expect(mockAuthor).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses a seat that is not on the list', async () => {
    const answer = await send('POST', '', { problem: 'p', task: 't', whose_turn: 'ai' });
    expect(answer).toEqual({ status: 400, body: { success: false, error: WHOSE_TURN_INVALID } });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('PATCH /admin/team-tasks/:id', () => {
  it('moves the status together with whose turn it is', async () => {
    const answer = await send('PATCH', '/42', { status: 'built', whose_turn: 'tester' });
    expect(answer.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'built', whoseTurn: 'tester' }),
    );
  });

  it('refuses a status change that does not say whose turn is next', async () => {
    const answer = await send('PATCH', '/42', { status: 'built' });
    expect(answer).toEqual({
      status: 400,
      body: { success: false, error: WHOSE_TURN_NEEDED_WITH_STATUS },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sets whose turn it is alone', async () => {
    const answer = await send('PATCH', '/42', { whose_turn: 'mishos_claude' });
    expect(answer.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ whoseTurn: 'mishos_claude' }),
    );
  });

  it('still moves a row between pages without one', async () => {
    const answer = await send('PATCH', '/42', { page: 2 });
    expect(answer.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ page: 2, whoseTurn: undefined }),
    );
  });

  it('refuses an unknown seat, and cannot set it back to unset', async () => {
    for (const whose_turn of ['somebody', null, 'unset']) {
      const answer = await send('PATCH', '/42', { whose_turn });
      expect(answer).toEqual({ status: 400, body: { success: false, error: WHOSE_TURN_INVALID } });
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('answers 404 for a task that is not on the board', async () => {
    mockUpdate.mockResolvedValue(null);
    const answer = await send('PATCH', '/42', { status: 'built', whose_turn: 'tester' });
    expect(answer.status).toBe(404);
    expect(answer.body.success).toBe(false);
  });
});

describe('GET /admin/team-tasks', () => {
  it('filters by whose turn it is, together with the page', async () => {
    const answer = await send('GET', '?page=2&whose_turn=misho');
    expect(answer.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(2, 'misho');
    expect(mockCount).toHaveBeenCalledWith(2, 'misho');
    const data = answer.body.data as { tasks: TeamTask[]; counts: Record<string, unknown> };
    expect(data.tasks[0].whose_turn).toBe('misho');
    expect(data.counts.to_build).toBe(1);
    expect(data.counts.whose_turn).toMatchObject({ misho: 1, unset: 0, tester: 0 });
  });

  it('filters the rows not filled yet', async () => {
    expect((await send('GET', '?whose_turn=unset')).status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(undefined, 'unset');
  });

  it('reads the whole tab when no turn is asked for', async () => {
    expect((await send('GET', '?page=1')).status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, undefined);
  });

  it('refuses an unknown or repeated whose_turn', async () => {
    for (const path of ['?whose_turn=nobody', '?whose_turn=misho&whose_turn=lika']) {
      const answer = await send('GET', path);
      expect(answer).toEqual({
        status: 400,
        body: { success: false, error: WHOSE_TURN_FILTER_INVALID },
      });
    }
    expect(mockList).not.toHaveBeenCalled();
  });

  it('answers 500 without the database error', async () => {
    mockList.mockRejectedValue(new Error('relation team_tasks is locked'));
    const answer = await send('GET', '?whose_turn=tester');
    expect(answer.status).toBe(500);
    expect(JSON.stringify(answer.body)).not.toContain('relation');
  });
});
