jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { MessageKind, setUserMessageKind } from '../messageKind.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/** §86 — thread 30493's leaked „[მოვლენა]" bubble, moved by its id. */
describe('moving one named owner-role message', () => {
  it('hides it as an event and reports what it was', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'abc', was: 'message' }] } as never);

    expect(await setUserMessageKind(30493, 'abc', MessageKind.Event)).toEqual({
      id: 'abc',
      thread_id: 30493,
      was: 'message',
      now: 'event',
    });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("role = 'user'");
    expect(String(sql)).toContain("kind IN ('message', 'event')");
    expect(params).toEqual([30493, 'abc', 'event']);
  });

  it('answers null when that thread holds no such row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await setUserMessageKind(1, 'nope', MessageKind.Message)).toBeNull();
  });
});
