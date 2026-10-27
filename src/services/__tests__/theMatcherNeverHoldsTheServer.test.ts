jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { isSureMatch, surePairs, surePairsYielding } from '../needsOffers.service';
import { indexOffers, sureOffersFor } from '../matchIndex';
import { MATCHER_RUN_ON } from '../needsOffers.cron';

/**
 * #7823, OUTAGE 27 Oct ~10:15Z: the hourly matcher compared every goal with
 * every offer in one synchronous loop and the server stopped answering. The
 * offers are now indexed once and the goals scanned in chunks; the answer must
 * be the very same pairs isSureMatch gives.
 */
const TITLES: readonly string[] = [
  'find an investor for a hotel in Kobuleti',
  'ქობულეთში სასტუმროს ვხსნი',
  'სასტუმრო ბათუმში',
  'a hotel in Telavi',
  'a hotel',
  'a lawyer in Batumi',
  'hotel in ბათუმში',
  'I need a good accountant for my company',
  'ვეძებ იურისტს თბილისში',
  'looking for a logistics partner in Poti',
  'ფოთში ვცხოვრობ და ვეძებ ბუღალტერს',
  '',
  'help',
];

const FIELDS: readonly (string | null)[] = [
  'hospitality in Adjara',
  'სტუმართმასპინძლობა აჭარაში',
  'hospitality in Batumi',
  'hospitality',
  'hotel',
  'logistics',
  'law',
  'იურისტი',
  'accounting',
  'ბუღალტერია',
  'in Adjara',
  null,
  '',
];

const goals = TITLES.map((title, i) => ({ id: i + 1, user_id: 100 + (i % 4), title }));
const offers = FIELDS.map((field, i) => ({
  id: 1000 + i,
  user_id: 100 + (i % 5),
  text: 'open to it',
  field,
}));

describe('the matcher’s offer index (#7823)', () => {
  it('finds exactly the pairs isSureMatch finds, in the same order', () => {
    const index = indexOffers(offers);
    for (const goal of goals) {
      const expected = offers.filter((offer) => isSureMatch(goal, offer)).map((o) => o.id);
      expect(sureOffersFor(goal, index).map((o) => o.id)).toEqual(expected);
    }
  });

  it('the whole run gives the same pairs whether scanned at once or in chunks', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({
      ...goals[i % goals.length],
      id: 5000 - i,
    }));
    const atOnce = surePairs(many, offers, 10_000, new Set());
    const chunked = await surePairsYielding(many, offers, 10_000, new Set());
    expect(chunked).toEqual(atOnce);
    expect(atOnce.length).toBeGreaterThan(0);
  });

  it('gives the event loop back while it scans', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ ...goals[0], id: 9000 - i }));
    const yields = jest.spyOn(global, 'setImmediate');
    await surePairsYielding(many, offers, 10_000, new Set());
    expect(yields).toHaveBeenCalledTimes(5);
    yields.mockRestore();
  });

  it('stops at the run’s limit and skips pairs already proposed', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ ...goals[0], id: 7000 - i }));
    await expect(surePairsYielding(many, offers, 5, new Set())).resolves.toHaveLength(5);
    const first = surePairs(many.slice(0, 1), offers, 10, new Set());
    const proposed = new Set(first.map((p) => `${p.goal.id}:${p.offer.id}`));
    expect(surePairs(many.slice(0, 1), offers, 10, proposed)).toEqual([]);
  });

  it('the hourly run is on again', () => {
    expect(MATCHER_RUN_ON).toBe(true);
  });
});
