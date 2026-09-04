jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  checkAskBudget,
  checkFollowUpBudget,
  RELAY_MESSAGES_PER_PERSON_PER_DAY,
} from '../askBudget.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function routeBudgetQueries(opts: {
  inConversation?: number;
  sentThisMonth?: number;
  fatigueSignals?: number;
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('JOIN tasks t'))
      return Promise.resolve(rows([{ count: String(opts.inConversation ?? 0) }]) as never);
    if (sql.includes("date_trunc('month'"))
      return Promise.resolve(rows([{ count: String(opts.sentThisMonth ?? 0) }]) as never);
    if (sql.includes('ask_optout_events'))
      return Promise.resolve(rows([{ count: String(opts.fatigueSignals ?? 0) }]) as never);
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
    // Base 30, one fatigue signal removes 5 -> effective budget 25.
    routeBudgetQueries({ sentThisMonth: 25, fatigueSignals: 1 });

    const out = await checkAskBudget('42', undefined);

    expect(out).toEqual({ allowed: false, reason: 'monthly_budget_reached' });
  });

  it('a user who has not hit fatigue keeps the full base budget', async () => {
    routeBudgetQueries({ sentThisMonth: 29, fatigueSignals: 0 });

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
