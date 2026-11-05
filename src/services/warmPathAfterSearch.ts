/**
 * 3732 (box 52742, 0 of 2 on 0138+0139): „მინდა <target>-ს დავუკავშირდე. ვისი
 * გავლით შემიძლია?" ran the name, second-degree and tag searches, found the
 * target, and answered from them — find_warm_path was never called. The walk
 * was then forced after a search round whenever MEET_OR_REACH_RE read the
 * owner's line as asking to reach a person by name.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. find_warm_path's
 * own description says to walk next once a search found the person the owner
 * asked to reach, and the model reads the line.
 */
const WARM_PATH_TOOL = 'find_warm_path';

export const WALK_AFTER_FINDING_THEM =
  'When the owner asks how to reach a person they named and a search has just found that ' +
  'person, call this next — the reply must carry the chain, not only the search.';

/** A person one of this run's own searches returned: the phone id and the name it showed. */
export interface FoundPerson {
  readonly phone: string;
  readonly name: string | null;
}

/**
 * The people a person-search result returned: its `results` rows, and the
 * people found further out through a chain (`further_out`, 5347) — #1849 world
 * Y: the walk to one of them is the route, not another search.
 */
export function peopleFoundIn(result: unknown): FoundPerson[] {
  const shown = result as { results?: unknown; further_out?: unknown } | null;
  const rows = [
    ...(Array.isArray(shown?.results) ? shown.results : []),
    ...(Array.isArray(shown?.further_out) ? shown.further_out : []),
  ];
  return rows.flatMap((row: unknown) => {
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
/**
 * #1849 world Y (the tester's 68805, Y3 60307): a 4-link chain to the head of
 * customs was found, the run had spent its 8 searches on web pages, and
 * find_warm_path for that very person was refused as a ninth search. The reply
 * then called the chain a direct link („Zuriko knows the head of customs"). The
 * walk to a person this run already found is the route to its answer: it is
 * never refused by the search budget.
 */
export function isRouteToSomeoneFound(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  found: readonly FoundPerson[],
): boolean {
  if (tool !== WARM_PATH_TOOL) return false;
  const target = walkTargetPhone(String(input['target_phone'] ?? ''), found);
  return found.some((person) => person.phone === target);
}

export function walkTargetPhone(given: string, found: readonly FoundPerson[]): string {
  if (found.some((person) => person.phone === given)) return given;
  const named = found.filter((person) => person.name !== null && sameName(person.name, given));
  const phones = new Set(named.map((person) => person.phone));
  return phones.size === 1 ? [...phones][0] : given;
}
