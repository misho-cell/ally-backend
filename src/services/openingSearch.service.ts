import { searchSecondDegree } from './tools/searchSecondDegree';
import { searchByTagExactOnly } from './tools/searchByTag';
import { webSearch } from './tools/webSearch';
import { recordFixedUsage } from './costLedger.service';
import { logToolCall } from './toolCallLog.service';
import { distilSearchQuery, distilIntroductionLocally } from './searchQuery.service';
import { RunLanguage } from './runLanguage';

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
 * the moment a problem is named. Nothing can skip them because nothing is
 * being asked.
 *
 * Since 18 September the run no longer WAITS for them: they are started and
 * their results reach the model when they land, beside the next round of tool
 * results. Tornike's rule is that they run, and they do.
 */

/**
 * How long the opening searches are allowed to run — not how long anything
 * waits for them.
 *
 * Since 18 September nothing does. The run starts them and carries on, and
 * they are handed to the model when they land (see startOpeningSearches in
 * chat.service for Misho's word and the numbers). So a budget that cuts them
 * off early no longer saves the owner a second — it only throws away a result
 * that was about to arrive.
 *
 * 18 seconds because that is where there stops being anything to wait for.
 * Measured over 14 days: every second-degree opening search that succeeds does
 * so by 18.8 s, and the 45 that fail all die at 16.0 to 17.3 s on the query's
 * own statement timeout. Past that there is nothing left to catch, and those
 * failures are row 108 rather than a budget.
 *
 * Both halves share it and are started together, so it is the slower of the
 * two and not their sum. web_search measures 1.5-5.4 s and has never come
 * close to it; the web branch also spends up to 2.5 s of it distilling the
 * query before searching, which used to be a real trade against the first
 * reply and now costs nobody anything.
 */
const OPENING_SEARCH_BUDGET_MS = 18_000;

/** A goal title is short; a long first message is trimmed to its substance. */
const MAX_QUERY_CHARS = 200;

/**
 * Row 253 — the goal is about REACHING A NAMED PERSON, so the web has nothing
 * to be asked and a name has nothing to gain by going there.
 *
 * Deliberately a short list of phrases and not a guess at whether a name is
 * present. „Is this a person's name" is a judgement, and a wrong yes silently
 * takes the web away from a real trade search — the 17 September shape that
 * cost ten goals their second circle and went unseen for three days. „Did the
 * owner ask to be introduced to somebody" is a reading of their own words, and
 * these are the exact phrasings behind all 42 measured cases.
 *
 * A TRADE IN THE SAME SENTENCE STILL GETS ITS SEARCH. „Introduce me to a good
 * plumber" is a trade request wearing an introduction's clothes, and the web
 * can answer it — so the trade stems win. That half is narrow on purpose too:
 * it only has to be right about the sentences that actually occur.
 */
const REACHING_FOR_A_PERSON =
  /\b(introduce me|introduced to|introduction to|an introduction from|arrange a meeting with|put me in touch|get in touch with)\b|დაკავშირებ|გამაცნ|გააცნო|შემახვედრ/i;

/** A trade named in the same breath is still a trade, and the web can help. */
const NAMES_A_TRADE =
  /\b(lawyer|accountant|plumber|electrician|photographer|architect|dentist|doctor|tutor|translator|designer|developer|mechanic|carpenter|notary|barber|painter|driver|videographer|printer|agency|clinic|contractor)\b|იურისტ|ბუღალტერ|სანტექნიკ|ელექტრიკ|ფოტოგრაფ|არქიტექტორ|სტომატოლოგ|ექიმ|რეპეტიტორ|თარჯიმან|დიზაინერ|დეველოპერ|ავტოხელოსან|ხურო|ნოტარიუს|დალაქ|მღებავ|მძღოლ|ზეინკალ/i;

/**
 * Exported for its own test: this decides whether a person's name leaves the
 * building, which is not a thing to hold only through the function that calls
 * it.
 */
export function goalAsksToReachAPerson(goalText: string): boolean {
  if (!REACHING_FOR_A_PERSON.test(goalText)) return false;
  return !NAMES_A_TRADE.test(goalText);
}

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
  /** Row 154: for each name the web returned, the owner's own way in. */
  readonly waysIn: ReadonlyMap<string, WayIn>;
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
  if (query === '') return { web: null, secondDegree: null, missing: [], waysIn: new Map() };

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
      surface: 'chat',
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
   * Ticket 20 row 126, fifth pass — the second circle gets the short phrase
   * too, and this REVERSES what the fourth pass wrote here.
   *
   * The fourth pass distilled only the web branch and said so in this comment:
   * „I have no evidence about what shape of query serves the second circle,
   * because it has timed out on both of the goals we have logged. Changing a
   * search I cannot yet measure would be guessing with somebody's first
   * reply." That was the right call with no evidence. There is evidence now,
   * and it says the sentence is the reason it times out.
   *
   * WHAT THE SENTENCE COSTS. buildRawWordGroups splits on words and gives each
   * one its transliteration variants, and every variant becomes one more regex
   * run against every row the bridges own — 885,942 of them on account 501:
   *
   *   „ქორწილის ფოტოგრაფი მჭირდება ქუთაისში."          4 groups, 13 regexes
   *   „ფოტოგრაფი"                                       1 group,   3 regexes
   *   Ninia's marketing sentence                       17 groups, 51 regexes
   *   „მარკეტინგი"                                      1 group,   3 regexes
   *
   * Seventeen of those groups are words like „გამარჯობა", „მაქვს", „მაგრამ",
   * „და" and „რომელიც". Nobody is tagged „hello".
   *
   * WHAT IT BUYS. Measured on 501 against the live base, same ranking, same
   * limit of 30:
   *
   *   photographer   sentence 12.1 s   short 4.9 s   result sets IDENTICAL
   *   accountant     sentence 11.4 s   short 5.7 s   27 of 30 the same
   *   marketing      sentence times out at 15 s and returns NOTHING (three
   *                  times today: 16 415, 16 441, 16 415 ms, ok=false)
   *                  short 4.9 s, 30 people
   *
   * The accountant's three swapped rows are the argument, not a footnote. The
   * sentence dropped „Ilias BUGALTERIA", „Nino Komarovis Bugalteri" and „kodi
   * liberty" and put back three people whose tag merely contains „მცირე"
   * („small", from „small business"). Every row in both sets scores word_hits
   * 1, so the extra words never once made a better match — they only broke
   * ties towards people who match the wrong word. The short query is not a
   * trade of recall for speed here; it is better on both.
   *
   * SO THE DISTILLATION MOVES OUT of the web branch and runs once for both.
   * The second circle starts one model call later than it does today and
   * finishes seven to eleven seconds earlier — or at all.
   */
  /**
   * ROW 253's SECOND DOOR — AND IT IS WHY THIS LINE IS ABOVE THE DISTILLER
   * RATHER THAN BELOW IT.
   *
   * What shipped last night skipped the WEB search. It could not skip this,
   * because `distilSearchQuery` had already run by the time the flag existed —
   * and that call is a model call on OpenAI, a second provider, handed the
   * goal text with the person's name in it. The web half was closed and the
   * name still left the building, to a different company. The whole of the fix
   * is three lines and two of them are the order.
   */
  const reachingForAPerson = goalAsksToReachAPerson(query);
  const searched = reachingForAPerson
    ? distilIntroductionLocally(query)
    : await distilSearchQuery(query, { userId, runId });
  // Row 154: filled by the web branch below, once the search it depends on
  // has returned. Declared here so the caller can read it after both branches.
  let waysIn: Map<string, WayIn> = new Map();

  /**
   * ROW 253 — A PERSON'S NAME MUST NOT LEAVE THE BUILDING TO ANSWER A QUESTION
   * THE WEB CANNOT ANSWER.
   *
   * Found on 22 September while measuring something else. This log carries the
   * distilled query beside the goal text, and on introduction goals it reads:
   *
   *   query=Netai Test 1            goal=Ask Netai Test 1 to introduce me to Netai Test 2.
   *   query=Netai Test 8 contact    goal=I want to be introduced to Netai Test 9 through Netai Test 8
   *   query=Netai Test 10           goal=Arrange a meeting with Netai Test 10 next week
   *   query=<a real personal name>  goal=I need to reach <them> — do you know them?
   *
   * The product was putting its own users' names into a third-party search
   * API. Since 16 September: 320 opening web searches, 41 carrying a test
   * seat's name or an „introduce" phrase, and one carrying a real person's.
   *
   * D149 is written about phone numbers. A person's full name together with
   * „somebody wants to be introduced to them", handed to an outside service,
   * is the same class of thing — and unlike a wasted handyman search it cannot
   * even be defended as a call that might have helped. Searching the web for
   * „Netai Test 8" finds nothing, ever, by construction.
   *
   * ONLY THE WEB HALF IS SKIPPED. The second circle is the search that can
   * actually answer „who can introduce me to this person", it never leaves the
   * building, and D315 says it runs when a problem is named. It runs.
   */
  if (reachingForAPerson) {
    // eslint-disable-next-line no-console
    console.log(
      `[opening-search] run ${runId} thread ${threadId}: web skipped and the query built here, not by a model — the goal asks to reach a person, and their name is neither the web's to read nor a second provider's`,
    );
  }
  /**
   * A FUNCTION, NOT AN IMMEDIATELY-INVOKED ONE, and row 253 is why.
   *
   * This was `const webWork = (async () => {…})()`, which STARTS THE MOMENT IT
   * IS DEFINED. The first version of the skip above tested the flag where the
   * promise is awaited, which would have been no skip at all: the search — and
   * the name inside it — would already have gone out, and the only thing
   * refused would have been the result. Caught before it shipped, and it is
   * the same shape as every other thing found today: the guard was in the
   * right file and the wrong line.
   */
  const startWebWork = async (): Promise<string> => {
    // Charged like any other web search, because it is one. A pre-fetch that
    // did not reach the ledger would be spend the cost report cannot see.
    await recordFixedUsage({
      userId,
      kind: 'web_search',
      provider: 'tavily',
      priceKey: 'tavily.search',
      runId,
    }).catch(() => {});
    // Row 154: the raw result is kept, because the way-in searches need the
    // names and `logged` hands back the serialised string.
    //
    // THE PROMISE IS HANDED OVER UNAWAITED, and that is not a style choice.
    // The first version awaited webSearch here and passed Promise.resolve(raw)
    // to `logged`, which starts its clock inside itself — so it timed an
    // already-settled promise and wrote duration_ms 0 on every opening web
    // search. The seat read three goals in a row showing 0 ms and asked
    // whether the results were cached. They were not; I had broken the
    // measurement four hours earlier and reported the feature without
    // re-reading the row it writes.
    const search = webSearch(searched.query);
    const serialised = await logged('web_search', search, true, searched);
    const raw = await search;
    // The way-in lookups run HERE, inside the web branch, after the search
    // they depend on.
    waysIn = await findWaysIn(userId, webResultNames(raw), { threadId, runId });
    return serialised;
  };

  const [web, secondDegree] = await Promise.all([
    reachingForAPerson ? Promise.resolve(null) : withBudget(startWebWork(), 'web_search'),
    withBudget(
      logged('search_second_degree', searchSecondDegree(userId, searched.query), false, searched),
      'search_second_degree',
    ),
  ]);
  const missing: string[] = [];
  // A search we CHOSE not to run is not missing. `missing` exists so the prompt
  // can be honest about what failed to arrive, and an apology for a deliberate
  // decision would be a false one.
  if (web === null && !reachingForAPerson) missing.push('web_search');
  if (secondDegree === null) missing.push('search_second_degree');
  return { web, secondDegree, missing, waysIn };
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
  if (
    found.web === null &&
    found.secondDegree === null &&
    found.missing.length === 0 &&
    found.waysIn.size === 0
  )
    return '';
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
  // Row 154: after the results, because it is about them.
  const wayIn = buildWayInSection(found.waysIn);
  return parts.join('\n') + wayIn;
}

/**
 * Ticket 20 row 154 — every company the web finds comes with its way in.
 *
 * Tornike's top of Pr1, from Lika's test on Ninia's account: the web found four
 * marketing agencies and the reply told her to contact them herself. Her own
 * words for what it should have done: look INSIDE those companies for somebody
 * she has a link to, and carry the contact forward.
 *
 * The seat then ran three rounds of prompt work at it (task_main v21, v22,
 * v23) and measured the result: the model searches a NAMED PERSON the web
 * returned, and does not reliably search a FIRM. 1 of 2 on the last round, 0
 * of 3 before it. Their conclusion, and I agree with it: the opening searches
 * are already the server's, so the way in should be the server's too.
 *
 * WHAT IS SEARCHED, AND WHAT IS NOT — the honest half.
 *
 * The FIRST circle is searched per company: searchByTag runs over the owner's
 * own contacts, driven from their own phonebook, and measures about a second.
 *
 * The SECOND circle is NOT, and row 108 is why. One second-circle call
 * measures 15-17 seconds — it has timed out on four of the last five goals
 * against a ten-second budget — so one call per company is not a slow feature,
 * it is an impossible one. When the database work lands this is the first
 * thing that should use it.
 *
 * SO A COMPANY WITH NO FIRST-CIRCLE CONTACT IS REPORTED AS „no way in found in
 * your own contacts", never as „no way in". The difference is the whole of
 * ticket 19 G7 and I am not repeating it here.
 *
 * IT COSTS THE OWNER NO EXTRA WAIT. The second-circle branch times out at ten
 * seconds on essentially every goal, so the run already waits that long; this
 * work happens inside the same window, in the branch that finishes early.
 */

/** How many of the web's results get a way-in search. */
const MAX_WAY_IN_CHECKS = 3;

/**
 * The way-in searches share this, after the web search has returned.
 *
 * 22 SEPTEMBER — THREE SECONDS WAS SMALLER THAN THE THING IT WAS TIMING, and
 * for three days that meant this feature did nothing at all on a real account.
 * From `tool_call_log`, account 501, the twenty-question run of this morning:
 *
 *   way-in lookups that TIMED OUT   76   p50 3,000 ms  (min 2,999, max 3,006)
 *   way-in lookups that FINISHED     2      2,355 and 2,762 ms
 *   real tag queries, same hour, same book       p50 3,705 ms
 *
 * The lookup called the full `searchByTag` — exact pass, fuzzy pass and five
 * enrichment queries — whose median on that book is 3.7 seconds. A three-second
 * ceiling over a 3.7-second median is a ceiling that is essentially always hit,
 * and the two that got under it came in at 2.4 and 2.8: right against it.
 *
 * So ninety-seven times in a hundred the model was handed `unchecked` — „we did
 * not look" — three seconds after the question, having learnt nothing. THE
 * FEATURE WAS PURE COST ON EXACTLY THE ACCOUNTS IT WAS BUILT FOR.
 *
 * THE BUDGET IS NOT WHAT CHANGED. `searchByTagExactOnly` is: the way-in
 * question is „does anybody in my contacts carry this web-card name, as
 * written", and the exact pass answers it without the fuzzy pass a human's
 * typo needs or the enrichment a verdict of one name never reads. The ceiling
 * stays where it is, as a ceiling rather than as the normal outcome, and if it
 * is still being hit the rows say so — `timed_out: true` is how this was found.
 *
 * A NOTE FOR THE NEXT PERSON WHO SETS ONE OF THESE. This is the third budget
 * today that promised what it could not deliver: the shutdown drain's twenty
 * seconds against the platform's eleven, `/admin/asks` printing a page size as
 * a total, and this. A budget is a claim about how long something takes, and a
 * claim about how long something takes has to be measured before it is written.
 */
const WAY_IN_BUDGET_MS = 3_000;

/** A title is „Name — tagline"; the name is what a network is searched for. */
const TITLE_SEPARATORS = /\s+[—–|:·]\s+|\s+-\s+/;
const MAX_NAME_CHARS = 60;

/**
 * Ticket 20 row 154 — the cut landed mid-word.
 *
 * The seat's read of the first live „From the web" (#3632): „Canned Food Market
 * to Reach USD 100.92 Billion by 2027; Incr". A hard slice at 60 characters,
 * ending inside „Increasing".
 *
 * It matters twice over. On the screen it reads as something broken, and these
 * same strings are what findWaysIn SEARCHES the owner's contacts for — half a
 * word finds half the people, or nobody, and the verdict that comes back is
 * wrong rather than merely ugly.
 */
function cutAtAWord(name: string): string {
  if (name.length <= MAX_NAME_CHARS) return name;
  const cut = name.slice(0, MAX_NAME_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  // A single word longer than the cap has no boundary to fall back to; keeping
  // it whole-but-long beats handing the search a fragment.
  return (lastSpace > MAX_NAME_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * The organisation or person each web result is about.
 *
 * A title is usually „Infinity Solutions — ბრენდინგი და მარკეტინგი", so the
 * part before the first separator is the name and the rest is a tagline that
 * would only blur a search. A title with no separator is taken whole.
 *
 * Deliberately not clever. A wrong name here costs one useless search over the
 * owner's own contacts, which returns nothing and is reported as nothing —
 * whereas a name dropped for being unrecognised costs the owner the way in
 * this row exists to find.
 */
/**
 * A page title is not a company name, and the card was printing it as one.
 *
 * The seat's two cards, 18 September, word for word as the owner saw them:
 *
 *   „No way in yet: About, GARDENING AND LANDSCAPE ARCHITECTURE, Tbilisi Zoo…"
 *   „No way in yet: 312 MOVERS, Three Guys And A Truck Chicago, Looking for
 *    trusted office movers in Chicago, IL…, Moving Company in Tbilisi."
 *
 * „About" is Ruderal's About page — and Ruderal is the one genuinely good
 * result in that whole run, described correctly and at length in the prose
 * underneath. It appears in the card under the name „About".
 *
 * Two shapes are handled here and both come from the evidence rather than from
 * imagination. A title whose first segment is a PAGE word („About : Ruderal")
 * has the real name in the next segment. A title that is a SENTENCE („Looking
 * for trusted office movers in Chicago, IL…") has no name in it at all, and its
 * host — ruderal.com, whatever it is — is a better name than a sentence.
 *
 * This is not only display. These same strings are what findWaysIn searches the
 * owner's contacts for, so „About" spends one of the way-in checks asking
 * whether anybody the owner knows is called About.
 *
 * WHAT THIS DOES NOT FIX, said plainly: „GARDENING AND LANDSCAPE ARCHITECTURE"
 * is four words, not a page word, and not a sentence — so it survives both
 * rules and is still wrong. Deciding that a directory heading or a zoo is not
 * in the trade needs judgement this cannot do, and guessing at it would drop
 * real firms with plain names. It stays on the row.
 *
 * ── 21 September, and this time the whole list was measured rather than two
 * cards read. The seat's done-when for row 154 is not „does a verdict line
 * exist" (it does, on 152 of 152) but „is the card built from the raw first
 * results" — their example being „Custom Cabinets in North Georgia" on a
 * TBILISI carpenter goal, North Georgia being the American state.
 *
 * It reproduces exactly. I replayed the real titles of the last 60 opening web
 * searches, from this tool's own log, through this function:
 *
 *   60 searches  →  179 names  →  140 distinct
 *   carrying Georgian letters or a .ge host:  25 of 179
 *
 * and of the distinct 140, roughly four shapes:
 *
 *   page furniture      „Terms of Service" ×4, „Publication" ×2, „Page 3",
 *                       „Exam Preparation", „Certification Forum"
 *   a platform's name   „LinkedIn", youtube.com ×2, facebook.com ×2
 *   a data broker       rocketreach.co, bookyourdata.com, pearsonvue.com,
 *                       introhive.com, revenuegrid.com, PitchBook
 *   a description       „GNN-Powered AIOps" ×6, „Piano lessons in Tbilisi",
 *                       „Long Distance Moving Companies", and the seat's
 *                       „Custom Cabinets in North Georgia"
 *
 * The first three are mechanical and are fixed below. THE FOURTH IS NOT, and
 * it is the one the seat picked — it needs the judgement the paragraph above
 * already says this cannot do. Row 154 stays open on their list; what changes
 * is that the junk around their example stops being searched.
 *
 * Every one of these is also a tag search against the owner's phonebook, which
 * is why the count matters and not only the card.
 */
const PAGE_WORDS = new Set([
  'about',
  'about us',
  'home',
  'homepage',
  'contact',
  'contacts',
  'contact us',
  'services',
  'our services',
  'products',
  'blog',
  'news',
  'faq',
  'welcome',
  // Read off the live titles, 21 September — each of these reached a card and
  // then a phonebook search as if it were the name of a firm.
  'terms of service',
  'terms',
  'terms and conditions',
  'privacy policy',
  'privacy',
  'publication',
  'publications',
  'login',
  'log in',
  'sign in',
  'search results',
  'exam preparation',
  'certification forum',
]);
/** „Page 3" is pagination, and it appeared as a name. A word plus a number. */
const PAGINATION_SEGMENT = /^page\s+\d+$/i;

/**
 * Hosts that never name a firm the owner could know: a platform anybody can
 * publish on, and a data broker that sells contact lists.
 *
 * Used ONLY on the host fallback, never on a title segment — „NetAI Inc. |
 * LinkedIn" must still yield „NetAI Inc.". The fallback is reached when every
 * segment was furniture or a sentence, and on one of these hosts that means
 * the result names nothing to look for. Returning no name drops the row
 * instead of spending a way-in check asking whether the owner knows somebody
 * called youtube.com.
 */
/**
 * The same platforms written as a TITLE segment — „… | Medium", „… | LinkedIn".
 *
 * Only reached when the segments before it were furniture or sentences, so
 * skipping it falls through to the host, which is on the list below and yields
 * no name. The two lists are the same idea in the two places a platform can
 * appear, and are kept apart because one is matched against a host and the
 * other against prose.
 *
 * Data brokers are deliberately NOT here. „PitchBook" as a title segment could
 * be a firm somebody knows; as a HOST it is the broker. The narrower rule is
 * the one with evidence behind it.
 */
const PLATFORM_SEGMENTS = new Set([
  'youtube',
  'linkedin',
  'facebook',
  'instagram',
  'tiktok',
  'reddit',
  'medium',
  'wikipedia',
  'pinterest',
  'quora',
]);

/** A name is short. Beyond this it is a sentence, and a sentence has no name in it. */
const MAX_NAME_WORDS = 6;

/**
 * A DESCRIPTION IS NOT A NAME, and this is row 154's fourth kind — the one the
 * test below pinned as unfixed since 21 September, and the one the seat chose
 * as their example.
 *
 * „Custom Cabinets in North Georgia" on a Tbilisi carpenter goal. Three words,
 * no page word, so every mechanical rule here passed it and it went into
 * somebody's phone book as if it were a person. Tonight's run produced
 * „Handyman Services in Greensboro, NC" for „I have a problem with my
 * apartment".
 *
 * The rule is one English preposition between two words, and it is narrow on
 * purpose: it says nothing about Georgian, and it will not touch „GNN-Powered
 * AIOps" or any other odd-but-real firm name, because telling those apart
 * needs judgement this function still does not have.
 */
const DESCRIPTION_SHAPE = /\s(in|from|for|near|at)\s/i;

function nameFromResult(row: Record<string, unknown>): string {
  const title = typeof row.title === 'string' ? row.title : '';
  const segments = title
    .split(TITLE_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const segment of segments) {
    if (PAGE_WORDS.has(segment.toLowerCase())) continue;
    if (PAGINATION_SEGMENT.test(segment)) continue;
    if (PLATFORM_SEGMENTS.has(segment.toLowerCase())) continue;
    if (DESCRIPTION_SHAPE.test(segment)) continue;
    if (segment.split(/\s+/).length > MAX_NAME_WORDS) continue;
    return cutAtAWord(segment);
  }
  /**
   * AND WHEN NO SEGMENT IS A NAME, THERE IS NO NAME — the host is not one.
   *
   * This used to fall back to the hostname, on the stated ground that „it is
   * the one part of a web result that USUALLY names something real", with a
   * deny-list of platforms and data brokers beside it. The table disagrees,
   * over the whole life of the feature:
   *
   *   every way-in lookup ever                482     found a way in: 37
   *   lookups whose name was a bare host      106     found a way in:  0
   *   lookups whose name was a description     90     found a way in:  0
   *   the two together                        196     found a way in:  0
   *                                       115.2 seconds of database work
   *
   * Not one host and not one description has ever matched a contact. All 37
   * successes came from a name that is neither. The deny-list was the right
   * idea aimed at the wrong half: `tiktok.com` was refused and `electrik.ge`,
   * `whatclinic.com`, `preply.com` and `Architect.Tbilisi.Gov.Ge` were not —
   * and that last one is the seat's „a government website address", going
   * into somebody's contacts as if it were a person.
   *
   * So the fallback and its deny-list are both gone. Forty-one per cent of the
   * lookups go with them and nothing measurable is lost.
   */
  return '';
}

export function webResultNames(result: unknown): string[] {
  if (result === null || typeof result !== 'object') return [];
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows)) return [];
  const names: string[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const name = nameFromResult(row as Record<string, unknown>);
    if (name === '' || names.includes(name)) continue;
    names.push(name);
    if (names.length >= MAX_WAY_IN_CHECKS) break;
  }
  return names;
}

export type WayIn =
  /** Somebody in the owner's own contacts is tied to this name. */
  | { readonly kind: 'first_circle'; readonly who: string }
  /** Searched, and the owner's own contacts hold nobody. */
  | { readonly kind: 'none' }
  /** Not searched — a timeout or a failure. Never rendered as „nobody". */
  | { readonly kind: 'unchecked' };

function firstPersonNamed(result: unknown): string | null {
  if (result === null || typeof result !== 'object') return null;
  const rows = (result as { results?: unknown }).results;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  if (first === null || typeof first !== 'object') return null;
  const name = (first as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/**
 * Where a way-in lookup came from, so the search it runs can be written down.
 * Absent for a caller that has no thread — see `findWaysIn`.
 */
export interface WayInOrigin {
  readonly threadId?: number | null;
  readonly runId?: string | null;
}

/**
 * For each name the web returned, who in the owner's own contacts is tied to
 * it. Never throws: a way-in lookup that fails leaves `unchecked`, and the
 * section says so in words rather than implying an empty network.
 *
 * EVERY ONE OF THESE IS A TAG SEARCH, AND UNTIL 21 SEPTEMBER NONE OF THEM WAS
 * WRITTEN DOWN. Measured that evening on one build's own log, 15:36-15:50:
 *
 *   tag searches the product actually ran   16
 *   tag searches `tool_call_log` recorded    2   (the model's own calls)
 *
 * The other fourteen were these. So every figure anyone has quoted about what
 * `search_by_tag` costs — row 108's whole question, the day-by-day tables in
 * TASKS.md, `slow.sh --ready` — was drawn from a QUARTER of the calls, and
 * from the cheap quarter: the model types a trade word, while a way-in looks
 * up a web page's title and carries a median of 12 spelling variants against
 * the model's three or four.
 *
 * The comment three hundred lines above this one says „a search nobody logs is
 * a search nobody can ask about", and it was written about the web search in
 * the same function, four hours before these lookups were added beneath it.
 *
 * Logged under `search_by_tag:way_in`, the same suffix convention the opening
 * searches use, so a reader can tell a lookup the product chose from a call
 * the model chose — and so the counters that ask about the model's behaviour
 * keep answering about the model.
 *
 * NO RESULT SAMPLE, ever. These results are the owner's own contacts. The
 * opening web search samples its titles because a web page is public; a
 * phonebook is not, and a debugging table is not the place for one.
 *
 * A caller without a thread cannot be recorded at all: `tool_call_log`
 * declares `thread_id NOT NULL`. That is a limit worth knowing rather than
 * working around, so it is written here instead of being hidden by a zero.
 */
export async function findWaysIn(
  userId: string,
  names: readonly string[],
  origin: WayInOrigin = {},
): Promise<Map<string, WayIn>> {
  const out = new Map<string, WayIn>();
  if (names.length === 0) return out;
  const deadline = Date.now() + WAY_IN_BUDGET_MS;
  const record = (name: string, result: unknown, startedAt: number): void => {
    if (origin.threadId === undefined || origin.threadId === null) return;
    void logToolCall({
      threadId: origin.threadId,
      surface: 'chat',
      runId: origin.runId ?? null,
      userId,
      tool: 'search_by_tag:way_in',
      input: { tag_query: name },
      result,
      durationMs: Date.now() - startedAt,
    });
  };
  await Promise.all(
    names.map(async (name) => {
      const startedAt = Date.now();
      try {
        const left = deadline - Date.now();
        if (left <= 0) {
          out.set(name, { kind: 'unchecked' });
          return;
        }
        const result = await Promise.race([
          searchByTagExactOnly(userId, name),
          new Promise<null>((resolve) => {
            const t = setTimeout(() => resolve(null), left);
            t.unref?.();
          }),
        ]);
        // The budget running out is recorded too, and as its own outcome: a
        // lookup that did not finish is the difference between „nobody" and
        // „we did not look", which is the whole reason `unchecked` exists.
        record(name, result === null ? { found: false, timed_out: true } : result, startedAt);
        if (result === null) {
          out.set(name, { kind: 'unchecked' });
          return;
        }
        const who = firstPersonNamed(result);
        out.set(name, who === null ? { kind: 'none' } : { kind: 'first_circle', who });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[opening-search] way-in lookup failed for "${name}":`,
          (err as Error).message,
        );
        record(name, { error: (err as Error).message }, startedAt);
        out.set(name, { kind: 'unchecked' });
      }
    }),
  );
  return out;
}

/** The way-in verdicts as prompt lines. Empty when nothing was checked. */
export function buildWayInSection(waysIn: ReadonlyMap<string, WayIn>): string {
  if (waysIn.size === 0) return '';
  const lines: string[] = [];
  for (const [name, wayIn] of waysIn) {
    if (wayIn.kind === 'first_circle') {
      lines.push(`- ${name}: შენს კონტაქტებში — ${wayIn.who}. მასზე გაიარე.`);
    } else if (wayIn.kind === 'none') {
      // Ticket 19 G7: „your own contacts hold nobody" is not „nobody".
      lines.push(
        `- ${name}: შენს პირად კონტაქტებში კავშირი ვერ ვიპოვე (მეორე წრე ჯერ არ შემიმოწმებია).`,
      );
    } else {
      lines.push(`- ${name}: კავშირი ვერ შევამოწმე — ძიებამ ვერ მოასწრო.`);
    }
  }
  return (
    '\n\n## ვებში ნაპოვნების გზა\nსერვერმა თითოეულ ნაპოვნ სახელზე მოძებნა მფლობელის ' +
    'საკუთარი კონტაქტები. არ უთხრა მფლობელს, რომ კომპანიას თვითონ დაუკავშირდეს, ' +
    'სანამ ქვემოთ დაწერილს არ გაითვალისწინებ.\n' +
    lines.join('\n')
  );
}

/**
 * Ticket 20 row 154 — „From the web", written by the SERVER.
 *
 * The seat's ask (#3141), after three prompt rounds could not get the reply to
 * do it: v24, v25 and v26 all dropped the web half. On v25 goal 4423 named two
 * of three web results with their way in; 4424, 4425 and 4426 named no web firm
 * at all, though the search had returned results carrying ways_in. The final
 * writer simply loses it.
 *
 * So it stops being something a model is asked for. The same shape as the plan
 * card and row 98's updates message: the server writes it, deterministically,
 * as its own message after the reply.
 *
 * WHAT IS DELIBERATELY NOT IN IT. No public phone number, no link, and not one
 * word suggesting the owner contact a company himself — that last is the seat's
 * done-when and it is the whole reason row 154 exists: the product is the way
 * in through somebody you know, and „here is a firm, ring them" is the thing it
 * is supposed to replace.
 *
 * WHO GETS A LINE — and this has now been decided twice, in opposite
 * directions, by two different people. Both were right about the thing they
 * were looking at.
 *
 * First I gave the four slots to the best verdicts and let „nobody in your
 * contacts" and „could not check" fill what was left. The seat's read of the
 * first live run (#3632): every line on both goals ended with „I could not
 * check the way in", and their words were that a message saying that three
 * times teaches the owner to ignore the message. I cut it to first-circle
 * only, and to nothing at all when there were none.
 *
 * The founder overruled that on 17 September, having seen the result: a web
 * result with no way in STAYS, as long as the reply says plainly that no path
 * is visible yet. He wants to see the names and chase them himself. The
 * suppression is only for when there is genuinely nothing to show, not for
 * when the only shortcoming is the missing path.
 *
 * Both hold at once if the pathless names share ONE line instead of each
 * getting their own „could not check". The names are all there, which is what
 * he asked for; the sentence that taught people to skim is written once.
 *
 * „გზა ჯერ ვერ ვნახე" is deliberately true of BOTH pathless kinds. It says we
 * have not found a way, and does not claim we looked — so „could not check"
 * is never rendered as „nobody", which is G7 and still holds. The difference
 * between the two still reaches the MODEL in the prompt section and the tool
 * result, where it changes what it may say.
 */
const FROM_THE_WEB_MAX = 4;

/**
 * The seat's #4061 (h): this block was Georgian in an English thread, like
 * every other line the server writes for itself.
 */
interface WebBlockWords {
  readonly heading: string;
  readonly wayIn: (name: string, who: string) => string;
  readonly pathless: (names: string) => string;
}

const WEB_BLOCK: Record<RunLanguage, WebBlockWords> = {
  ka: {
    heading: 'ვებში ეს ვიპოვე:',
    wayIn: (name, who) => `• ${name} — შენი კონტაქტი იქ: ${who}.`,
    pathless: (names) => `გზა ჯერ ვერ ვნახე: ${names}.`,
  },
  en: {
    heading: 'Found on the web:',
    wayIn: (name, who) => `• ${name} — your contact there: ${who}.`,
    pathless: (names) => `No way in yet: ${names}.`,
  },
  ru: {
    heading: 'Нашёл в интернете:',
    wayIn: (name, who) => `• ${name} — твой контакт там: ${who}.`,
    pathless: (names) => `Пути пока не нашёл: ${names}.`,
  },
  es: {
    heading: 'Encontré esto en la web:',
    wayIn: (name, who) => `• ${name} — tu contacto allí: ${who}.`,
    pathless: (names) => `Todavía no veo una vía: ${names}.`,
  },
};

export function buildFromTheWebMessage(
  waysIn: ReadonlyMap<string, WayIn>,
  language: RunLanguage = 'ka',
): string | null {
  const entries = [...waysIn.entries()].slice(0, FROM_THE_WEB_MAX);
  if (entries.length === 0) return null;
  const words = WEB_BLOCK[language];
  const lines = entries
    .filter(
      (entry): entry is [string, Extract<WayIn, { kind: 'first_circle' }>] =>
        entry[1].kind === 'first_circle',
    )
    .map(([name, wayIn]) => words.wayIn(name, wayIn.who));
  const pathless = entries
    .filter(([, wayIn]) => wayIn.kind !== 'first_circle')
    .map(([name]) => name);
  if (pathless.length > 0) lines.push(words.pathless(pathless.join(', ')));
  return `${words.heading}\n${lines.join('\n')}`;
}

/**
 * Ticket 20 row 154, second half — what the model is told when the verdicts
 * ride back inside its own web_search result.
 *
 * The prompt section says the same thing for the opening search. This says it
 * where the model is deciding what to write about each firm, which is the
 * moment that matters: on 4293 three firms were named with their public
 * number and nothing else, because nothing had told it there was a way in to
 * look for.
 */
export const WAY_IN_TOOL_NOTE =
  'ways_in — თითოეულ ნაპოვნ სახელზე სერვერმა უკვე მოძებნა მფლობელის საკუთარი კონტაქტები. ' +
  'first_circle = მიდი ამ ადამიანზე. none = მის პირად კონტაქტებში კავშირი არაა (მეორე წრე ' +
  'ჯერ არ შემოწმებულა — „გზა არ არსებობს" არ თქვა). unchecked = ვერ შევამოწმე. ' +
  'კომპანიას თვითონ დაუკავშირდი მხოლოდ მაშინ შესთავაზე, თუ ეს სტრიქონი გაითვალისწინე.';
