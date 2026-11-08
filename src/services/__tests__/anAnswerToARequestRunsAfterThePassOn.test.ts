const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { runAnswersAfterTheRest } from '../chat.service';
import { goBetweensLinesSinceAsked } from '../introResponse';

beforeEach(() => jest.resetAllMocks());

/**
 * Tester's report 8 Nov, C5: „ask Nana" became a pass-on and a yes in one turn;
 * they ran together and the yes handed over the owner's own number.
 */
describe('an answer to an introduction request', () => {
  it('runs after the turn’s other calls, and results keep the calls’ order', async () => {
    const order: string[] = [];
    let passOnDone = false;
    const run = async (b: { name: string }): Promise<string> => {
      if (b.name === 'request_introduction') {
        await new Promise((r) => setTimeout(r, 5));
        passOnDone = true;
      }
      if (b.name === 'respond_to_introduction') order.push(`respond saw pass-on: ${passOnDone}`);
      return b.name;
    };
    const blocks = [{ name: 'respond_to_introduction' }, { name: 'request_introduction' }];
    expect(await runAnswersAfterTheRest(blocks, run)).toEqual([
      'respond_to_introduction',
      'request_introduction',
    ]);
    expect(order).toEqual(['respond saw pass-on: true']);
  });
});

describe('the go-between’s own lines', () => {
  it('are read from the request’s card thread when the request has no ask thread', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 81 }] })
      .mockResolvedValueOnce({ rows: [{ content: 'ახალი ნომერი აქვს' }] });
    const lines = await goBetweensLinesSinceAsked({
      id: 11980,
      mediator_user_id: 7,
      mediator_thread_id: null,
      created_at: '2026-11-07T19:38:00Z',
    });
    expect(lines).toBe('ახალი ნომერი აქვს');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('introduction_request_id = $1 AND user_id = $2');
    expect(params).toEqual([11980, 7]);
    expect((mockQuery.mock.calls[1] as [string, unknown[]])[1][0]).toBe(81);
  });
});
