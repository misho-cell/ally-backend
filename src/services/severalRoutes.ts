import { FoundThroughBridge } from './introTargetSentence';
import { phoneDigits } from './phone';

/**
 * The routes this run found to a person — one per first link — read from a
 * person search or from find_warm_path. #8845: a plan that asks several of
 * them to one person works them in that order (routeOrderForPlan); #8948: a
 * plan naming some of them is never refused for it.
 */

/** One way to the person: the owner's contact the chain starts at. */
export interface RouteToPerson {
  readonly to: string;
  readonly firstLinkPhone: string;
}

/** The routes a person search returned: each found person through each contact who knows them. */
export function routesFromFound(found: readonly FoundThroughBridge[]): RouteToPerson[] {
  return found.flatMap((person) =>
    person.viaPhones.map((phone) => ({ to: person.name, firstLinkPhone: phone })),
  );
}

/** The routes find_warm_path returned: the target through each path's first bridge. */
export function routesFromWarmPath(result: unknown): RouteToPerson[] {
  const outcome = (result ?? {}) as {
    found?: unknown;
    target?: { name?: unknown; phone?: unknown };
    paths?: unknown;
  };
  if (outcome.found !== true || !Array.isArray(outcome.paths)) return [];
  const name = typeof outcome.target?.name === 'string' ? outcome.target.name.trim() : '';
  const to = name !== '' ? name : String(outcome.target?.phone ?? '');
  if (to === '') return [];
  return outcome.paths.flatMap((path: unknown) => {
    const bridges = (path as { bridges?: unknown } | null)?.bridges;
    const first = Array.isArray(bridges)
      ? (bridges[0] as { phone?: unknown } | undefined)
      : undefined;
    const phone = typeof first?.phone === 'string' ? first.phone : '';
    return phone === '' ? [] : [{ to, firstLinkPhone: phone }];
  });
}

/** The distinct first links per person. */
function firstLinksByPerson(routes: readonly RouteToPerson[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const route of routes) {
    const digits = phoneDigits(route.firstLinkPhone);
    if (digits === '') continue;
    out.set(route.to, (out.get(route.to) ?? new Set<string>()).add(digits));
  }
  return out;
}

/** Shorter name words match too much of any line. */
const MIN_NAME_STEM = 3;
/** A Georgian name's closing vowel changes with its case ending: ლევანი, ლევანს, ლევანით. */
const CLOSING_VOWEL = /[აეიოუ]$/u;

function nameStem(word: string): string {
  const lower = word.toLocaleLowerCase();
  const stem = lower.replace(CLOSING_VOWEL, '');
  return stem.length >= MIN_NAME_STEM ? stem : lower;
}

/** The owner's line names one of the plan's go-betweens: that is their pick. */
export function ownerNamedAGoBetween(ownerLine: string, names: readonly string[]): boolean {
  const line = ownerLine.toLocaleLowerCase();
  return names.some((name) =>
    name
      .split(/\s+/u)
      .filter((word) => word.length >= MIN_NAME_STEM)
      .some((word) => line.includes(nameStem(word))),
  );
}

/**
 * #8845 (the founder, 4 Nov 22:58): a plan that asks several of the routes to
 * one person works them one after another, in the order the routes were found
 * — the shortest first, then the warmer longer one, then the rest. The plan's
 * own go-betweens to that person, as digits, in that order; empty when the
 * plan asks fewer than two routes to any one person.
 */
export function routeOrderForPlan(
  planPhones: readonly string[],
  routes: readonly RouteToPerson[],
): string[] {
  const inPlan = new Set(planPhones.map(phoneDigits).filter((digits) => digits !== ''));
  for (const links of firstLinksByPerson(routes).values()) {
    const asked = [...links].filter((digits) => inPlan.has(digits));
    if (asked.length >= 2) return asked;
  }
  return [];
}
