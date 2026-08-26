jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { checkAskBudget } from '../askBudget.service';

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
