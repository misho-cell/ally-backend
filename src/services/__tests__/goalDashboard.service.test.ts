jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { adminGoalDetail, blockerFor, goalDays } from '../goalDashboard.service';
import { GOAL_STAGE_SQL } from '../goalQuestions.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const GOAL = {
  id: 1519,
  user_id: '501',
  title: 'BMW-ს ხელოსანი',
  status: 'open',
  brief: 'კარგი ხელოსანი თბილისში',
  stage: 'waiting_on_reply',
  closed_reason: null,
  created_at: new Date('2026-09-01T10:00:00Z'),
  updated_at: new Date('2026-09-06T10:00:00Z'),
  last_activity_at: new Date('2026-09-06T10:00:00Z'),
  next_wake_at: new Date('2026-09-08T02:30:00Z'),
  thread_id: 9412,
  plan: { solved_when: 'ხელოსანი ნაპოვნია', routes: [], people_to_involve: [], never_contact: [] },
  plan_proposed: null,
  plan_version: 1,
  plan_approved_at: new Date('2026-09-02T10:00:00Z'),
  pending_question: null,
  pending_question_at: null,
  owner_name: 'თორნიკე',
  owner_balance: '740',
  asks_worked: '1',
  asks_did_not_work: '0',
};

function routeQueries(opts: {
  goal?: typeof GOAL | null;
  actions?: unknown[];
  pending?: unknown[];
}) {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('AS owner_name'))
      return Promise.resolve(rows(opts.goal === null ? [] : [opts.goal ?? GOAL]) as never);
    if (sql.includes('UNION ALL')) return Promise.resolve(rows(opts.actions ?? []) as never);
    if (sql.includes("a.status = 'sent'"))
      return Promise.resolve(rows(opts.pending ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Ticket 10 Task 28 (a): one goal — stage, actions with times, blocker, payer, outcome.
describe('adminGoalDetail', () => {
  it('is null for a goal that is not this user’s', async () => {
    routeQueries({ goal: null });

    expect(await adminGoalDetail('501', 1519)).toBeNull();
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([1519, '501']);
  });

  it('reads the stage with the SAME expression the list uses, so the two cannot disagree', async () => {
    routeQueries({});

    await adminGoalDetail('501', 1519);

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain(GOAL_STAGE_SQL);
  });

  it('names the payer — the owner, whose wallet every run and ask of the goal is charged to (D123)', async () => {
    routeQueries({});

    const goal = await adminGoalDetail('501', 1519);

    expect(goal?.payer).toEqual({ user_id: '501', name: 'თორნიკე', balance: 740 });
  });

  it('lists the actions oldest first, dates as ISO, and drops rows without a time', async () => {
    routeQueries({
      actions: [
        { at: new Date('2026-09-01T10:00:00Z'), kind: 'goal_created', detail: 'BMW', ref_id: null },
        {
          at: new Date('2026-09-03T02:30:00Z'),
          kind: 'wake',
          detail: '[მოვლენა] ღამის…',
          ref_id: 77,
        },
        { at: new Date('2026-09-03T02:31:00Z'), kind: 'ask_sent', detail: 'გია', ref_id: 9 },
        { at: null, kind: 'closed', detail: null, ref_id: null },
      ],
    });

    const goal = await adminGoalDetail('501', 1519);

    expect(goal?.actions.map((a) => a.kind)).toEqual(['goal_created', 'wake', 'ask_sent']);
    expect(goal?.actions[1].at).toBe('2026-09-03T02:30:00.000Z');
    expect(goal?.actions[2]).toEqual({
      at: '2026-09-03T02:31:00.000Z',
      kind: 'ask_sent',
      detail: 'გია',
      ref_id: 9,
    });
  });

  it('the timeline is one union over the tables that already hold the facts', async () => {
    routeQueries({});

    await adminGoalDetail('501', 1519);

    const [sql, params] = mockQuery.mock.calls.find(([s]) => String(s).includes('UNION ALL')) as [
      string,
      unknown[],
    ];
    for (const kind of [
      "'goal_created'",
      "'plan_approved'",
      "'question_to_owner'",
      "'circle_widened'",
      "'relay_sent'",
      "'answer_automatic'",
      "'wake'",
      "'weekly_summary'",
      "'debrief_' || o.outcome",
      "'closed'",
    ]) {
      expect(sql).toContain(kind);
    }
    // The wake and summary prefixes travel as parameters, never interpolated.
    expect(params).toEqual([1519, 200, 160, '[მოვლენა]', 'კვირის შეჯამება']);
  });

  it('reads the blocker off the stage: waiting on a reply names the people and since when', async () => {
    routeQueries({
      pending: [
        { name: 'გია', created_at: new Date('2026-09-03T02:31:00Z') },
        { name: null, created_at: new Date('2026-09-04T02:31:00Z') },
      ],
    });

    const goal = await adminGoalDetail('501', 1519);

    expect(goal?.blocker).toEqual({
      kind: 'awaiting_reply',
      people: ['გია', 'უცნობი'],
      since: '2026-09-03T02:31:00.000Z',
    });
  });

  it('an open goal’s outcome is open, with the debrief rungs counted', async () => {
    routeQueries({});

    const goal = await adminGoalDetail('501', 1519);

    expect(goal?.outcome).toEqual({
      state: 'open',
      closed_reason: null,
      closed_at: null,
      asks_worked: 1,
      asks_did_not_work: 0,
    });
  });

  it('a stopped goal carries its close reason and time', async () => {
    routeQueries({
      goal: {
        ...GOAL,
        status: 'closed',
        stage: 'stopped',
        closed_reason: 'user asked to stop',
      },
    });

    const goal = await adminGoalDetail('501', 1519);

    expect(goal?.outcome.state).toBe('stopped');
    expect(goal?.outcome.closed_reason).toBe('user asked to stop');
    expect(goal?.outcome.closed_at).toBe('2026-09-06T10:00:00.000Z');
    expect(goal?.blocker).toBeNull();
  });
});

describe('blockerFor', () => {
  const row = {
    pending_question: 'რომელი უბანი?',
    pending_question_at: '2026-09-05T10:00:00Z',
    owner_balance: '0',
  };

  it('waiting on the owner carries the question itself', () => {
    expect(blockerFor('waiting_on_user', row, [])).toEqual({
      kind: 'owner_question',
      question: 'რომელი უბანი?',
      since: '2026-09-05T10:00:00.000Z',
    });
  });

  it('a proposed plan waits for approval; an empty wallet waits for a top-up', () => {
    expect(blockerFor('plan_proposed', row, [])).toEqual({ kind: 'plan_approval', since: null });
    expect(blockerFor('waiting_topup', row, [])).toEqual({ kind: 'topup', balance: 0 });
  });

  it('running, understanding and closed goals have no blocker', () => {
    for (const stage of ['running', 'understanding', 'solved', 'stopped', 'paused'] as const) {
      expect(blockerFor(stage, row, [])).toBeNull();
    }
  });
});

// The standard, Part I §3: the 14-day table as data — a silent day is a day
// with none of the five signs.
describe('goalDays', () => {
  it('is null for a goal that is not this user’s', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await goalDays('501', 1519)).toBeNull();
  });

  it('marks silent days, counts them, and clamps the span', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM tasks'))
        return Promise.resolve(rows([{ id: 1519 }]) as never);
      return Promise.resolve(
        rows([
          {
            day: new Date('2026-09-06T00:00:00Z'),
            asks_sent: '2',
            replies_in: '0',
            circle_widened: false,
            method_changed: false,
            status_lines: '1',
          },
          {
            day: new Date('2026-09-07T00:00:00Z'),
            asks_sent: '0',
            replies_in: '0',
            circle_widened: false,
            method_changed: false,
            status_lines: '0',
          },
          {
            day: new Date('2026-09-08T00:00:00Z'),
            asks_sent: '0',
            replies_in: '1',
            circle_widened: true,
            method_changed: false,
            status_lines: '0',
          },
        ]) as never,
      );
    });

    const report = await goalDays('501', 1519, 500);

    expect(report?.days.map((d) => d.silent)).toEqual([false, true, false]);
    expect(report?.silent_days).toBe(1);
    expect(report?.active_days).toBe(2);
    expect(report?.from).toBe('2026-09-06');
    expect(report?.to).toBe('2026-09-08');
    // 500 asked, 60 is the ceiling; 14 is the default.
    const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual([1519, 60]);
  });

  it('defaults to fourteen days', async () => {
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(rows(sql.includes('SELECT id FROM tasks') ? [{ id: 1519 }] : []) as never),
    );

    await goalDays('501', 1519);

    const [, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual([1519, 14]);
  });
});
