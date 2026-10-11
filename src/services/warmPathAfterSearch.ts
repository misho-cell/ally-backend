import { asksForAPersonByName } from './personByName';

/**
 * 3732 (box 52742, 0 of 2 on 0138+0139): „მინდა <target>-ს დავუკავშირდე. ვისი
 * გავლით შემიძლია?" ran the name, second-degree and tag searches, found the
 * target, and answered from them — find_warm_path was never called, so the
 * members' chain (owner → B1 → B2 → target) never reached the reply. Forcing
 * the walk FIRST failed before (box 52110): with no target found yet it came
 * back empty. So the walk is forced AFTER a search round, once, and only on a
 * line that asks to reach a person by name. No new words to the model: the
 * tool is chosen for it, and it takes the target from the search it just read.
 */
export const WARM_PATH_TOOL = 'find_warm_path';

/** The searches that can find the person the owner named. */
export const PERSON_SEARCH_TOOLS: ReadonlySet<string> = new Set([
  'search_contact_by_name',
  'search_second_degree',
  'search_by_tag',
]);

export interface RoundAfterSearch {
  /** The owner's line this run answers. */
  readonly ownerLine: string;
  /** Every tool the run has called so far, this round included. */
  readonly toolsUsed: readonly string[];
  /** The tools of the round that just ran. */
  readonly roundTools: readonly string[];
  /** Whether find_warm_path is among the tools this run holds. */
  readonly walkOffered: boolean;
  /** Whether a search of this round returned at least one person (box 52781: an empty one did). */
  readonly roundFoundSomeone: boolean;
}

/** Should the next call be the walk to the person the owner named? */
export function walksToTheNamedPerson(round: RoundAfterSearch): boolean {
  return (
    round.walkOffered &&
    !round.toolsUsed.includes(WARM_PATH_TOOL) &&
    round.roundTools.some((name) => PERSON_SEARCH_TOOLS.has(name)) &&
    round.roundFoundSomeone &&
    asksForAPersonByName(round.ownerLine)
  );
}

/** A person one of this run's own searches returned: the phone id and the name it showed. */
export interface FoundPerson {
  readonly phone: string;
  readonly name: string | null;
}

/** The people a person-search result returned, by its `results` rows. */
export function peopleFoundIn(result: unknown): FoundPerson[] {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const r = (row ?? {}) as { phone?: unknown; name?: unknown };
    if (typeof r.phone !== 'string' || r.phone === '') return [];
    return [{ phone: r.phone, name: typeof r.name === 'string' ? r.name : null }];
  });
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * 3732 (box 52781): the walk was given the person's NAME as target_phone and
 * answered no_target. When what the model passed is the name of exactly one
 * person this run's own searches found, the walk takes that person's phone id.
 * Only those people: a name never reaches anyone the run has not been shown.
 */
export function walkTargetPhone(given: string, found: readonly FoundPerson[]): string {
  if (found.some((person) => person.phone === given)) return given;
  const named = found.filter((person) => person.name !== null && sameName(person.name, given));
  const phones = new Set(named.map((person) => person.phone));
  return phones.size === 1 ? [...phones][0] : given;
}
