jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { lastThreadWeWroteAbout } from '../whatsappChannel.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * #8813 (the founder on WhatsApp, tester 82700): he asked whether his messages
 * were switched on, and the line landed in another member's question thread —
 * the last conversation we had written to him about. An unquoted line now
 * goes only to a conversation of his own.
 */
describe('#8813: an unquoted WhatsApp line stays in the owner’s own conversation', () => {
  beforeEach(() => mockQuery.mockReset());

  it('looks only at the owner’s own regular conversations', async () => {
    mockQuery.mockResolvedValue({ rows: [{ thread_id: 41 }] } as never);

    expect(await lastThreadWeWroteAbout(7)).toBe(41);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN threads t ON t\.id = m\.thread_id AND t\.user_id = m\.user_id/);
    expect(sql).toContain('t.type = $2');
    expect(params).toEqual([7, 'regular']);
  });

  it('falls through to the owner’s default chat when no own conversation was written about', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    expect(await lastThreadWeWroteAbout(7)).toBeNull();
  });
});
