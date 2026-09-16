import { searchSecondDegree } from './tools/searchSecondDegree';
import { webSearch } from './tools/webSearch';
import { recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';
import { distilSearchQuery } from './searchQuery.service';

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
 * sum. web_search measures 1.5-5.4s and lands comfortably. The second circle
 * measures anywhere from 2.5s to 21s — row 108, the database maintenance that
 * is still waiting on Misho — so on a bad day it will not make it, and the
 * section below says so rather than implying the circle was empty. Measured
 * 16 September: it has timed out on both of the goals we have logged.
 *
 * Since row 126's fourth pass the web branch spends part of this on getting
 * the query right before it searches — at most 2.5s for the distillation,
 * leaving the search no less than 7.5s of the 10. The budget is unchanged on
 * purpose: a better query is not worth making every first reply wait longer
 * for. Measured on goal 3928, the distilled search took 1.2s in total.
 */
const OPENING_SEARCH_BUDGET_MS = 10_000;

/** A goal title is short; a long first message is trimmed to its substance. */
const MAX_QUERY_CHARS = 200;

/**
 * NO CITY IS READ HERE, AND THE ABSENCE IS THE RULE.
 *
 * The fourth pass first fetched User.city and offered it to the distiller.
 * That was wrong and the seat caught it within the hour: D298 — nothing
 * assumes a city. A place reaches a search only if the OWNER said it, in the
 * goal or in answer to being asked, and a column filled months ago is not
 * them saying it now.
 *
 * Nothing leaked — the one account it ran on stores no city — but the code
 * would have assumed one for anybody who does. The distiller is now told to
 * keep a place the owner named and never to add one, which needs no lookup at
 * all: whatever the owner said is already in the text it is reading.
 */

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
 * Ticket 20 row 126, third pass — the titles and links a web search returned.
 *
 * The seat's ask: „could web_search:opening store the titles and links it
 * returned? Then we can see whether the five were worth showing." They are
 * judging whether the model was RIGHT to ignore the opening results, and the
 * table could say five came back in 4,004 ms and nothing about what they were.
 * „Ignored good results" and „ignored junk" looked identical, and only one of
 * them is a fault.
 *
 * Shapes are read defensively rather than assumed: this reads whatever the
 * search tool happens to return today, and a shape it does not recognise
 * produces no sample rather than a wrong one.
 */
function webTitles(result: unknown): string {
  if (result === null || typeof result !== 'object') return '';
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows)) return '';
  return rows
    .slice(0, 5)
    .map((row) => {
      if (typeof row === 'string') return row;
      if (row === null || typeof row !== 'object') return '';
      const r = row as { title?: unknown; url?: unknown };
      const title = typeof r.title === 'string' ? r.title : '';
      const url = typeof r.url === 'string' ? r.url : '';
      return [title, url].filter(Boolean).join(' — ');
    })
    .filter(Boolean)
    .join(' | ');
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
  threadId: number,
): Promise<OpeningSearches> {
  const query = goalText.trim().slice(0, MAX_QUERY_CHARS);
  if (query === '') return { web: null, secondDegree: null, missing: [] };

  /**
   * Ticket 20 row 126, second pass. These two searches are LOGGED like any
   * other tool call, and the reason is a question I could not answer an hour
   * after shipping them.
   *
   * The seat asked whether the pre-run section reached two live prompts or
   * whether the model ignored it. The ledger settled it — both runs carry a
   * Tavily charge and neither called web_search, and only this function does
   * that — but „it ran" was as far as I could get. WHAT IT FOUND was nowhere,
   * because a search nobody logs is a search nobody can ask about. The same
   * gap as row 125, in code I wrote after fixing row 125.
   *
   * Fire-and-forget: logToolCall never throws and never blocks, and a first
   * reply must not wait on a debugging record.
   */
  const logged = async (
    tool: string,
    work: Promise<unknown>,
    publicResult = false,
    searched: { query: string; fromGoal?: string } = { query },
  ): Promise<string> => {
    const startedAt = Date.now();
    const result = await work;
    void logToolCall({
      threadId,
      runId,
      userId,
      tool: `${tool}:opening`,
      // Row 126 fourth pass: BOTH, whenever they differ. „The search found
      // junk" and „the search was asked the wrong thing" are different faults
      // and the seat could not tell them apart from one of the two.
      input: searched.fromGoal === undefined ? { query } : searched,
      result,
      durationMs: Date.now() - startedAt,
      // Ticket 20 row 126, third pass. Only for the WEB, whose results are
      // public pages. The second circle's results are the owner's own network
      // and must not leave a sample of real people in a debugging table.
      ...(publicResult && { resultSample: webTitles(result) }),
    });
    return JSON.stringify(result);
  };

  /**
   * Row 126 fourth pass. The web gets a QUERY; the owner's own network gets
   * the owner's own words.
   *
   * Only the web branch is distilled, and the asymmetry is deliberate. A web
   * index rewards two words and a city and punishes a sentence — that is the
   * whole finding. The second circle is not an index: it matches tags, facts
   * and roles over people the owner already knows, and I have no evidence
   * about what shape of query serves it, because it has timed out on both of
   * the goals we have logged. Changing a search I cannot yet measure would be
   * guessing with somebody's first reply.
   *
   * The distillation runs INSIDE the web branch rather than before both, so
   * the second circle starts at the same moment it does today and loses
   * nothing to it.
   */
  const webWork = (async (): Promise<string> => {
    const searched = await distilSearchQuery(query, { userId, runId });
    // Charged like any other web search, because it is one. A pre-fetch that
    // did not reach the ledger would be spend the cost report cannot see.
    await recordFixedUsage({
      userId,
      kind: 'web_search',
      provider: 'tavily',
      priceKey: 'tavily.search',
      runId,
    }).catch(() => {});
    return logged('web_search', webSearch(searched.query), true, searched);
  })();

  const [web, secondDegree] = await Promise.all([
    withBudget(webWork, 'web_search'),
    withBudget(
      logged('search_second_degree', searchSecondDegree(userId, query)),
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
