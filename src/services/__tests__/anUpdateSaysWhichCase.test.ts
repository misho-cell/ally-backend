const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { caseRefsFor } from '../pendingUpdates.service';

/** #6769 (Giorgi, G-148): each update says which case it belongs to, and opens it. */
describe('the case an update belongs to', () => {
  it('is the goal’s conversation and its short title, read once', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 900, thread_id: 61001, case_title: 'ბუღალტერი ფირმისთვის' }],
    });
    const refs = await caseRefsFor([900, null, 900]);
    expect(refs.get(900)).toEqual({ threadId: 61001, caseTitle: 'ბუღალტერი ფირმისთვის' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][1]).toEqual([[900]]);
  });

  it('reads nothing when no update has a goal', async () => {
    expect((await caseRefsFor([null])).size).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
