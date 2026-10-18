jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../handoff.service', () => ({
  __esModule: true,
  HandoffAuthor: { ClaudeBackend: 'claude_backend' },
  postHandoff: jest.fn().mockResolvedValue({}),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  changeTurnRefusal,
  countsFrom,
  countTeamTasks,
  createTurnRefusal,
  isTeamTaskTurn,
  isTeamTaskTurnFilter,
  listTeamTasks,
  TEAM_TASK_TURNS,
  TeamTaskTurn,
  updateTeamTask,
  WHOSE_TURN_INVALID,
  WHOSE_TURN_NEEDED_ON_CREATE,
  WHOSE_TURN_NEEDED_WITH_STATUS,
  WHOSE_TURN_UNSET,
} from '../teamTasks.service';
import { refillBoardOnce } from '../teamTaskRefill.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (list: readonly unknown[]): never => ({ rows: list, rowCount: list.length }) as never;
const SEATS = ['misho', 'mishos_claude', 'giorgi', 'lika', 'ninia', 'tornike', 'tester'];
const NO_TURNS = {
  misho: 0,
  mishos_claude: 0,
  giorgi: 0,
  lika: 0,
  ninia: 0,
  tornike: 0,
  tester: 0,
  unset: 0,
};

beforeEach(() => jest.clearAllMocks());

/** Board #5809 (the founder's D828): whose move it is, a field and not a guess. */
describe('the seats a turn can belong to', () => {
  it('are exactly the seven the migration allows', () => {
    expect([...TEAM_TASK_TURNS]).toEqual(SEATS);
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '252_team_task_whose_turn.sql'),
      'utf8',
    );
    for (const seat of SEATS) expect(migration).toContain(`'${seat}'`);
    expect(migration).toContain('whose_turn TEXT;');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS team_tasks_whose_turn');
  });

  it('accept a seat and nothing else', () => {
    expect(isTeamTaskTurn('mishos_claude')).toBe(true);
    for (const wrong of ['Misho', 'ai', '', null, undefined, 3, WHOSE_TURN_UNSET]) {
      expect(isTeamTaskTurn(wrong)).toBe(false);
    }
  });

  it('filter by a seat, or by „unset" for the rows not filled yet', () => {
    expect(isTeamTaskTurnFilter('tester')).toBe(true);
    expect(isTeamTaskTurnFilter(WHOSE_TURN_UNSET)).toBe(true);
    expect(isTeamTaskTurnFilter('nobody')).toBe(false);
    expect(isTeamTaskTurnFilter(['tester', 'misho'])).toBe(false);
  });
});

describe('when whose_turn must be sent', () => {
  it('always on a new task', () => {
    expect(createTurnRefusal(undefined)).toBe(WHOSE_TURN_NEEDED_ON_CREATE);
    expect(createTurnRefusal('somebody')).toBe(WHOSE_TURN_INVALID);
    expect(createTurnRefusal(null)).toBe(WHOSE_TURN_INVALID);
    expect(createTurnRefusal('giorgi')).toBeNull();
  });

  it('with every status change, and never as something other than a seat', () => {
    expect(changeTurnRefusal(undefined, true)).toBe(WHOSE_TURN_NEEDED_WITH_STATUS);
    expect(changeTurnRefusal('lika', true)).toBeNull();
    expect(changeTurnRefusal('later', true)).toBe(WHOSE_TURN_INVALID);
    expect(changeTurnRefusal(null, false)).toBe(WHOSE_TURN_INVALID);
  });

  it('not for a change without a status, which may still set it alone', () => {
    expect(changeTurnRefusal(undefined, false)).toBeNull();
    expect(changeTurnRefusal('tester', false)).toBeNull();
  });

  it('names every seat in the refusal', () => {
    for (const seat of SEATS) {
      expect(WHOSE_TURN_NEEDED_WITH_STATUS).toContain(seat);
      expect(WHOSE_TURN_NEEDED_ON_CREATE).toContain(seat);
    }
  });
});

describe('the board filtered by whose turn it is', () => {
  it('passes the seat as a parameter, never in the text', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await listTeamTasks(2, TeamTaskTurn.Giorgi);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain(
      'AND (NOT $4::boolean OR whose_turn IS NOT DISTINCT FROM $5::text)',
    );
    expect(String(sql)).not.toContain("'giorgi'");
    expect(String(sql)).toContain('whose_turn');
    expect((params as unknown[]).slice(3)).toEqual([true, 'giorgi']);
    expect((params as unknown[])[0]).toBe(2);
    expect(timeout).toBeGreaterThan(0);
  });

  it('matches the rows with no turn yet for „unset"', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await listTeamTasks(undefined, WHOSE_TURN_UNSET);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBeNull();
    expect(params.slice(3)).toEqual([true, null]);
  });

  it('does not filter when no turn is asked for', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await listTeamTasks(1);
    expect((mockQuery.mock.calls[0][1] as unknown[]).slice(3)).toEqual([false, null]);
  });

  it('sets whose_turn on a change, and keeps it when the change does not name one', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await updateTeamTask(7, { whoseTurn: TeamTaskTurn.Tester });
    await updateTeamTask(7, { page: 3 });
    expect(String(mockQuery.mock.calls[0][0])).toContain('whose_turn = COALESCE($7, whose_turn)');
    expect(mockQuery.mock.calls[0][1]).toEqual([7, null, null, null, null, null, 'tester']);
    expect((mockQuery.mock.calls[1][1] as unknown[])[6]).toBeNull();
  });
});

describe('the counts by whose turn it is', () => {
  const TAB = [
    { status: 'to_build', whose_turn: 'misho', n: 4 },
    { status: 'to_build', whose_turn: null, n: 2 },
    { status: 'tested', whose_turn: 'tester', n: 5 },
    { status: 'built', whose_turn: 'misho', n: 1 },
  ];

  it('count every seat and the unset rows, and keep the status counts as they were', () => {
    expect(countsFrom(TAB)).toEqual({
      to_build: 6,
      built: 1,
      being_tested: 0,
      tested: 5,
      whose_turn: { ...NO_TURNS, misho: 5, tester: 5, unset: 2 },
    });
  });

  it('count the statuses of the filtered rows, and every seat of the whole tab', () => {
    expect(countsFrom(TAB, TeamTaskTurn.Misho)).toEqual({
      to_build: 4,
      built: 1,
      being_tested: 0,
      tested: 0,
      whose_turn: { ...NO_TURNS, misho: 5, tester: 5, unset: 2 },
    });
    expect(countsFrom(TAB, WHOSE_TURN_UNSET)).toMatchObject({ to_build: 2, built: 0, tested: 0 });
  });

  it('ignore a value the column cannot hold', () => {
    expect(countsFrom([{ status: 'to_build', whose_turn: 'ai', n: 3 }]).whose_turn).toEqual(
      NO_TURNS,
    );
  });

  it('are grouped by both in the database, one bounded read with a timeout', async () => {
    mockQuery.mockResolvedValue(rows(TAB));
    const counts = await countTeamTasks(1, TeamTaskTurn.Tester);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('GROUP BY status, whose_turn');
    expect(String(sql)).toContain('deleted_at IS NULL');
    expect(params).toEqual([1]);
    expect(timeout).toBeGreaterThan(0);
    expect(counts.tested).toBe(5);
    expect(counts.to_build).toBe(0);
  });
});

/** #562's refill moves a row between pages; that is not a status change. */
describe('the refill', () => {
  it('moves rows without touching whose turn it is', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ n: '0' }]))
      .mockResolvedValueOnce(rows([{ id: 11, problem: 'p', task: 'build it' }]))
      .mockResolvedValue(rows([{ id: 11 }]));
    expect((await refillBoardOnce()).toMisho).toEqual([11]);
    const updates = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes('UPDATE'));
    expect(updates.length).toBeGreaterThan(0);
    for (const sql of updates) expect(sql).not.toContain('whose_turn');
  });
});
