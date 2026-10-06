jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskStore.service', () => ({
  updateTask: jest.fn(),
  getGoalOnThread: jest.fn(),
  wakeTaskNoLaterThan: jest.fn(),
  __esModule: true,
}));
jest.mock('../taskAsks.service', () => ({ cancelAsksForTask: jest.fn(), __esModule: true }));
jest.mock('../threadStatus.service', () => ({ setThreadStatus: jest.fn(), __esModule: true }));
jest.mock('../sse.service', () => ({ emitChoicesCleared: jest.fn(), __esModule: true }));
jest.mock('../threads.service', () => ({
  getThread: jest.fn(),
  saveThreadMessage: jest.fn(),
  clearStoredChoices: jest.fn(),
  __esModule: true,
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { getGoalOnThread, Task, updateTask, wakeTaskNoLaterThan } from '../taskStore.service';
import { setThreadStatus } from '../threadStatus.service';
import { getThread, saveThreadMessage, Thread } from '../threads.service';
import { dismissStoppedGoal, resumeStoppedGoal } from '../goalStop.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetThread = getThread as jest.MockedFunction<typeof getThread>;
const mockGoal = getGoalOnThread as jest.MockedFunction<typeof getGoalOnThread>;
const rows = (r: unknown[]): unknown => ({ rows: r, rowCount: r.length });
const THREAD = 14719;
const GOAL = { id: 2872, status: 'closed', thread_id: THREAD, title: 'კარგი ვეტერინარი' } as Task;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetThread.mockResolvedValue({ id: THREAD } as Thread);
  mockGoal.mockResolvedValue(GOAL);
});

/** #1919 (phone report point 96): stop leaves the goal in the current list until its owner acts. */
describe('picking a stopped goal up again', () => {
  it('reopens it, says so, marks it waiting and wakes it within a minute', async () => {
    mockQuery.mockResolvedValue(rows([{ id: GOAL.id }]) as never);

    const out = await resumeStoppedGoal('501', THREAD, 'ka');

    expect(out).toEqual({ ok: true, goal_id: GOAL.id });
    expect(updateTask).toHaveBeenCalledWith('501', GOAL.id, 'open');
    expect(saveThreadMessage).toHaveBeenCalledWith(
      THREAD,
      501,
      'assistant',
      '„კარგი ვეტერინარი" განვაახლე — ვაგრძელებ.',
    );
    expect(setThreadStatus).toHaveBeenCalledWith('501', THREAD, 'waiting');
    expect(wakeTaskNoLaterThan).toHaveBeenCalledTimes(1);
  });

  it('refuses a goal that was not stopped', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);
    expect(await resumeStoppedGoal('501', THREAD, 'ka')).toEqual({
      ok: false,
      reason: 'not_stopped',
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('refuses somebody else’s thread', async () => {
    mockGetThread.mockResolvedValue(null as never);
    expect(await resumeStoppedGoal('777', THREAD, 'ka')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('closing a stopped goal for good', () => {
  it('stamps it once, so it moves to the finished list', async () => {
    mockQuery.mockResolvedValue(rows([{ id: GOAL.id }]) as never);

    expect(await dismissStoppedGoal('501', THREAD)).toEqual({ ok: true, goal_id: GOAL.id });
    expect(String(mockQuery.mock.calls[1][0])).toContain(
      'stop_dismissed_at = COALESCE(stop_dismissed_at, NOW())',
    );
  });
});

describe('the list', () => {
  it('tells the app a stopped goal is still open until its owner closes it', () => {
    const src = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(src).toContain('AS goal_stopped_open');
    expect(src).toContain('AND k.stop_dismissed_at IS NULL');
  });

  it('does not bring back the goals stopped before today', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '211_a_stopped_goal_stays.sql'),
      'utf8',
    );
    expect(sql).toContain('SET stop_dismissed_at = NOW()');
  });
});
