import {
  ownerNamedAGoBetween,
  personWithSeveralRoutes,
  ROUTE_PICK_WINDOW_MS,
  routesFromFound,
  routesFromWarmPath,
  routesWereOffered,
  SEVERAL_ROUTES_LINE,
} from '../severalRoutes';

const NANA = '+995555000101';
const GELA = '+995555000102';
const OTHER = '+995555000103';

/** #6367 / #5251 (Misho's (a), 21 Oct): several routes → findings and routes first, card after the pick. */
describe('a plan to someone reached by several routes waits for the owner’s pick', () => {
  const found = routesFromFound([
    { name: 'თამთა ბერიძე', viaPhones: [NANA] },
    { name: 'თამთა ბერიძე', viaPhones: [GELA] },
    { name: 'ლაშა კაპანაძე', viaPhones: [OTHER] },
  ]);

  it('finds the person two contacts lead to, when the plan asks one of them', () => {
    expect(personWithSeveralRoutes([NANA], found)).toBe('თამთა ბერიძე');
    expect(personWithSeveralRoutes(['995555000102'], found)).toBe('თამთა ბერიძე');
  });

  it('lets a plan through that asks every contact who leads to the person (#6304)', () => {
    expect(personWithSeveralRoutes([NANA, GELA], found)).toBeNull();
    expect(personWithSeveralRoutes([GELA, '995555000101', OTHER], found)).toBeNull();
  });

  it('lets a single route through: one way in needs no choice', () => {
    expect(personWithSeveralRoutes([OTHER], found)).toBeNull();
    expect(personWithSeveralRoutes([NANA], found.slice(0, 1))).toBeNull();
  });

  it('counts one contact found twice as one route', () => {
    const twice = routesFromFound([
      { name: 'თამთა', viaPhones: [NANA] },
      { name: 'თამთა', viaPhones: ['995 555 000 101'] },
    ]);
    expect(personWithSeveralRoutes([NANA], twice)).toBeNull();
  });

  it('reads the routes find_warm_path returned, one per first bridge', () => {
    const routes = routesFromWarmPath({
      found: true,
      target: { phone: '+995555000999', name: 'ზურაბი' },
      paths: [
        { hops: 2, bridges: [{ phone: NANA }], relayable: true },
        { hops: 3, bridges: [{ phone: GELA }, { phone: OTHER }], relayable: false },
      ],
    });
    expect(routes).toEqual([
      { to: 'ზურაბი', firstLinkPhone: NANA },
      { to: 'ზურაბი', firstLinkPhone: GELA },
    ]);
    expect(personWithSeveralRoutes([GELA], routes)).toBe('ზურაბი');
    expect(routesFromWarmPath({ found: false, reason: 'no_path_within_hops' })).toEqual([]);
  });

  it('takes a line naming the go-between, in any case ending, as the pick', () => {
    expect(ownerNamedAGoBetween('ნანათი დავიწყოთ', ['ნანა ელიაშვილი'])).toBe(true);
    expect(ownerNamedAGoBetween('ლევანს ჰკითხე', ['ლევანი ბერიძე'])).toBe(true);
    expect(ownerNamedAGoBetween('ბუღალტერი მჭირდება', ['ნანა ელიაშვილი'])).toBe(false);
  });

  it('takes the turn after the routes were put to the owner as the pick, for a day', () => {
    const t0 = 1_000_000;
    expect(routesWereOffered(undefined, t0)).toBe(false);
    expect(routesWereOffered(t0, t0 + 60_000)).toBe(true);
    expect(routesWereOffered(t0, t0 + ROUTE_PICK_WINDOW_MS + 1)).toBe(false);
  });

  it('tells the model to make one card with every way in, findings first', () => {
    // #6304 (Misho, 24 Oct): one card with every way in, never „which one first".
    expect(SEVERAL_ROUTES_LINE).toContain('ჩართე ყველა, ვინც მას იცნობს');
    expect(SEVERAL_ROUTES_LINE).toContain('რა იპოვე');
    expect(SEVERAL_ROUTES_LINE).toContain('არ ჰკითხო, რომლით დავიწყოთ');
  });
});
