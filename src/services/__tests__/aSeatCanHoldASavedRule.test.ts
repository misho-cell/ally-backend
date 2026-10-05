jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  addSeatAnswerRule,
  SeatRuleRefusal,
  setSeatAnswerRuleActive,
} from '../seatAnswerRules.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const RULE = {
  kind: 'A lawyer for a land sale',
  sampleQuestion: 'Do you know a lawyer for selling land?',
  answer: 'Nino Lawyer, Fiction 0123',
};

beforeEach(() => jest.clearAllMocks());

/** §92 (Misho, 5 Oct): a saved rule on a test seat, so the catch-all fix can be tested on fictions. */
describe('a saved rule on a test seat', () => {
  it('is written onto a test seat', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 176606 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: '91' }] } as never);
    await expect(addSeatAnswerRule(176606, RULE)).resolves.toEqual({
      ok: true,
      rule_id: 91,
      active: true,
    });
    const [sql, params, timeout] = mockQuery.mock.calls[1];
    expect(String(sql)).toContain('INSERT INTO answer_rules');
    expect(params).toEqual([176606, RULE.kind, RULE.sampleQuestion, RULE.answer]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('is refused for any account that is not a test seat, before any write', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(addSeatAnswerRule(501, RULE)).resolves.toEqual({
      ok: false,
      refusal: SeatRuleRefusal.NotATestSeat,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('needs all three texts', async () => {
    await expect(addSeatAnswerRule(176606, { ...RULE, answer: ' ' })).resolves.toEqual({
      ok: false,
      refusal: SeatRuleRefusal.Empty,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is switched off by the undo, only on that seat', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 176606 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: '91' }] } as never);
    await expect(setSeatAnswerRuleActive(176606, 91, false)).resolves.toEqual({
      ok: true,
      rule_id: 91,
      active: false,
    });
    expect(String(mockQuery.mock.calls[1][0])).toContain('WHERE id = $2 AND user_id = $1');
  });

  it('says so when the seat holds no such rule', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 176606 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(setSeatAnswerRuleActive(176606, 5, false)).resolves.toEqual({
      ok: false,
      refusal: SeatRuleRefusal.NoSuchRule,
    });
  });

  it('is reached through two validated admin routes', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("'/test-accounts/:id/answer-rules'");
    expect(admin).toContain("'/test-accounts/:id/answer-rules/:ruleId'");
  });
});
