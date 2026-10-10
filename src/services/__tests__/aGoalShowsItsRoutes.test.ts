jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  routesForThread,
  RouteRole,
  RouteState,
  SUMMARY_MAX_CHARS,
  summaryOf,
} from '../routesBoard.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const OWNER = 171;
const THREAD = 48722;

const ask = (id: number, extra: Record<string, unknown>): Record<string, unknown> => ({
  id,
  name: `Person ${id}`,
  status: 'sent',
  answer: null,
  declined_at: null,
  seen_at: null,
  later_until: null,
  expired_at: null,
  updated_at: '2026-10-10T06:00:00Z',
  ...extra,
});

/** D722, the frontend's 06:30Z item 2: the routes board of a goal's conversation. */
describe('the routes board', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists every person the goal talks to, with role and state', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 23834 }] } as never)
      .mockResolvedValueOnce({
        rows: [
          ask(1, {}),
          ask(2, { status: 'answered', answer: 'კი, ვიცნობ ერთს' }),
          ask(3, { status: 'answered', declined_at: '2026-10-10T05:00:00Z' }),
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 9,
            name: 'გელა',
            status: 'accepted',
            target_name: 'ნანა',
            updated_at: '2026-10-10T05:30:00Z',
          },
        ],
      } as never);
    const routes = await routesForThread(OWNER, THREAD);
    expect(routes.map((r) => [r.person_name, r.role, r.state])).toEqual([
      ['Person 1', RouteRole.Addressee, RouteState.Waiting],
      ['Person 2', RouteRole.Addressee, RouteState.Answered],
      ['Person 3', RouteRole.Addressee, RouteState.Declined],
      ['გელა', RouteRole.Mediator, RouteState.Confirmed],
    ]);
    expect(routes[1].summary).toBe('კი, ვიცნობ ერთს');
    const [goalSql, goalParams] = mockQuery.mock.calls[0];
    expect(String(goalSql)).toContain('th.user_id = $2');
    expect(goalParams).toEqual([THREAD, OWNER]);
    expect(String(mockQuery.mock.calls[1][0])).toContain('ta.parent_ask_id IS NULL');
  });

  it('draws no board for one person, and none for a conversation that is not theirs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [ask(1, {})] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(routesForThread(OWNER, THREAD)).resolves.toEqual([]);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(routesForThread(OWNER, 1)).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('shows an answer the way the owner reads it, cut short', () => {
    expect(summaryOf(null)).toBeNull();
    expect(summaryOf('   ')).toBeNull();
    expect(summaryOf('x'.repeat(500))).toHaveLength(SUMMARY_MAX_CHARS);
  });
});
