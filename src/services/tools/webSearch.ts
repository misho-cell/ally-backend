import { hasGeorgian, georgianToLatin } from './transliterate';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;

// Tavily's own synthesized `answer` collapses several results into one sentence
// and, on personnel news, garbles exact titles — it turned "will succeed [the
// Deputy CEO in charge of Mass Retail Banking] with effect from 1 March 2025"
// into "is the CEO as of March 1, 2025". We do NOT surface that sentence; the
// model reasons over the verbatim titles/snippets itself (it carries the
// officeholder rule), so a role stated in a source is never silently promoted.
/**
 * The tester's 1014 (thread 30133, accountants in Rustavi): an ordinary goal
 * reply named six firms from these results inside one parenthesis — no link,
 * no phone. The same rule already holds for a plan reply (966); the tool
 * description says it too, but a description is read once at the top and this
 * guidance is read with the results, right before the reply is written.
 */
const NAMED_IN_FULL_OR_NOT_AT_ALL =
  'Anyone or any firm you name from these results goes on its own line with the full link of ' +
  'the page it came from, and its public phone or e-mail if that page shows one — or is not ' +
  'named at all. Never a list of names in passing.';

const RESULT_GUIDANCE =
  'These are raw search results. Derive facts only from the snippets below and ' +
  'preserve exact job titles verbatim — never shorten a qualified title (e.g. ' +
  '"Deputy CEO in charge of X") to a broader one (e.g. "CEO"). For a current ' +
  "officeholder, prefer a result marked official:true (the institution's own " +
  'site) and READ that page with fetch_page before naming anyone — a news ' +
  'snippet may be stale or name a former/acting holder. If fetch_page cannot ' +
  'read the page, you may NOT name the officeholder from these snippets — ' +
  'say plainly that the official page could not be read. A name you print must ' +
  'appear in fetched page text you actually received in this conversation, and you ' +
  'must cite that page; two different names for one office is a failure — when in ' +
  'doubt, the scripted line („I could not verify") is the right answer. ' +
  NAMED_IN_FULL_OR_NOT_AT_ALL;

// The institution's own domain outranks any news article on "who currently
// holds this role". Georgian public bodies live under gov.ge; parliament and
// a few others have their own roots.
const OFFICIAL_DOMAIN_RE =
  /(^|\.)gov\.ge$|(^|\.)parliament\.ge$|(^|\.)court\.ge$|(^|\.)nbg\.gov\.ge$|(^|\.)\w+\.gov$/i;

function isOfficialDomain(url: string): boolean {
  try {
    return OFFICIAL_DOMAIN_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// A fetched page's readable text lets the model verify a current officeholder
// off an institution's own roster instead of a stale third-party directory —
// search snippets alone can't carry the actual name. Same rule as search: read
// the page's words verbatim, don't invent or promote a role.
const PAGE_CHARS = 8000;
const PAGE_GUIDANCE =
  "This is the page's own text. Read the answer off it verbatim (exact names and " +
  'titles); if the page does not state it, say so — do not guess or fall back to a ' +
  'name not on the page.';

/**
 * ⚠️ 25 SEPTEMBER — THE MODEL WAS SHOWN PART OF A PAGE AND TOLD TO CONCLUDE
 * FROM IT.
 *
 * „ვინ არის ახლა თბილისის მერი?" The run fetched tbilisi.gov.ge/government/2
 * twice, got 8,471 characters back both times, and answered that the mayor's
 * name „is not readable in the page's text, only menu links". The tester then
 * opened the same page in a real browser: 3,055 characters of visible text,
 * and it carries the name.
 *
 * The content is cut at PAGE_CHARS and NOTHING SAID SO. Measured over every
 * page this product has ever fetched:
 *
 *     at the 8,000 cap   44        4,000-7,999    7
 *     500-3,999          27        under 500     18
 *
 * FORTY-SIX PER CENT OF PAGE READS ARE TRUNCATED, and on every one of them the
 * guidance above says „if the page does not state it, say so" to a model that
 * has been shown the beginning of the page. „I was not shown it" comes out as
 * „the page does not say it" — the same confusion this codebase has had to
 * undo in `push_deliveries`, in `ok = false`, and in `usage_events`, now
 * inside the tool that D151 leans on.
 *
 * Misho's decision, 25 September, asked in plain words: the reader should
 * ADMIT it could not read the page. So a truncated read says so, and says what
 * absence is worth.
 */
const PAGE_GUIDANCE_ENDED =
  'The page ends before this point — there is nothing more to read. If what ' +
  'you were looking for was not in the parts you read, the page does not ' +
  'state it, and you may say so.';
const PAGE_GUIDANCE_PARTIAL =
  'This is only PART of the page — it was cut at the character limit. Read ' +
  'the answer off what is here, verbatim. If what you are looking for is NOT ' +
  'here, you have NOT established that the page lacks it: you were not shown ' +
  'the rest. Call fetch_page again on the same url with from_character set to ' +
  'next_from_character to read on. Only after the page runs out may you say ' +
  'it is not there, and never fall back to a name from anywhere else.';

/**
 * ⚠️ 27 SEPTEMBER, ROW 123(b) — ADMITTING THE CUT WAS HALF THE ANSWER.
 *
 * The 25 September note below this one ends with Misho's decision: a truncated
 * read should ADMIT it could not read the page. It does, and the tester's run
 * that evening is that sentence working exactly as designed — „on the official
 * page it says the mayor is currently (name could not be confirmed on the
 * page)". Honest, and useless to the person who asked who the mayor is.
 *
 * The numbers say why it will not fix itself. The page was fetched TWICE and
 * returned 8,471 characters both times against a cap of 8,000; the tester
 * opened the same page in a browser and read 3,055 characters of visible text,
 * WITH the name in them. So the model was shown 8,000 characters of which most
 * is not what a reader sees, and the 471 it was not shown are where the answer
 * lived.
 *
 * TWO THINGS I DID NOT DO, and they are why this is the third attempt rather
 * than a fourth guess. I did not raise the cap to fit one example — 44 of the
 * 96 page reads this product has ever made hit it, and a number chosen to pass
 * tbilisi.gov.ge says nothing about the next page. I did not touch the prompt:
 * two attempts at this row were prompt changes, both made the output worse and
 * both were reverted.
 *
 * What was missing is a WAY TO READ ON. „You were not shown the rest" was a
 * dead end — the model could not ask for the rest, because nothing accepted
 * the request. Now it can, one page-length at a time, and it pays for each
 * part exactly as it pays for each fetch. A page whose answer is at character
 * 8,100 costs one more call; a page with no answer in it still ends with „not
 * there", but only after the page has actually run out.
 */

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

interface TavilyExtractResponse {
  results?: { url: string; raw_content?: string }[];
}

// Two prod fabrications (threads 5941/6087) traced to exactly this: Tavily's
// extractor returned NO text for tbilisi.gov.ge pages — even at advanced
// depth — and the model then named an officeholder from a stale search
// snippet. The note must forbid that fallback in so many words.
const NO_TEXT_NOTE =
  'The page returned no readable text. You may NOT name a person or ' +
  'officeholder from search snippets instead — tell the user plainly that ' +
  'the official page could not be read right now.';

// The direct-fetch fallback hits a model-supplied URL from OUR server, so
// private/internal targets must be refused (SSRF). Tavily-side fetches never
// had this concern — their infrastructure did the fetching.
const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal)$|^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)|^(\[?::1\]?|0\.0\.0\.0)$/i;

export function isBlockedFetchHost(hostname: string): boolean {
  return PRIVATE_HOST_RE.test(hostname);
}

/**
 * Last-resort page read when Tavily's extractor comes back empty: plain GET +
 * crude tag strip. Gov pages that defeat the extractor often still carry
 * their roster in plain markup, so even rough text beats an empty answer.
 */
async function fetchRawPageText(url: string): Promise<string> {
  try {
    if (isBlockedFetchHost(new URL(url).hostname)) return '';
  } catch {
    return '';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AllyBot/1.0)' },
    });
    if (!response.ok) return '';
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether search can work at all.
 *
 * Exported so a background job can ask BEFORE it starts, rather than learning
 * it one failed call at a time — an unconfigured key would otherwise let the
 * research runner spend its whole daily allowance writing identical error rows.
 * The key name stays known in one place.
 */
export function webSearchConfigured(): boolean {
  return Boolean(TAVILY_API_KEY);
}

/**
 * A ROUTE THAT IS DOWN IS NOT A SEARCH THAT FOUND NOTHING, AND THE OWNER WAS
 * BEING TOLD THE SECOND.
 *
 * 23 September, 08:09:16: Tavily began refusing every call — „This request
 * exceeds your plan's set usage limit." Twelve failures in five minutes. What
 * the owner saw was the assistant writing that it had found nothing on the web
 * and would try again, because the only thing this function handed the model
 * was `{ error: "Tavily error 432: …" }` and the model had to invent the rest.
 *
 * TWO DIFFERENT FAULTS WERE BEING RETURNED AS ONE FACT. „I looked and there is
 * nothing" and „I could not look" are not the same sentence, and only the first
 * of them is ever true when the route is down. It is the same distinction
 * `outage.sh` makes between NOTHING PROVEN and OK, and the same one the second
 * circle's `missing` list already makes — this tool was the one place that
 * collapsed them.
 *
 * AND THE PROVIDER'S OWN WORDS MUST NOT REACH THE MODEL. „exceeds your plan's
 * set usage limit. Please upgrade your plan or contact support@tavily.com" is
 * commercial detail about OUR account, handed to something that is talking to a
 * user. A person asking for a plumber does not need to hear which supplier we
 * buy search from or what we owe them. The status is kept for OUR log; what the
 * model gets is what it is allowed to say.
 */
const UNAVAILABLE_GUIDANCE =
  'THE WEB ROUTE IS UNAVAILABLE RIGHT NOW — this is NOT an empty result. ' +
  'Do NOT say you found nothing on the web, and do NOT say you will try again ' +
  'in this conversation. Tell the owner in one short sentence that the web ' +
  'search is not working at the moment and that you are going on with their ' +
  'own network, then do exactly that. Never name the supplier, the account or ' +
  'the reason.';

/**
 * WHICH KEY THE RUNNING CONTAINER IS ACTUALLY HOLDING — the last five
 * characters and the length, and nothing else, ever.
 *
 * ROW 257, 23 September. The provider refused with „exceeds your plan's set
 * usage limit" while the account's own dashboard showed `0 / 1,500` used. Both
 * cannot be true of one account, so the question stopped being „has the plan
 * been paid for" and became „is the server holding the key that dashboard is
 * describing" — and nothing in this system could answer it. `env.sh` cannot
 * READ a Railway variable by construction: their query returns every variable
 * at once, so reading one would pull the database URL and the JWT secret into
 * whoever asked. That property is worth keeping.
 *
 * WHY THIS IS NOT A CREDENTIAL IN A LOG, which is a rule I am not making an
 * exception to. The last five characters are exactly what Tavily's own
 * dashboard prints beside the key — `tvly-dev-****yBjpI` — so this discloses
 * nothing to anybody who can already see the page we are comparing against.
 * They cannot authenticate anything. The length is there because a truncated
 * or whitespace-padded value is the other way this goes wrong and it is
 * invisible in a tail.
 *
 * It is written only when a call has ALREADY FAILED, so an ordinary day
 * produces none of these lines at all.
 */
function keyFingerprint(): string {
  const key = TAVILY_API_KEY ?? '';
  return key === '' ? 'no key' : `…${key.slice(-5)} (${key.length} chars)`;
}

function unavailable(reason: string): object {
  // Ours to read, in our own log, and never handed to the model.
  // eslint-disable-next-line no-console
  console.error(`[web-search] route unavailable: ${reason} — key ${keyFingerprint()}`);
  return { unavailable: true, guidance: UNAVAILABLE_GUIDANCE };
}

export async function webSearch(query: string): Promise<object> {
  if (!TAVILY_API_KEY) {
    return unavailable('TAVILY_API_KEY missing');
  }

  // If query contains Georgian script, append transliterated Latin version
  // so search engines can match both scripts (e.g. "მახარაძე makharadze")
  const enrichedQuery = hasGeorgian(query) ? `${query} ${georgianToLatin(query)}` : query;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: enrichedQuery,
        search_depth: 'basic',
        max_results: MAX_RESULTS,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return unavailable(`Tavily error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as TavilyResponse;

    return {
      guidance: RESULT_GUIDANCE,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, SNIPPET_CHARS),
        // Institutional/government domains are the authoritative source for
        // current officeholders — news can be stale. When official:true is
        // present, prefer that result and read the page itself (fetch_page)
        // before naming who holds a role.
        ...(isOfficialDomain(r.url) && { official: true }),
      })),
    };
  } catch (err) {
    return unavailable((err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and return the readable text of one page (via Tavily's extract endpoint)
 * so the assistant can read an official roster/page directly rather than relying
 * on search snippets. URL must be http(s); content is truncated.
 */
/**
 * One page result, which says whether it is the whole page.
 *
 * `read: 'partial'` and the two counts are there so a person reading the log
 * can see it too — the model gets the sentence, and whoever asks „why did it
 * say the page does not mention him" gets the numbers.
 */
function pageResult(url: string, text: string, from = 0): object {
  const start = Number.isFinite(from) && from > 0 ? Math.floor(from) : 0;
  // Past the end is not an error and must not read as „the page says nothing":
  // it is the page having run out, which is the one case where „not there" is
  // established rather than assumed.
  if (start >= text.length) {
    return {
      url,
      guidance: PAGE_GUIDANCE_ENDED,
      content: '',
      read: 'past_the_end',
      characters_available: text.length,
    };
  }
  const content = text.slice(start, start + PAGE_CHARS);
  const nextFrom = start + content.length;
  const whole = start === 0 && nextFrom >= text.length;
  return {
    url,
    guidance: whole ? PAGE_GUIDANCE : PAGE_GUIDANCE_PARTIAL,
    content,
    ...(whole
      ? {}
      : {
          read: 'partial',
          characters_shown: content.length,
          characters_available: text.length,
          read_from_character: start,
          ...(nextFrom < text.length ? { next_from_character: nextFrom } : {}),
        }),
  };
}

export async function fetchPage(url: string, fromCharacter = 0): Promise<object> {
  if (!TAVILY_API_KEY) {
    return { error: 'Web fetch not configured (TAVILY_API_KEY missing)' };
  }
  const target = (url ?? '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return { error: 'Pass a full http(s) URL.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      // Official/gov pages often defeat the basic extractor ("blocks text" —
      // two officeholder fabrications trace to unreadable tbilisi.gov.ge).
      // Advanced depth renders these pages properly; used only where it matters.
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        urls: [target],
        ...(isOfficialDomain(target) && { extract_depth: 'advanced' }),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `Tavily extract error ${response.status}: ${body}` };
    }

    const data = (await response.json()) as TavilyExtractResponse;
    const content = data.results?.[0]?.raw_content ?? '';
    if (!content.trim()) {
      // Extractor came back empty — try a plain fetch before giving up.
      const fallback = await fetchRawPageText(target);
      if (fallback) return pageResult(target, fallback, fromCharacter);
      return { url: target, content: null, note: NO_TEXT_NOTE };
    }
    return pageResult(target, content, fromCharacter);
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
