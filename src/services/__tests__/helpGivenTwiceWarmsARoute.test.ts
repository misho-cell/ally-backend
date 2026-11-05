import { readFileSync } from 'fs';
import { join } from 'path';
import { HELPS_THAT_MAKE_A_TIE, learnedClose, tieToShow, OwnerTieReason } from '../ownerTies';
import { inWorkOrder, isWarmRoute, OrderableRoute } from '../routeWorkOrder';

interface Route extends OrderableRoute {
  readonly id: string;
}

const shortCold: Route = { id: 'tornike', hops: 2, bridges: [{}] };
const longViaHelper: Route = { id: 'beso', hops: 3, bridges: [{}, {}] };

/**
 * #8845 (2b), the founder 4 Nov 22:48: members with no old-Ally colours (Erekle
 * 0 of 466, Lika 0 of 758) had every route equally cold. Closeness is learned
 * from behaviour: two answered asks raise a tie.
 */
describe('#8845 (2b): help given twice warms a route', () => {
  it('counts a tie from the second time somebody helped the owner', () => {
    expect(HELPS_THAT_MAKE_A_TIE).toBe(2);
    expect(learnedClose({ closeness: 0.4, reason: null, timesHelped: 1 })).toBe(false);
    expect(learnedClose({ closeness: 0.4, reason: OwnerTieReason.DealtWith, timesHelped: 2 })).toBe(
      true,
    );
    expect(learnedClose(undefined)).toBe(false);
  });

  it('makes the longer route through that helper the warmer one, worked second', () => {
    const learnedOf = (r: Route): boolean => r.id === 'beso';
    const ordered = inWorkOrder([shortCold, longViaHelper], () => undefined, 4, learnedOf);
    expect(ordered.routes.map((r) => r.id)).toEqual(['tornike', 'beso']);
    expect(ordered.warmerAt).toBe(1);
    expect(isWarmRoute(longViaHelper, undefined, true)).toBe(true);
  });

  it('changes nothing when nothing was learned', () => {
    const ordered = inWorkOrder([shortCold, longViaHelper], () => undefined, 4);
    expect(ordered.warmerAt).toBeNull();
  });

  it('is never shown: help stays out of the reason the owner or the model reads (G-104)', () => {
    expect(tieToShow(OwnerTieReason.DealtWith)).toBeNull();
    const warmPath = readFileSync(join(__dirname, '..', 'tools', 'findWarmPath.ts'), 'utf8');
    expect(warmPath).toMatch(/MAX_PATHS,\s+learnedOf,\s+\);/);
    expect(warmPath).toContain('learnedOf(path),');
    expect(warmPath).not.toMatch(/owner_tie: .*learned/);
  });
});
