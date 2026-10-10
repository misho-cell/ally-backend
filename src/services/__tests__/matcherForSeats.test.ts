jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
}));
jest.mock('../matchFlow.service', () => ({
  deliverDueCards: jest.fn(() => Promise.resolve(1)),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { deliverDueCards } from '../matchFlow.service';
import { MAX_SEATS_PER_RUN, runMatcherForSeats, SeatMatchOutcome } from '../needsOffers.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCards = deliverDueCards as jest.MockedFunction<typeof deliverDueCards>;

/** 1699 (tester 50557): the night's matcher and card 1, now, on test seats only. */
describe('the matcher run on test seats', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCards.mockClear();
  });

  it('refuses no seats, or more than a handful, without reading anything', async () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_RUN + 1 }, (_, i) => i + 1);
    for (const seats of [[], tooMany]) {
      await expect(runMatcherForSeats(seats)).resolves.toEqual({
        outcome: SeatMatchOutcome.BadInput,
        proposed: 0,
        cards: 0,
      });
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses when any seat is not a test seat, and writes nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 1 }] } as never);
    await expect(runMatcherForSeats([181341, 181343])).resolves.toEqual({
      outcome: SeatMatchOutcome.NotATestSeat,
      proposed: 0,
      cards: 0,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockCards).not.toHaveBeenCalled();
  });

  it('reads only these seats’ offers and goals, proposes the sure pair, and sends their card 1', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: 2 }] } as never)
      .mockResolvedValueOnce({
        rows: [{ id: 100, user_id: 181341, text: 'hotel work', field: 'hospitality' }],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ id: 24026, user_id: 181343, title: 'hospitality: hotel management in Adjara' }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: 9 }] } as never);

    const run = await runMatcherForSeats([181341, 181343, 181343]);

    const [offersSql, offersParams] = mockQuery.mock.calls[1];
    expect(String(offersSql)).toContain('user_id = ANY($2::int[])');
    expect(offersParams).toEqual([expect.any(Number), [181341, 181343]]);
    const [, goalsParams] = mockQuery.mock.calls[2];
    expect(goalsParams).toEqual([expect.any(Number), ['181341', '181343']]);
    expect(mockCards).toHaveBeenCalledWith([181341, 181343]);
    expect(run.outcome).toBe(SeatMatchOutcome.Ran);
    expect(run.cards).toBe(1);
  });
});

describe('the route', () => {
  it('is POST /admin/matcher-runs, refusing with 400 and 403 before any run', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.post('/matcher-runs'");
    expect(routes).toContain('[SeatMatchOutcome.BadInput]: {\n    status: 400');
    expect(routes).toContain('[SeatMatchOutcome.NotATestSeat]: {\n    status: 403');
  });
});
