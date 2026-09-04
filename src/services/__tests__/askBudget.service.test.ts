jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  checkAskBudget,
  checkFollowUpBudget,
  describeAskBudget,
  FATIGUE_WINDOW_DAYS,
  MIN_MONTHLY_ASK_BUDGET,
  RELAY_MESSAGES_PER_PERSON_PER_DAY,
} from '../askBudget.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function routeBudgetQueries(opts: {
  inConversation?: number;
  sentThisMonth?: number;
  /** Recipients this sender drove to opt out, inside the window. */
  optOutsCaused?: number;
  /** This sender's own asks nobody answered, inside the window. */
  asksIgnored?: number;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('JOIN tasks t'))
      return Promise.resolve(rows([{ count: String(opts.inConversation ?? 0) }]) as never);
    if (sql.includes('ask_optout_events'))
      return Promise.resolve(
        rows([
          {
            opt_outs: String(opts.optOutsCaused ?? 0),
            ignored: String(opts.asksIgnored ?? 0),
          },
        ]) as never,
      );
    if (sql.includes("date_trunc('month'"))
      return Promise.resolve(
        rows([
          { count: String(opts.sentThisMonth ?? 0), resets_at: '2026-10-01T00:00:00.000Z' },
        ]) as never,
      );
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkAskBudget', () => {
  it('allows a first growth ask in a fresh conversation with budget left', async () => {
    routeBudgetQueries({});

    const out = await checkAskBudget('42', 555);

    expect(out).toEqual({ allowed: true });
  });

  it('blocks a second growth ask in the same conversation — the hard floor', async () => {
    routeBudgetQueries({ inConversation: 1 });

    const out = await checkAskBudget('42', 555);

    expect(out).toEqual({ allowed: false, reason: 'conversation_limit_reached' });
  });

  it('skips the per-conversation check entirely when no thread is given (MCP surface)', async () => {
    routeBudgetQueries({});

    await checkAskBudget('42', undefined);

    const conversationQueries = mockQuery.mock.calls.filter(([sql]) =>
      (sql as string).includes('JOIN tasks t'),
    );
    expect(conversationQueries).toHaveLength(0);
  });

  it('blocks once the monthly budget is used up', async () => {
    routeBudgetQueries({ sentThisMonth: 30 });

    const out = await checkAskBudget('42', undefined);

    expect(out).toEqual({ allowed: false, reason: 'monthly_budget_reached' });
  });

  it('steps the monthly budget down as fatigue signals accumulate', async () => {
    // Base 30, one ignored ask removes 5 -> effective budget 25.
    routeBudgetQueries({ sentThisMonth: 25, asksIgnored: 1 });

    const out = await checkAskBudget('42', undefined);

    // And it says WHICH cap bit: the budget was narrowed, not spent.
    expect(out).toEqual({ allowed: false, reason: 'fatigue_budget_exhausted' });
  });

  it('a user who has not hit fatigue keeps the full base budget', async () => {
    routeBudgetQueries({ sentThisMonth: 29 });

    const out = await checkAskBudget('42', undefined);

    expect(out).toEqual({ allowed: true });
  });
});

describe('checkFollowUpBudget — a relayed conversation may continue (ticket 9 task 12)', () => {
  it('allows the next message while the day still has room', async () => {
    mockQuery.mockResolvedValue(rows([{ count: '1' }]) as never);

    expect(await checkFollowUpBudget('42', 7, 3)).toEqual({ allowed: true });
  });

  it('counts this sender, this person and this goal — nobody else’s day', async () => {
    mockQuery.mockResolvedValue(rows([{ count: '0' }]) as never);

    await checkFollowUpBudget('42', 7, 3);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from_user_id = $1::int');
    expect(sql).toContain('to_user_id = $2');
    expect(sql).toContain('task_id = $3');
    expect(sql).toContain("INTERVAL '24 hours'");
    expect(params).toEqual(['42', 7, 3]);
  });

  it('stops at the day’s cap, and the reason says which cap it was', async () => {
    mockQuery.mockResolvedValue(
      rows([{ count: String(RELAY_MESSAGES_PER_PERSON_PER_DAY) }]) as never,
    );

    expect(await checkFollowUpBudget('42', 7, 3)).toEqual({
      allowed: false,
      reason: 'person_daily_relay_limit_reached',
    });
  });

  it('never reads the monthly growth budget — a follow-up is not outreach', async () => {
    mockQuery.mockResolvedValue(rows([{ count: '0' }]) as never);

    await checkFollowUpBudget('42', 7, 3);

    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("date_trunc('month'"))).toBe(
      false,
    );
  });
});

describe('the growth budget counts outreach only (ticket 9 task 12)', () => {
  it('excludes follow-ups from the month and from the per-conversation floor', async () => {
    routeBudgetQueries({});

    await checkAskBudget('42', 555);

    const conversation = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('JOIN tasks t'),
    ) as [string, unknown[]];
    const month = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("date_trunc('month'"),
    ) as [string, unknown[]];
    expect(conversation[0]).toContain('is_follow_up = FALSE');
    expect(month[0]).toContain('is_follow_up = FALSE');
  });
});

describe('fatigue is about the network’s reaction, not the user’s own inbox (ticket 9 task 17)', () => {
  it('counts only opt-outs by people this sender had just written to', async () => {
    routeBudgetQueries({});

    await checkAskBudget('501', undefined);

    const [sql] = mockQuery.mock.calls.find(([s]) => String(s).includes('ask_optout_events')) as [
      string,
      unknown[],
    ];
    // The recipient's row, tied to an ask FROM this sender in the week before
    // it. The old query read the sender's own opt-out rows — the founder's two
    // "stop asking me" rows from August were being read as evidence that he
    // tires other people out.
    expect(sql).toContain('ta.to_user_id = e.user_id');
    expect(sql).toContain('ta.from_user_id = $1::int');
    // A resumed opt-out is not a standing signal.
    expect(sql).toContain("r.action = 'resume'");
  });

  it('forgets fatigue outside the window — a lifetime counter only ever grows', async () => {
    routeBudgetQueries({});

    await checkAskBudget('501', undefined);

    const [sql, params] = mockQuery.mock.calls.find(([s]) =>
      String(s).includes('ask_optout_events'),
    ) as [string, unknown[]];
    expect(sql).toContain("($2 || ' days')::INTERVAL");
    expect(params[1]).toBe(FATIGUE_WINDOW_DAYS);
  });

  it('never closes the channel completely — the floor survives any amount of fatigue', async () => {
    // Six signals × 5 = 30 = the whole base budget. That is what silenced the
    // founder's account on 1 September, on a month with no asks sent.
    routeBudgetQueries({ asksIgnored: 6, sentThisMonth: 0 });

    expect(await checkAskBudget('501', undefined)).toEqual({ allowed: true });
  });

  it('the floor is a floor, not an allowance — it is spendable and then it stops', async () => {
    routeBudgetQueries({ asksIgnored: 6, sentThisMonth: MIN_MONTHLY_ASK_BUDGET });

    expect(await checkAskBudget('501', undefined)).toEqual({
      allowed: false,
      reason: 'fatigue_budget_exhausted',
    });
  });
});

describe('describeAskBudget — the numbers, readable (ticket 9 task 17)', () => {
  it('shows the arithmetic, both signal kinds and what is left', async () => {
    routeBudgetQueries({ asksIgnored: 2, optOutsCaused: 1, sentThisMonth: 4 });

    const out = await describeAskBudget('501');

    expect(out.fatigue_signals).toEqual({ opt_outs_caused: 1, asks_ignored: 2, total: 3 });
    // 30 − 3 × 5 = 15, of which four are spent.
    expect(out.effective_monthly_budget).toBe(15);
    expect(out.sent_this_month).toBe(4);
    expect(out.remaining_this_month).toBe(11);
    expect(out.window).toBe('calendar_month');
    expect(out.fatigue_window_days).toBe(FATIGUE_WINDOW_DAYS);
    expect(out.window_resets_at).toBe('2026-10-01T00:00:00.000Z');
  });

  it('never reports a negative remainder', async () => {
    routeBudgetQueries({ asksIgnored: 6, sentThisMonth: 40 });

    expect((await describeAskBudget('501')).remaining_this_month).toBe(0);
  });
});
