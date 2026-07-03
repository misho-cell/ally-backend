jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  clearPriceCache,
  getPrice,
  recordClaudeUsage,
  recordFixedUsage,
  resolveUserIdByPhone,
} from '../costLedger.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const PRICES: Record<string, number> = {
  'anthropic.claude-sonnet-4-6.input_mtok': 3,
  'anthropic.claude-sonnet-4-6.output_mtok': 15,
  'anthropic.claude-sonnet-4-6.cache_write_mtok': 3.75,
  'anthropic.claude-sonnet-4-6.cache_read_mtok': 0.3,
  'tavily.search': 0.008,
};

function routeQueries(): { insertCalls: () => unknown[][] } {
  const inserts: unknown[][] = [];
  mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('FROM provider_prices')) {
      const key = (params as string[])[0];
      const value = PRICES[key];
      return Promise.resolve(
        (value === undefined ? rows([]) : rows([{ value: String(value) }])) as never,
      );
    }
    if (sql.includes('INSERT INTO usage_events')) {
      inserts.push(params ?? []);
      return Promise.resolve(rows([]) as never);
    }
    if (sql.includes('FROM "UserPhone"')) {
      return Promise.resolve(rows([{ userId: 42 }]) as never);
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { insertCalls: () => inserts };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPriceCache();
});

describe('getPrice', () => {
  it('returns the stored price and caches it', async () => {
    routeQueries();

    expect(await getPrice('tavily.search')).toBe(0.008);
    expect(await getPrice('tavily.search')).toBe(0.008);

    // Second call served from cache — only one DB hit.
    const priceLookups = mockQuery.mock.calls.filter((c) =>
      (c[0] as string).includes('provider_prices'),
    );
    expect(priceLookups).toHaveLength(1);
  });

  it('returns 0 for unknown keys instead of throwing', async () => {
    routeQueries();

    expect(await getPrice('nonexistent.key')).toBe(0);
  });
});

describe('recordClaudeUsage', () => {
  it('computes cost from exact token counts and rates', async () => {
    const { insertCalls } = routeQueries();

    await recordClaudeUsage({
      userId: '7',
      kind: 'chat',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 50_000, output_tokens: 3_000 },
      runId: 'run-1',
      threadId: 9,
    });

    const params = insertCalls()[0];
    // 50k in × $3/M + 3k out × $15/M = 0.15 + 0.045 = 0.195
    expect(params).toEqual([
      '7',
      'chat',
      'claude-sonnet-4-6',
      50_000,
      3_000,
      0,
      0,
      0.195,
      'run-1',
      9,
    ]);
  });

  it('includes cache token costs when present', async () => {
    const { insertCalls } = routeQueries();

    await recordClaudeUsage({
      userId: '7',
      kind: 'chat',
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 1_000,
        output_tokens: 0,
        cache_creation_input_tokens: 100_000,
        cache_read_input_tokens: 1_000_000,
      },
    });

    const params = insertCalls()[0];
    // 1k×3/M + 100k×3.75/M + 1M×0.30/M = 0.003 + 0.375 + 0.30 = 0.678
    expect(params[7]).toBe(0.678);
  });
});

describe('recordFixedUsage', () => {
  it('multiplies units by the unit price', async () => {
    const { insertCalls } = routeQueries();

    await recordFixedUsage({
      userId: null,
      kind: 'web_search',
      provider: 'tavily',
      priceKey: 'tavily.search',
      units: 3,
    });

    const params = insertCalls()[0];
    expect(params).toEqual([null, 'web_search', 'tavily', null, 3, 0.024, null]);
  });
});

describe('resolveUserIdByPhone', () => {
  it('returns the user id as a string when registered', async () => {
    routeQueries();

    expect(await resolveUserIdByPhone('+995599000001')).toBe('42');
  });
});
