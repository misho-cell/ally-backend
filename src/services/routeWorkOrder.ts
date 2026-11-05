import { AllyColour, CLOSE_COLOURS } from './oldAllyColours.service';
import { COLOUR_WEIGHT, LinkColours } from './colourLinks';
import { isWarmTie } from './ownerTies';

/**
 * #8845 (the founder, 4 Nov 22:48 and 22:58): when the warmest route is longer
 * than the shortest, find_warm_path hands over BOTH, each with its warmth, so
 * the owner can choose when they want to. When they hand the job over or
 * approve without choosing, the routes are worked in this order: the shortest
 * (easiest) first, then the warmer longer one, then the rest — the next after
 * a no or a quiet day. The order of the list IS that work order.
 */

export enum RouteRole {
  /** The fewest hops — tried first when the owner leaves the choice to Netai. */
  Shortest = 'shortest',
  /** Longer, but through somebody close — tried second. */
  WarmerLonger = 'warmer_longer',
}

/** What a route needs for this ordering; WarmPath fits it. */
export interface OrderableRoute {
  readonly hops: number;
  readonly bridges: readonly { readonly owner_tie?: string }[];
}

/** The owner's own warm tie to the first bridge weighs as much as an old-Ally green. */
const WARM_TIE_WEIGHT = COLOUR_WEIGHT[AllyColour.Green];

function isClose(colour: AllyColour | null): boolean {
  return colour !== null && CLOSE_COLOURS.includes(colour);
}

/**
 * Warm: the owner is close to the first bridge — said, stored, or learned from
 * their help (#8845 2b, `learned`) — or that bridge holds the next person close.
 */
export function isWarmRoute(
  route: OrderableRoute,
  link: LinkColours | undefined,
  learned = false,
): boolean {
  const ownTie = learned || isWarmTie(route.bridges[0]?.owner_tie);
  return ownTie || (link !== undefined && (isClose(link.ownerColour) || link.bridgeHoldsClose));
}

/** How warm, for ordering only — never shown. */
export function routeWarmth(
  route: OrderableRoute,
  link: LinkColours | undefined,
  learned = false,
): number {
  const tie = learned || isWarmTie(route.bridges[0]?.owner_tie) ? WARM_TIE_WEIGHT : 0;
  return (link?.weight ?? 0) + tie;
}

/** Whether the owner's tie to a route's first bridge was learned from behaviour. */
type LearnedOf<T> = (route: T) => boolean;
const NOTHING_LEARNED = (): boolean => false;

export interface RoutesInWorkOrder<T> {
  readonly routes: T[];
  /** Index into `routes` of the warmer longer route, when there is one. */
  readonly warmerAt: number | null;
}

/**
 * The warmest route that is longer AND warmer than the first (shortest) one;
 * among equals, the one already ranked higher.
 */
function warmerLonger<T extends OrderableRoute>(
  ranked: readonly T[],
  linkOf: (route: T) => LinkColours | undefined,
  learnedOf: LearnedOf<T>,
): T | null {
  const [shortest] = ranked;
  if (shortest === undefined) return null;
  const warmthOf = (route: T): number => routeWarmth(route, linkOf(route), learnedOf(route));
  const floor = warmthOf(shortest);
  let best: T | null = null;
  for (const route of ranked) {
    const warmth = warmthOf(route);
    const qualifies =
      route.hops > shortest.hops && isWarmRoute(route, linkOf(route), learnedOf(route));
    if (qualifies && warmth > floor && (best === null || warmth > warmthOf(best))) {
      best = route;
    }
  }
  return best;
}

/**
 * `ranked` is already fewest hops first, warmest first within a length. The
 * warmer longer route, if any, moves up to second place, so it survives the
 * cut to `max` and is the next one worked after the shortest.
 */
export function inWorkOrder<T extends OrderableRoute>(
  ranked: readonly T[],
  linkOf: (route: T) => LinkColours | undefined,
  max: number,
  learnedOf: LearnedOf<T> = NOTHING_LEARNED,
): RoutesInWorkOrder<T> {
  const warmer = warmerLonger(ranked, linkOf, learnedOf);
  if (warmer === null || max < 2) return { routes: ranked.slice(0, max), warmerAt: null };
  const [shortest, ...rest] = ranked;
  const routes = [shortest, warmer, ...rest.filter((route) => route !== warmer)].slice(0, max);
  return { routes, warmerAt: 1 };
}
