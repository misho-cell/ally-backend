jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  adminGoalDetail,
  NO_TOKEN_HELD_TAILS,
  NO_TOKEN_PAUSE_LINES,
} from '../goalDashboard.service';
import { scrubMechanicalForStorage } from '../privacyScrub';
import { answerHeldNoTokens } from '../runLanguage';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * The seat's 852, 30 September. Goal 8089's 02:35:57 wake found the wallet
 * empty, wrote one line into the thread and pushed next_wake_at a day on — and
 * the goal's actions list still ended at the 29 Sep wake, so the list alone
 * said the wake never happened. The line in the thread is the only record the
 * engine writes, so the list now reads it.
 */
describe('a wake that paused for tokens is still an action', () => {
  it('matches the line in the form the seat actually read from the database', () => {
    // Quoted from the thread by the seat: the dash is a comma once stored.
    expect(NO_TOKEN_PAUSE_LINES).toContain(
      'I have paused work on this goal, the tokens have run out. I will carry on once it is topped up.',
    );
  });

  it('has one pause line and one held-answer tail per language', () => {
    expect(NO_TOKEN_PAUSE_LINES).toHaveLength(4);
    expect(NO_TOKEN_HELD_TAILS).toHaveLength(4);
  });

  /** The variant that names who answered carries the name first, so only its tail is fixed. */
  it('recognises the held-answer line by its tail whatever the name', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const stored = scrubMechanicalForStorage(answerHeldNoTokens(language, 'Netai Test 3'));
      expect(NO_TOKEN_HELD_TAILS.some((tail) => stored.endsWith(tail))).toBe(true);
    }
  });

  it('passes both lists to the actions query and lists the pause', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('AS owner_name'))
        return Promise.resolve({
          rows: [{ id: 8089, user_id: '171938', stage: 'plan_proposed', status: 'open' }],
          rowCount: 1,
        } as never);
      if (sql.includes('UNION ALL'))
        return Promise.resolve({
          rows: [
            { at: new Date('2026-09-29T02:35:00Z'), kind: 'wake', detail: null, ref_id: 'a' },
            {
              at: new Date('2026-09-30T02:35:57Z'),
              kind: 'paused_no_tokens',
              detail: null,
              ref_id: 'b',
            },
          ],
          rowCount: 2,
        } as never);
      return Promise.resolve({ rows: [], rowCount: 0 } as never);
    });

    const goal = await adminGoalDetail('171938', 8089);

    const actionsCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UNION ALL'));
    expect(String(actionsCall?.[0])).toContain("'paused_no_tokens'");
    expect(actionsCall?.[1]).toEqual(
      expect.arrayContaining([NO_TOKEN_PAUSE_LINES, NO_TOKEN_HELD_TAILS]),
    );
    expect(goal?.actions.map((a) => a.kind)).toEqual(['wake', 'paused_no_tokens']);
  });
});
