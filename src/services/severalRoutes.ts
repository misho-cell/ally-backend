import { FoundThroughBridge } from './introTargetSentence';
import { phoneDigits } from './phone';

/**
 * #6367 / #5251 (Misho's choice (a), 21 Oct): when more than one warm route
 * leads to the person sought, the turn shows what was found and the routes,
 * and asks which to start with; the plan card comes after the owner's pick.
 * task_main says so, and held 1 run in 3: four other lines pull towards the
 * card, and D739 drops whatever the model wrote above a card. So the server
 * refuses the card in that turn, and the owner's pick lets it through.
 */

/** One way to the person: the owner's contact the chain starts at. */
export interface RouteToPerson {
  readonly to: string;
  readonly firstLinkPhone: string;
}

/** A pick stays good this long after the routes were put to the owner. */
export const ROUTE_PICK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The model is told this instead of getting a card. #6304 (Misho's word, 24 Oct,
 * on Misho's Claude's recommendation): a person several contacts lead to gets ONE
 * card with all of them, not a question which one to start with.
 */
export const SEVERAL_ROUTES_LINE =
  'ამ ადამიანამდე რამდენიმე თბილი გზა იპოვე, გეგმაში კი მხოლოდ ნაწილია. ' +
  'ერთი გეგმის ბარათი გააკეთე და people_to_involve-ში ჩართე ყველა, ვინც მას იცნობს — ' +
  'ბარათი თავად აჩვენებს ორ ჯგუფს (Netai-ზე / არა Netai-ზე). ჯერ 2–4 მოკლე ხაზით უთხარი, ' +
  'რა იპოვე. არ ჰკითხო, რომლით დავიწყოთ: მფლობელი ერთი დადასტურებით ყველას ჰკითხავს.';

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

/**
 * The person this plan goes to through only SOME of several routes, or null:
 * the plan asks a first link to a person this run reached by two or more
 * different contacts, and leaves another of them out. #6304 (Misho, 24 Oct):
 * a plan that asks them all is the one card with every way in, and goes through.
 */
export function personWithSeveralRoutes(
  planPhones: readonly string[],
  routes: readonly RouteToPerson[],
): string | null {
  const asked = new Set(planPhones.map(phoneDigits).filter((digits) => digits !== ''));
  for (const [person, links] of firstLinksByPerson(routes)) {
    if (links.size < 2) continue;
    const askedLinks = [...links].filter((digits) => asked.has(digits)).length;
    if (askedLinks > 0 && askedLinks < links.size) return person;
  }
  return null;
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

/** Were the routes put to the owner in this conversation recently enough for this to be the pick? */
export function routesWereOffered(offeredAt: number | undefined, now: number): boolean {
  return offeredAt !== undefined && now - offeredAt <= ROUTE_PICK_WINDOW_MS;
}
