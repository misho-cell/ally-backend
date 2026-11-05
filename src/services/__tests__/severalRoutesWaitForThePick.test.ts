import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerNamedAGoBetween, routesFromWarmPath } from '../severalRoutes';

const NANA = '+995555000101';
const GELA = '+995555000102';
const OTHER = '+995555000103';

/**
 * #8948 (battery 5 Nov): the „several_routes" refusal of propose_task_plan cost
 * one extra model call in most runs. Since #8845 a plan naming several routes to
 * one person works them one at a time, in order, so a plan is never refused for it.
 */
describe('a plan to someone reached by several routes', () => {
  it('is never refused for naming only some of the routes', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).not.toContain("reason: 'several_routes'");
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
    expect(routesFromWarmPath({ found: false, reason: 'no_path_within_hops' })).toEqual([]);
  });

  it('matches a line naming a go-between, in any case ending', () => {
    expect(ownerNamedAGoBetween('ნანათი დავიწყოთ', ['ნანა ელიაშვილი'])).toBe(true);
    expect(ownerNamedAGoBetween('ლევანს ჰკითხე', ['ლევანი ბერიძე'])).toBe(true);
    expect(ownerNamedAGoBetween('ბუღალტერი მჭირდება', ['ნანა ელიაშვილი'])).toBe(false);
  });
});
