jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

import { query } from '../../db/postgres/client';
import { getThreadsForUser, SHOWN_TO_A_PERSON } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * 5284 (Lika, 15 Oct): „[მოვლენა]" in the conversation list. The preview of a
 * thread was its newest row of any kind, and an engine turn is a row.
 */
describe('the conversation list preview', () => {
  it('is read only from rows written for a person', async () => {
    await getThreadsForUser('501');
    const sql = mockQuery.mock.calls
      .map(([q]) => String(q))
      .find((q) => q.includes(') lm ON true'));
    expect(sql).toBeDefined();
    const preview = String(sql).slice(0, String(sql).indexOf(') lm ON true'));
    expect(preview.slice(preview.lastIndexOf('LEFT JOIN LATERAL'))).toContain(
      "kind IN ('message', 'pending', 'error')",
    );
  });

  it('shares its kinds with the chat itself, and an engine turn is not one', () => {
    expect(SHOWN_TO_A_PERSON).toEqual(['message', 'pending', 'error']);
    expect(SHOWN_TO_A_PERSON).not.toContain('event');
  });
});
