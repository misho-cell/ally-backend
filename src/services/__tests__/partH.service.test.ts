jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

import { query, withTransaction } from '../../db/postgres/client';
import { getNextQuestion, recordAnswer } from '../partH.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockTx = withTransaction as jest.MockedFunction<typeof withTransaction>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

// Shape matches the REAL 43-row bank (24 Aug load), not an invented one: a
// multi-select question with `_by_count` scoring, exactly like the bank's
// onb_primary_goal_001.
const MULTI_COUNT_ROW = {
  question_id: 'q1',
  category: 'goals',
  surface: 'any',
  prompt_ka: 'რომელი ტიპის ხალხი გჭირდება ახლა?',
  prompt_es: null,
  prompt_en: 'Which kind of people do you need now?',
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'other', free_text: true }],
  score_vector: {
    _by_count: {
      '1': { goal_clarity: 0.7 },
      '2': { goal_clarity: 0.3 },
      '3': { goal_clarity: -0.1 },
    },
  },
  immediate_use: 'Your first shortlist is built from this, before you type anything.',
  immediate_use_ka: null,
  immediate_use_es: null,
  immediate_use_en: null,
  select_mode: 'multi',
  select_max: 3,
  goal_bound: false,
};

// A single-select row whose score_vector is FLAT — the real bank's dominant
// shape (41 of 43 rows): the delta applies once, the same regardless of
// which option was picked. My first version of this code assumed per-option
// deltas and would have scored nothing on rows shaped exactly like this one.
const FLAT_SINGLE_ROW = {
  question_id: 'q12',
  category: 'goal',
  surface: 'any',
  prompt_ka: 'ახლა რომელი ტიპის ხალხი გჭირდება მეტად?',
  prompt_es: null,
  prompt_en: 'Which kind of people do you need most right now?',
  options: [{ id: 'clients' }, { id: 'investors' }, { id: 'other', free_text: true }],
  score_vector: { goal_clarity: 0.2 },
  immediate_use: "This week's shortlist tilts toward that kind of person.",
  immediate_use_ka: null,
  immediate_use_es: null,
  immediate_use_en: null,
  select_mode: 'single',
  select_max: null,
  goal_bound: true,
};

const txClient = { query: jest.fn().mockResolvedValue(rows([])) };

beforeEach(() => {
  jest.clearAllMocks();
  txClient.query.mockClear();
  mockTx.mockImplementation(async (cb) => cb(txClient as never) as never);
});

describe('recordAnswer (C9.2, C9.4)', () => {
  it('refuses a FOURTH pick on a max-3 multi question', async () => {
    mockQuery.mockResolvedValue(rows([MULTI_COUNT_ROW]) as never);

    const out = await recordAnswer('7', { questionId: 'q1', optionIds: ['a', 'b', 'c', 'd'] });

    expect(out.recorded).toBe(false);
    expect(out.error).toContain('at most 3');
    expect(mockTx).not.toHaveBeenCalled();
  });

  it('a single-select question still allows exactly one', async () => {
    mockQuery.mockResolvedValue(rows([FLAT_SINGLE_ROW]) as never);

    const one = await recordAnswer('7', { questionId: 'q12', optionIds: ['clients'] });
    expect(one.recorded).toBe(true);

    const two = await recordAnswer('7', { questionId: 'q12', optionIds: ['clients', 'investors'] });
    expect(two.recorded).toBe(false);
  });

  it('scores by COUNT on the _by_count multi question — one pick means clarity', async () => {
    mockQuery.mockResolvedValue(rows([MULTI_COUNT_ROW]) as never);

    const out = await recordAnswer('7', { questionId: 'q1', optionIds: ['a'] });

    expect(out.recorded).toBe(true);
    const dimWrite = txClient.query.mock.calls.find((c) =>
      (c[0] as string).includes('profile_dimensions'),
    );
    expect(dimWrite?.[1]).toEqual(['7', 'goal_clarity', 0.7, 1, -1]);
  });

  it('three picks on the same question score the OPPOSITE way — still looking around', async () => {
    mockQuery.mockResolvedValue(rows([MULTI_COUNT_ROW]) as never);

    await recordAnswer('7', { questionId: 'q1', optionIds: ['a', 'b', 'c'] });

    const dimWrite = txClient.query.mock.calls.find((c) =>
      (c[0] as string).includes('profile_dimensions'),
    );
    expect(dimWrite?.[1]).toEqual(['7', 'goal_clarity', -0.1, 1, -1]);
  });

  it("applies the FLAT score_vector once, the same regardless of which option was picked — the real bank's dominant shape", async () => {
    mockQuery.mockResolvedValue(rows([FLAT_SINGLE_ROW]) as never);

    const out = await recordAnswer('7', { questionId: 'q12', optionIds: ['investors'] });

    expect(out.recorded).toBe(true);
    expect(out.dimensions_moved).toEqual(['goal_clarity']);
    const dimWrite = txClient.query.mock.calls.find((c) =>
      (c[0] as string).includes('profile_dimensions'),
    );
    // 0.2 either way — "clients" would score identically. That IS the shape.
    expect(dimWrite?.[1]).toEqual(['7', 'goal_clarity', 0.2, 1, -1]);
  });

  it('„სხვა" with free text stores the text and moves NO dimension (C9.4)', async () => {
    mockQuery.mockResolvedValue(rows([MULTI_COUNT_ROW]) as never);

    const out = await recordAnswer('7', {
      questionId: 'q1',
      optionIds: ['other'],
      freeText: 'ჩემი ვარიანტი',
    });

    expect(out.recorded).toBe(true);
    expect(out.dimensions_moved).toEqual([]);
    expect(
      txClient.query.mock.calls.some((c) => (c[0] as string).includes('profile_dimensions')),
    ).toBe(false);
    const insert = txClient.query.mock.calls.find((c) =>
      (c[0] as string).includes('INSERT INTO answer_events'),
    );
    expect(insert?.[1]).toContain('ჩემი ვარიანტი');
  });

  it('supersede: flips the previous current row before inserting, one transaction', async () => {
    mockQuery.mockResolvedValue(rows([MULTI_COUNT_ROW]) as never);

    await recordAnswer('7', { questionId: 'q1', optionIds: ['a'] });

    const calls = txClient.query.mock.calls.map((c) => c[0] as string);
    const flip = calls.findIndex((sql) => sql.includes('SET is_current = FALSE'));
    const insert = calls.findIndex((sql) => sql.includes('INSERT INTO answer_events'));
    expect(flip).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(flip);
  });
});

describe('getNextQuestion (C9.1, C9.3)', () => {
  it('a goal_bound question names the active goal in the prompt', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb'))
        return Promise.resolve(rows([FLAT_SINGLE_ROW]) as never);
      if (sql.includes('FROM tasks'))
        return Promise.resolve(rows([{ title: 'კლიენტების პოვნა' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'ka');

    expect(out.found).toBe(true);
    if (out.found) {
      expect(out.question.prompt.startsWith('[კლიენტების პოვნა] — ')).toBe(true);
      // C9.1 + the real load's shape: immediate_use_ka is NULL today (English
      // only, by the founder's decision) — the base immediate_use column is
      // the fallback for every language, not just English.
      expect(out.question.immediate_use).toBe(
        "This week's shortlist tilts toward that kind of person.",
      );
    }
  });

  it('a goal_bound question is SKIPPED, never asked bare, when no goal is open', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb'))
        return Promise.resolve(rows([FLAT_SINGLE_ROW]) as never);
      if (sql.includes('FROM tasks')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'ka');

    expect(out.found).toBe(false);
  });

  it('immediate_use falls back to the base column in English too', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb'))
        return Promise.resolve(rows([MULTI_COUNT_ROW]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'en');

    expect(out.found).toBe(true);
    if (out.found) {
      expect(out.question.immediate_use).toBe(
        'Your first shortlist is built from this, before you type anything.',
      );
    }
  });

  it("a cleared immediate_use_ka ('', not null — the PUT editor's clear semantics) still falls back, live-caught on col_avoid_intro_704", async () => {
    const clearedRow = { ...FLAT_SINGLE_ROW, immediate_use_ka: '' };
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb'))
        return Promise.resolve(rows([clearedRow]) as never);
      if (sql.includes('FROM tasks')) return Promise.resolve(rows([{ title: 'x' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'ka');

    expect(out.found).toBe(true);
    if (out.found) {
      expect(out.question.immediate_use).toBe(
        "This week's shortlist tilts toward that kind of person.",
      );
    }
  });

  it('empty bank returns found:false, never a 500', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await getNextQuestion('7', 'any', 'en');

    expect(out).toEqual({ found: false });
  });

  it("an exact surface match outranks 'any' in the ORDER BY — live-caught: three different moments all returned the same 'any' row", async () => {
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb')) {
        expect(sql).toContain('(qb.surface = $2) DESC');
        expect(params).toEqual(['7', 'weekly_review', null, 'ka']);
        return Promise.resolve(rows([]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    await getNextQuestion('7', 'weekly_review', 'ka');
  });

  it('a language with no prompt text is excluded in SQL, not silently rendered in Georgian', async () => {
    // FLAT_SINGLE_ROW has prompt_es: null. Asking in Spanish must filter it
    // out at the query level — the founder's ruling: skip, never substitute.
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb')) {
        expect(sql).toContain("$4 = 'ka'");
        expect(params).toEqual(['7', 'any', null, 'es']);
        // The mock stands in for the DB's own filter: a real Postgres would
        // have excluded FLAT_SINGLE_ROW here since prompt_es IS NULL.
        return Promise.resolve(rows([]) as never);
      }
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'es');

    expect(out).toEqual({ found: false });
  });
});
