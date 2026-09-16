import { searchSecondDegree } from './tools/searchSecondDegree';
import { webSearch } from './tools/webSearch';
import { recordFixedUsage } from './costLedger.service';

/**
 * Ticket 20 row 126 — a named problem starts the web and the second circle at
 * once, every time.
 *
 * Tornike's rule: when a problem is named, the assistant runs a web search and
 * a second-circle search immediately, without asking, alongside the owner's
 * own network, and never skips them because the network already had somebody.
 *
 * task_main says this three times already. Measured over 36 hours, of the 63
 * runs that searched at all:
 *
 *   both circles          14   (22%)
 *   second circle only    28   (44%)   — the web skipped
 *   web only              17   (27%)   — the second circle skipped
 *   neither                4
 *
 * So it is not one of the two being forgotten, it is both, and a fourth
 * sentence in the prompt would join three that are already there.
 *
 * WHY THIS IS NOT THE 101b SHAPE. The tester asked for "the same kind of guard
 * as 101b" — a check at the END of a run that asks the model once more. I
 * built that this afternoon for the missing plan and reverted it the same
 * hour: the nudge arrived after the reply had been written, the reply came out
 * cut off mid-sentence, and it did not achieve its purpose anyway. Intervening
 * after a run has spoken is expensive and fragile.
 *
 * So the searches are not REQUESTED at the end. They are RUN, by the server,
 * before the model's first turn, and their results are handed to it in the
 * prompt. Nothing can skip them because nothing is being asked.
 */

/**
 * How long the opening searches may hold up the first reply.
 *
 * Both are started together, so this is the slower of the two and not their
 * sum. web_search measures 1.5-3.1s and lands comfortably. The second circle
 * measures anywhere from 2.5s to 21s — row 108, the database maintenance that
 * is still waiting on Misho — so on a bad day it will not make it, and the
 * section below says so rather than implying the circle was empty.
 */
const OPENING_SEARCH_BUDGET_MS = 10_000;

/** A goal title is short; a long first message is trimmed to its substance. */
const MAX_QUERY_CHARS = 200;

export interface OpeningSearches {
  readonly web: string | null;
  readonly secondDegree: string | null;
  /** Names what did not arrive, so the prompt can be honest about it. */
  readonly missing: readonly string[];
}

/**
 * The timer is CLEARED when the work wins, and that is not tidiness.
 *
 * Promise.race settles, but the loser keeps running — an uncleared timeout
 * holds the event loop open for its full duration. Two of these per run, ten
 * seconds each, on every goal anyone opens. Jest caught it in one line („did
 * not exit one second after the test run"), which is the cheapest place this
 * particular mistake is ever found.
 */
function withBudget<T>(work: Promise<T>, label: string): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OPENING_SEARCH_BUDGET_MS);
  });
  const guarded = work.catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[opening-search] ${label} failed:`, (err as Error).message);
    return null;
  });
  return Promise.race([guarded, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Run both opening searches for a freshly opened goal.
 *
 * Never throws and never returns a rejected promise: a first reply must not
 * depend on either search succeeding. A search that fails or overruns is
 * reported as missing, and the model still holds both tools.
 */
export async function runOpeningSearches(
  userId: string,
  goalText: string,
  runId: string,
): Promise<OpeningSearches> {
  const query = goalText.trim().slice(0, MAX_QUERY_CHARS);
  if (query === '') return { web: null, secondDegree: null, missing: [] };

  // Charged like any other web search, because it is one. A pre-fetch that
  // did not reach the ledger would be spend the cost report cannot see.
  const webWork = (async (): Promise<string> => {
    await recordFixedUsage({
      userId,
      kind: 'web_search',
      provider: 'tavily',
      priceKey: 'tavily.search',
      runId,
    }).catch(() => {});
    return JSON.stringify(await webSearch(query));
  })();

  const [web, secondDegree] = await Promise.all([
    withBudget(webWork, 'web_search'),
    withBudget(
      searchSecondDegree(userId, query).then((r) => JSON.stringify(r)),
      'search_second_degree',
    ),
  ]);

  const missing: string[] = [];
  if (web === null) missing.push('web_search');
  if (secondDegree === null) missing.push('search_second_degree');
  return { web, secondDegree, missing };
}

/** Results are handed to the model, never to a screen, so the labels are plain. */
const MAX_SECTION_CHARS = 6_000;

function clip(text: string): string {
  return text.length > MAX_SECTION_CHARS ? `${text.slice(0, MAX_SECTION_CHARS)}…` : text;
}

/**
 * The opening searches as a prompt section.
 *
 * It says explicitly that these have ALREADY run, because the failure being
 * fixed is a model that does not search — one that reads this and then calls
 * both tools again has cost the owner ten more seconds for the same rows.
 */
export function buildOpeningSearchSection(found: OpeningSearches): string {
  if (found.web === null && found.secondDegree === null && found.missing.length === 0) return '';
  const parts = [
    '\n\n## საწყისი ძიება — უკვე შესრულებულია',
    'ეს ორი ძიება სერვერმა ავტომატურად გაუშვა, სანამ შენ დაიწყებდი. შედეგები ქვემოთაა — ' +
      'ხელახლა ნუ გამოიძახებ იმას, რაც უკვე მოძებნილია, და პასუხში აუცილებლად გამოიყენე ის, ' +
      'რაც აქ ნაპოვნია.',
  ];
  if (found.web !== null) parts.push(`\n### ვები\n${clip(found.web)}`);
  if (found.secondDegree !== null) parts.push(`\n### მეორე წრე\n${clip(found.secondDegree)}`);
  if (found.missing.length > 0) {
    // Named, not silently absent. "The second circle is empty" and "the second
    // circle did not answer in time" are different facts, and the run has been
    // reported saying the first when the second was true (ticket 19 G7).
    parts.push(
      `\n### ვერ მოასწრო: ${found.missing.join(', ')}\n` +
        'ეს იმას არ ნიშნავს, რომ იქ არაფერია — ნიშნავს, რომ პასუხი დროზე არ დაბრუნდა. ' +
        'თუ საქმეს სჭირდება, თვითონ გამოიძახე; „ვერაფერი მოიძებნა" არ თქვა.',
    );
  }
  return parts.join('\n');
}
