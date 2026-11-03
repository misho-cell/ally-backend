jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { factsAdded, endorsementAdded } from '../helpersVoice';
import { helpersWordsSinceAsk } from '../taskAsks.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const ASK_THREAD = 63000;
const EARLIER = 'სახლი 400 მ², ეზო 1000 მ², ფასი 375 000 დოლარი. რეკომენდაციას ვუწევ.';
const LATEST = 'კი, დააკავშირე ბროკერებთან.';
const SENT =
  'ნინო, თორნიკე რეკომენდაციას უწევს გიორგის. სახლი 400 მ², ეზო 1000 მ², ფასი 375 000 დოლარი.';

beforeEach(() => mockQuery.mockReset());

/**
 * Ops' daily check (3 Nov 18:19Z, 18:27Z): the helper's price and recommendation
 * were in an earlier message than their latest one, and the answer was refused
 * twice as if the assistant had added them.
 */
describe('an earlier line of the helper vouches for the answer', () => {
  it('reads every helper line since the ask, oldest first', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ content: LATEST }, { content: EARLIER }] } as never);
    await expect(helpersWordsSinceAsk(ASK_THREAD)).resolves.toBe(`${EARLIER}\n${LATEST}`);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toContain("role = 'user'");
    expect(sql).toContain('FROM task_asks WHERE ask_thread_id = $1');
  });

  it('lets the price and the recommendation through when an earlier line holds them', () => {
    const vouched = `${LATEST}\n${EARLIER}`;
    expect(factsAdded(vouched, 'ვინ იცნობს ბროკერებს?', SENT)).toEqual([]);
    expect(endorsementAdded(vouched, SENT)).toEqual([]);
  });

  it('still refuses a number nobody wrote', () => {
    expect(factsAdded(`${LATEST}\n${EARLIER}`, 'ვინ?', `${SENT} ტელეფონი 599`)).not.toEqual([]);
  });
});
