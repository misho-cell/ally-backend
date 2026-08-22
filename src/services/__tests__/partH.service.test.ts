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

const BANK_ROW = {
  question_id: 'q1',
  category: 'goals',
  surface: 'any',
  prompt_ka: 'რომელი ტიპის ხალხი გჭირდება ახლა?',
  prompt_es: null,
  prompt_en: 'Which kind of people do you need now?',
  options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'other', free_text: true }],
  score_vector: {
    a: { goal_clarity: 0.5 },
    _by_count: {
      '1': { goal_clarity: 0.7 },
      '2': { goal_clarity: 0.3 },
      '3': { goal_clarity: -0.1 },
    },
  },
  immediate_use: 'internal note',
  immediate_use_ka: 'ამით ზუსტად მივხვდები, ვის შემოგთავაზებ პირველად',
  immediate_use_es: null,
  immediate_use_en: 'This tells me whom to suggest first',
  select_mode: 'multi',
  select_max: 3,
  goal_bound: false,
};

const txClient = { query: jest.fn().mockResolvedValue(rows([])) };

beforeEach(() => {
  jest.clearAllMocks();
  txClient.query.mockClear();
  mockTx.mockImplementation(async (cb) => cb(txClient as never) as never);
});

describe('recordAnswer (C9.2, C9.4)', () => {
  it('refuses a FOURTH pick on a max-3 multi question', async () => {
    mockQuery.mockResolvedValue(rows([BANK_ROW]) as never);

    const out = await recordAnswer('7', { questionId: 'q1', optionIds: ['a', 'b', 'c', 'd'] });

    expect(out.recorded).toBe(false);
    expect(out.error).toContain('at most 3');
    expect(mockTx).not.toHaveBeenCalled();
  });

  it('a single-select question still allows exactly one', async () => {
    mockQuery.mockResolvedValue(
      rows([{ ...BANK_ROW, question_id: 'q12', select_mode: 'single', select_max: null }]) as never,
    );

    const one = await recordAnswer('7', { questionId: 'q12', optionIds: ['a'] });
    expect(one.recorded).toBe(true);

    const two = await recordAnswer('7', { questionId: 'q12', optionIds: ['a', 'b'] });
    expect(two.recorded).toBe(false);
  });

  it('scores by COUNT on the multi question — one pick means clarity', async () => {
    mockQuery.mockResolvedValue(rows([BANK_ROW]) as never);

    const out = await recordAnswer('7', { questionId: 'q1', optionIds: ['a'] });

    expect(out.recorded).toBe(true);
    const dimWrite = txClient.query.mock.calls.find((c) =>
      (c[0] as string).includes('profile_dimensions'),
    );
    expect(dimWrite?.[1]).toEqual(['7', 'goal_clarity', 0.7, 1, -1]);
  });

  it('„სხვა" with free text stores the text and moves NO dimension (C9.4)', async () => {
    mockQuery.mockResolvedValue(rows([BANK_ROW]) as never);

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
    mockQuery.mockResolvedValue(rows([BANK_ROW]) as never);

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
        return Promise.resolve(rows([{ ...BANK_ROW, goal_bound: true }]) as never);
      if (sql.includes('FROM tasks'))
        return Promise.resolve(rows([{ title: 'კლიენტების პოვნა' }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'ka');

    expect(out.found).toBe(true);
    if (out.found) {
      expect(out.question.prompt.startsWith('[კლიენტების პოვნა] — ')).toBe(true);
      // C9.1: the payoff line rides WITH the question, in the user's language.
      expect(out.question.immediate_use).toBe('ამით ზუსტად მივხვდები, ვის შემოგთავაზებ პირველად');
    }
  });

  it('a goal_bound question is SKIPPED, never asked bare, when no goal is open', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('ORDER BY ae.asked_at')) return Promise.resolve(rows([]) as never);
      if (sql.includes('FROM question_bank qb'))
        return Promise.resolve(rows([{ ...BANK_ROW, goal_bound: true }]) as never);
      if (sql.includes('FROM tasks')) return Promise.resolve(rows([]) as never);
      return Promise.resolve(rows([]) as never);
    });

    const out = await getNextQuestion('7', 'any', 'ka');

    expect(out.found).toBe(false);
  });

  it('empty bank returns found:false, never a 500', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    const out = await getNextQuestion('7', 'any', 'en');

    expect(out).toEqual({ found: false });
  });
});
