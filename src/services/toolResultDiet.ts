// Caps what a tool result feeds back into the model. Search tools return up to
// 20 rows; over a 15-tool run that snowballs the context (every iteration
// re-sends all prior results), which is what pushed model calls past their
// timeout. The model only needs the top rows to decide the next step — the
// full count is kept so it can say "N found" and ask the user to refine.

const MODEL_RESULT_LIMIT = 8;

/**
 * The tester's 991 (G1 on Test 73): with own matches ranked first, eight of the
 * owner's nine lawyers reached the model and the ninth was cut by the window
 * above. A row carrying the owner's own label (`tags`, which only ever holds
 * labels the owner saved) is never trimmed while it fits under this ceiling
 * (the name search's own row limit); every other row keeps the eight-row
 * window.
 */
const OWN_MATCHES_CEILING = 20;

/** Set by the tag and name searches on a row that only others' labels matched. */
const OTHERS_LABELS_FLAG = 'found_by_others_labels';

/**
 * Misho, 2 October: a contact found only through other people's labels is
 * shown — after the owner's own matches, never cut by them. Ten of them at
 * most, so one crowded word cannot swamp the reply.
 */
const OTHERS_ONLY_CEILING = 10;

/**
 * Ticket 16 Task 47 (Ticket 10 [3.1]): an empty field is not information, and
 * the model quotes it — „ilia tsulaia (\"\")" reached a user as a blank where a
 * number should be. A field the scrubber emptied, or that nobody ever filled,
 * is dropped instead of travelling as "". Null and empty arrays go with it;
 * `false` and `0` are answers and stay. Applied to every tool result, so no
 * single tool has to remember.
 */
/**
 * A Date has no own enumerable properties, so walking one as an object returns
 * `{}` — and that is what every date in every tool result became.
 *
 * Found 18 September through row 141. The seat asked the founder's assistant,
 * in plain English, „which goals do I have open and when was each last active",
 * and got „last activity is not recorded" six times out of six. The admin read
 * of the same six goals, the same minute, had `created_at` and
 * `last_activity_at` populated on all of them — so the row looked like a tool
 * that had not been given the columns.
 *
 * It had been given them. getMyTasks selects both. They arrived here as Date
 * objects, this function recursed into them, `Object.entries(date)` is empty,
 * and the model was handed `created_at: {}`. It said „not recorded" because
 * that is exactly what it received, and it was right to.
 *
 * Not one tool: EVERY tool result carrying a date, since this function was
 * written to apply to all of them so no single tool has to remember.
 *
 * Left as a Date rather than converted: JSON.stringify renders one as an ISO
 * string on its own, which is what the model reads, and converting here would
 * hide from the next reader that the value was ever a Date.
 */
function withoutEmptyFields(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(withoutEmptyFields);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string' && entry.trim() === '') continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    out[key] = withoutEmptyFields(entry);
  }
  return out;
}

function isOthersLabelsOnly(row: unknown): boolean {
  return (
    row !== null &&
    typeof row === 'object' &&
    (row as Record<string, unknown>)[OTHERS_LABELS_FLAG] === true
  );
}

interface MatchSplit {
  readonly own_or_public_matches: number;
  readonly others_labels_only_matches: number;
}

/**
 * The 991 second ask: the model said „45 in your contacts" when nine were the
 * owner's own labels and 36 other people's. It is handed the split whenever a
 * result carries the flag, so it can say which number is the owner's.
 */
function matchSplit(results: readonly unknown[]): MatchSplit | null {
  const othersOnly = results.filter(isOthersLabelsOnly).length;
  if (othersOnly === 0) return null;
  return {
    own_or_public_matches: results.length - othersOnly,
    others_labels_only_matches: othersOnly,
  };
}

function carriesOwnLabel(row: unknown): boolean {
  if (row === null || typeof row !== 'object' || isOthersLabelsOnly(row)) return false;
  const tags = (row as Record<string, unknown>).tags;
  return Array.isArray(tags) && tags.length > 0;
}

/**
 * The tester's 992 (Test 153): a ten-name search on the owner's own contacts
 * came back 8 of 10. Those rows carry no label, only the owner's own saved
 * name, so `carriesOwnLabel` passed them by. In the two searches that read
 * ONLY the owner's own contacts, every exact match is the owner's; only a
 * letter-similar neighbour or an others'-labels match is trimmable.
 */
function isExactOwnMatch(row: unknown): boolean {
  if (row === null || typeof row !== 'object' || isOthersLabelsOnly(row)) return false;
  return (row as Record<string, unknown>).approximate !== true;
}

type RowTest = (row: unknown) => boolean;

function rowsToShow(results: readonly unknown[], isOwn: RowTest): number {
  const ownCount = results.filter(isOwn).length;
  return Math.max(MODEL_RESULT_LIMIT, Math.min(ownCount, OWN_MATCHES_CEILING));
}

function shownRows(results: readonly unknown[], limit: number, isOwn: RowTest): unknown[] {
  const own = results.filter(isOwn);
  const rest = results.filter((row) => !isOwn(row));
  return [...own, ...rest].slice(0, limit);
}

/**
 * An own-contact search: the owner's own matches up to the limit, other
 * unflagged rows filling what is left of it, and then the rows found only
 * through other people's labels — kept, up to their own ceiling.
 */
function shownOwnSearchRows(results: readonly unknown[], limit: number): unknown[] {
  const own = results.filter(isExactOwnMatch).slice(0, limit);
  const othersOnly = results.filter(isOthersLabelsOnly).slice(0, OTHERS_ONLY_CEILING);
  const rest = results.filter((row) => !isExactOwnMatch(row) && !isOthersLabelsOnly(row));
  return [...own, ...rest.slice(0, Math.max(0, limit - own.length)), ...othersOnly];
}

/**
 * `ownContactSearch`: the result came from a search over the owner's own
 * contacts (search_by_tag, search_contact_by_name), so an exact match is never
 * trimmed while it fits under the ceiling.
 */
export function dietToolResult(result: unknown, ownContactSearch = false): unknown {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return result;

  const obj = withoutEmptyFields(result) as Record<string, unknown>;
  if (!Array.isArray(obj.results)) return obj;

  const isOwn: RowTest = ownContactSearch ? isExactOwnMatch : carriesOwnLabel;
  const split = matchSplit(obj.results);
  const withSplit = split ? { ...obj, ...split } : obj;
  const limit = rowsToShow(obj.results, isOwn);
  const shown = ownContactSearch
    ? shownOwnSearchRows(obj.results, limit)
    : shownRows(obj.results, limit, isOwn);
  if (shown.length >= obj.results.length) return withSplit;

  return {
    ...withSplit,
    results: shown,
    results_shown: shown.length,
    note: `showing top ${shown.length} of ${obj.results.length}; refine the query to narrow down`,
  };
}
