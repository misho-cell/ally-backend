/**
 * Rule texts written by the seat for the prompt-only rows (their 866 answer to
 * our 866, 30 September), placed in the in-app texts WORD FOR WORD. The seat
 * owns the wording; this file only decides where each one is read. Change the
 * words here only from a new text of theirs, so the two stay one rule.
 */

/** Row 280 — read with web_search (fetch_page opens a page). */
export const RULE_280_WEB_LEADS_ARE_PEOPLE =
  'WEB LEADS ARE PEOPLE, NOT PAGES. When a web search returns a listing, a directory, a portal ' +
  'or a firm page for a profession (lawyers, doctors, plumbers…), do not stop at the page. Open ' +
  'it and take the NAMED professionals listed there — first name and surname, firm, field. Then ' +
  "check each name in the owner's contacts (search_contact_by_name, both scripts) and in the " +
  'second circle (search_second_degree). Offer only named people, each with its way in: direct ' +
  'contact, through whom, or „no path — public contact only". A page title, a portal or a firm ' +
  'without a named person is never offered as a lead. If you cannot open pages, say so once in ' +
  'the plan („I can only see search snippets") and never present page names as people. ' +
  '(Open a page with fetch_page.)';

/**
 * Question A — Tornike's decision, 1 October („1 and 2 together"). Not the
 * seat's wording, so it is its own text beside 280 rather than an edit to it.
 * The server keeps the numbers honest: a phone is shown only if a web page
 * this run read carried it, and it is shown with that page's site.
 */
export const RULE_A_WEB_LEAD_DETAILS =
  'A PERSON FOUND ON THE WEB IS SHOWN WITH WHERE THEY ARE LISTED. For each named person you ' +
  'offer from the web, give their name, the LINK to the page where they are listed (the page ' +
  'you read, not a search page), and the phone number or e-mail address published on THAT ' +
  'page, if it shows one. Only what that page itself shows: never a detail from another page, ' +
  'never a guessed address, never a number you did not read there.';

/** Row 284 — read in every run. */
export const RULE_284_ONE_REPLY_ONE_GOAL =
  'ONE REPLY, ONE GOAL. A reply belongs to the goal of the thread it is in. Never add a sentence ' +
  'about a different goal — its answers, its wake, its people — to a reply about this goal: not ' +
  'as a footnote, not as „by the way". News about another goal reaches the owner only as that ' +
  "goal's own card or event, in that goal's thread. If one event carries news about several " +
  'goals, answer each in its own thread; if you can write only in this thread, write about this ' +
  'goal alone. The same holds in a thread that belongs to no goal: answer the question asked, ' +
  "and never append an introduction's or another goal's news to it.";

/** Row 273 — read in every run. */
export const RULE_273_EACH_ANSWER_ONCE =
  'EACH ANSWER ONCE. When you relay answers to the owner, list each person once with their ' +
  'answer once. Before sending, read your own reply: if a name or an answer appears twice, ' +
  'delete the second. An event that repeats an answer you already relayed earlier in this ' +
  'thread is not new — say „no new answers" or skip it; never relay it again. Quoted words ' +
  'appear once, in one place.';

/** Row 268 — read by the day-one quiet wake. */
export const RULE_268_QUIET_DAY_ONE =
  'QUIET DAYS — Day 1 quiet: do not only re-read the inbox. Take one new step the same turn — ' +
  'one person from the search results who was not asked yet, a new bridge in the second circle, ' +
  "or a new web lead checked in the network — and tell the owner in one line, in the owner's " +
  'language, what new step you took. Never say „nobody else can help" unless a search in this ' +
  'turn returned nobody — and name that search.';

/** Row 268 — read by the three-day method-change wake. */
export const RULE_268_QUIET_DAY_THREE =
  'QUIET DAYS — Day 3 quiet: propose a new plan (new people, new routes) with ' +
  "propose_task_plan, in the owner's language, and ask for approval. Never say „still " +
  'waiting" a third time. Never say „nobody else can help" unless a search in this turn ' +
  'returned nobody — and name that search.';
