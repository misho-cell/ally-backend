jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { deleteAnswerRule, pickRule, ruleCoverage, saveAnswerRule } from '../answerRules.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[], rowCount = data.length): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount };
}

const BMW = {
  kind: 'ვინ არის კარგი BMW-ს ხელოსანი',
  sample_question: 'BMW-ს კარგი ხელოსანი ხომ არ იცი?',
};
const DENTIST = { kind: 'სტომატოლოგის რჩევა', sample_question: 'კარგი სტომატოლოგი ხომ არ იცი?' };

beforeEach(() => jest.clearAllMocks());

describe('does a rule cover a question (D120: "similar questions")', () => {
  it('the same question, differently inflected, is covered', () => {
    expect(ruleCoverage('BMW-ს ხელოსანს ვეძებ, კარგი ხომ არ იცი?', BMW)).toBeGreaterThanOrEqual(
      0.6,
    );
  });

  it('a question sharing one word is not — one word is not a kind', () => {
    expect(ruleCoverage('კარგი რესტორანი ხომ არ იცი ვაკეში?', BMW)).toBe(0);
  });

  it('a different kind of question picks a different rule, or none', () => {
    expect(pickRule('სტომატოლოგი მჭირდება, კარგი ხომ არ იცი?', [BMW, DENTIST])).toBe(DENTIST);
    expect(pickRule('ბათუმში ფოტოგრაფი ხომ არ იცი?', [BMW, DENTIST])).toBeNull();
  });

  it('an empty question is covered by nothing', () => {
    expect(pickRule('', [BMW])).toBeNull();
  });
});

describe('the rule store', () => {
  it('needs a kind, a question and an answer', async () => {
    const out = await saveAnswerRule('7', '   ', 'q', 'a');
    expect(out.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('writes the rule against the user', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ n: '3' }]) as never).mockResolvedValueOnce(
      rows([
        {
          id: 9,
          user_id: 7,
          kind: BMW.kind,
          sample_question: BMW.sample_question,
          answer: 'ლევანი, +995…',
          active: true,
          uses: 0,
          last_used_at: null,
          created_at: 'x',
        },
      ]) as never,
    );

    const out = await saveAnswerRule('7', BMW.kind, BMW.sample_question, 'ლევანი ჯანელიძე');

    expect(out.ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO answer_rules');
    expect(params).toEqual(['7', BMW.kind, BMW.sample_question, 'ლევანი ჯანელიძე']);
  });

  it('refuses a fifty-first active rule', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ n: '50' }]) as never);
    const out = await saveAnswerRule('7', BMW.kind, BMW.sample_question, 'a');
    expect(out).toEqual({ ok: false, error: 'at most 50 active rules' });
  });

  it('delete deactivates, scoped to the owner', async () => {
    mockQuery.mockResolvedValueOnce(rows([], 1) as never);
    expect(await deleteAnswerRule('7', 9)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET active = FALSE');
    expect(params).toEqual([9, '7']);
  });
});
