import { openaiClient } from '../config/openai';
import { finalAnswerModel, toLedgerUsage } from './finalAnswer.service';
import { recordClaudeUsage } from './costLedger.service';

/**
 * Ticket 20 row 126, fourth pass — the opening web search gets a QUERY, not a
 * sentence.
 *
 * The seat read the sample row 126's third pass added, and the sample answered
 * a question I had not thought to ask. On goal 3895 („ნოტარიუსი მჭირდება ბინის
 * ნასყიდობის ხელშეკრულებისთვის.") the five results were a microfinance blog on
 * mortgages, two law-firm articles on purchase contracts, a PDF of a contract
 * and a company document. Not one notary, office or address.
 *
 * So the model was RIGHT to show nothing from the web. The search failed, not
 * the reply — and without the sample that distinction was invisible: the table
 * said five results, ok, 5.4 seconds.
 *
 * The cause is that we send the owner's whole sentence. „I need a notary for
 * an apartment purchase contract" is a good sentence and a bad query; it is
 * mostly about contracts, so contracts are what comes back. A person looking
 * for the same thing types two words and a city.
 *
 * WHY A MODEL AND NOT A WORD LIST. That was my first design, and the two goals
 * we have logged kill it between them. In „ნოტარიუსი მჭირდება …" the first
 * noun IS the service and everything after it is noise; in „ხელოსანი მჭირდება,
 * ვინც ტოიოტა პრიუსის ჰიბრიდულ ბატარეას შეაკეთებს." the first noun is
 * „craftsman", which is worth nothing, and the whole value is in the clause
 * after it. No stop-word rule separates those two — telling them apart is
 * reading the sentence, which is what a model is for.
 *
 * IT CAN ONLY IMPROVE THE QUERY OR LEAVE IT ALONE. Every failure path returns
 * the original text: no key, no model, a timeout, an error, an empty or
 * implausible answer. The worst case is exactly what happens today.
 */

/**
 * Its own variable, defaulting to whatever writes the final answer.
 *
 * A separate name means the cheap model can be changed for this without
 * touching the one that talks to the user; the default means it works the day
 * this deploys rather than the day somebody remembers to set a second
 * variable. Both unset = distillation off, and off is precisely today.
 */
function queryModel(): string {
  return process.env.SEARCH_QUERY_MODEL?.trim() || finalAnswerModel();
}

/**
 * Small on purpose, and 2.5 s turned out to be too small for the one sentence
 * that needed it most.
 *
 * The original reasoning: this holds up the opening web search, which holds up
 * the first reply, and the web search itself measures 4.0-5.4 s inside a 10 s
 * budget. Sound at the time.
 *
 * What it missed is that the longest input is the one most likely to run over —
 * and the longest input is exactly the one whose search is ruined by not being
 * distilled. Goal 4621, 17 September:
 *
 *   13:58:27 [search-query] not distilled (gpt-5.6-terra failed: Request timed
 *            out.); searching the goal text as typed
 *
 * Ninia's sentence, three times today, while the two short goals of the same
 * minute distilled fine. So the budget was not protecting the first reply from
 * a slow distiller; it was declining precisely when distilling mattered.
 *
 * Five seconds. Against a first reply that measured 92-176 s on those same
 * three goals, two and a half more is not a cost anybody can perceive.
 *
 * WHAT THIS DOES NOT BUY, said here so nobody reads it as the row 108 fix:
 * distilling barely moves the second circle. Goal 4622 was distilled to three
 * words and its opening search still took 15.2 s, against 17.5 s for 4621's
 * capped sentence. The cold first call dominates both. This fixes the WEB
 * search being handed a sentence with a greeting in it, which is row 126's
 * problem and worth fixing on its own.
 */
const DISTIL_BUDGET_MS = 5_000;

/** A query, not a sentence. Anything longer is the model ignoring the brief. */
const MAX_QUERY_CHARS = 120;

/**
 * Ticket 20 row 126 — 64 was enough for the ANSWER and not for the thinking.
 *
 * Ninia's sentence would not distil, three builds running, and the reason
 * changed under me. At a 2.5 s budget the log said „Request timed out". I
 * raised it to 5 s, the call started completing, and the log then said what
 * was actually wrong:
 *
 *   17:31:09 [search-query] not distilled (empty answer); searching the goal
 *            text as typed
 *
 * gpt-5.6-terra is a reasoning model, and `max_completion_tokens` bounds the
 * reasoning AND the reply together. A three-word sentence needs little
 * thinking and leaves room to answer in; Ninia's 160-character sentence with
 * its greeting, its cannery and its two requests spends the whole 64 on
 * reasoning and returns an empty string. The harder the input, the more
 * certainly it fails — which is exactly backwards, and is why only the long
 * one ever broke.
 *
 * 512, and it costs nothing to be generous: the answer is still bounded at
 * MAX_QUERY_CHARS, so a model that decides to write an essay is rejected by
 * usableQuery as it always was. What the number has to cover is the thinking,
 * and 64 never did.
 */
const MAX_OUTPUT_TOKENS = 512;

/**
 * The brief, rewritten after the first live test.
 *
 * Goal 3928 repeated 3895's sentence word for word and the distiller answered
 * „ნოტარიუსი ბინის ნასყიდობის ხელშეკრულება" — shorter, and still four of five
 * results were articles, because it kept what the notary was FOR and the
 * purpose is exactly what pulls articles. Someone writing about apartment
 * purchase contracts is not someone who notarises one.
 *
 * So the line to draw is not length. It is between a word that narrows WHAT
 * KIND of person or business is wanted, and a word that says WHY they are
 * wanted. „Toyota Prius hybrid battery" is the first: it picks out which
 * mechanic. „For an apartment purchase contract" is the second: every notary
 * does those. Both examples are in the brief because both are real, both are
 * ours, and the rule stated without them reads as „be brief", which is the
 * instruction that produced 3928.
 */
const SYSTEM_PROMPT = [
  'You turn one person’s description of what they need into a short web search query,',
  'the kind a person types when they want to find a provider — not an article.',
  '',
  'Rules:',
  '- Answer with the query ALONE. No quotes, no explanation, no punctuation at the end.',
  '- 2 to 5 words. Write it in the same language the person used.',
  '- Drop every first-person word — "I need", "I am looking for", "who will".',
  '- KEEP words that narrow WHAT KIND of provider is wanted.',
  '- DROP words that say WHY they are wanted, or what the result is for. Those',
  '  words find articles about the subject instead of people who do the work.',
  '- Two real examples:',
  '    "I need a repairman who can fix a Toyota Prius hybrid battery"',
  '      → Toyota Prius hybrid battery repair',
  '      (the car and the battery say WHICH mechanic — keep them)',
  '    "I need a notary for an apartment purchase contract"',
  '      → notary',
  '      (every notary does those contracts, so "apartment purchase contract"',
  '       only finds law-firm blogs — drop it)',
  '- Keep a city, district or country ONLY if the person named one themselves.',
  '- NEVER add a place. If they named none, the query has none.',
  '- Never invent a brand, a detail or a place the person did not give you.',
].join('\n');

function userPrompt(goalText: string): string {
  return `What they need:\n${goalText}`;
}

/**
 * A model's answer, or null if it is not one.
 *
 * A refusal, an apology or a restated sentence are all longer than a query, so
 * the length cap does most of the work. Newlines are the other tell — a query
 * is one line — and the first line is taken rather than the answer rejected,
 * because „query\n\n(explanation)" is a useful answer wearing the wrong shape.
 */
function usableQuery(raw: string): string | null {
  const firstLine = raw.trim().split('\n')[0] ?? '';
  const cleaned = firstLine.replace(/^["'„“]+|["'”“]+$/g, '').trim();
  if (cleaned === '' || cleaned.length > MAX_QUERY_CHARS) return null;
  return cleaned;
}

export interface DistilledQuery {
  /** What to search for. The original text whenever distilling did not work. */
  readonly query: string;
  /** Present only when it changed, so a log can show both without guessing. */
  readonly fromGoal?: string;
}

/**
 * No city, on purpose — D298: nothing assumes a city.
 *
 * The first version of this took the account's stored city and offered it to
 * the model. The seat caught it inside the hour. A place belongs in a search
 * only when the owner said it, in the goal or in answer to being asked, and
 * whatever they said is already in the text being read — so there is nothing
 * for this interface to carry.
 */
export interface DistilContext {
  readonly userId: string;
  readonly runId: string;
}

/**
 * The goal text as a search query.
 *
 * Never throws. Returns the original text on every failure, so a caller can
 * use the result unconditionally.
 */
export async function distilSearchQuery(
  goalText: string,
  ctx: DistilContext,
): Promise<DistilledQuery> {
  const model = queryModel();
  const client = openaiClient();
  if (model === '' || client === null) return declined(goalText, 'no model configured');

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(goalText) },
        ],
      },
      { timeout: DISTIL_BUDGET_MS },
    );

    // Charged like any other model call. A search that quietly spends money
    // outside the ledger is spend the cost report cannot see — the same rule
    // the opening web search follows.
    void recordClaudeUsage({
      userId: ctx.userId,
      kind: 'search_query',
      model,
      provider: 'openai',
      usage: toLedgerUsage(completion.usage),
      runId: ctx.runId,
    }).catch(() => {});

    const answer = completion.choices[0]?.message?.content ?? '';
    const distilled = usableQuery(answer);
    if (distilled === null)
      return declined(goalText, answer.trim() === '' ? 'empty answer' : 'unusable answer');
    if (distilled === goalText) return declined(goalText, 'answered with the goal text');
    return { query: distilled, fromGoal: goalText };
  } catch (err) {
    return declined(goalText, `${model} failed: ${(err as Error).message}`);
  }
}

/**
 * Ticket 20 row 108, second pass — every way this can decline now SAYS SO.
 *
 * Goal 4522, 13:34 UTC, on a build where the second circle takes the distilled
 * query: both searches were logged with Ninia's whole sentence, and the second
 * circle timed out at 17.1 s again. The reason was not the build and not the
 * routing — the distiller returned the goal text, and returned it in silence.
 *
 * Of the four ways it could do that, exactly one wrote a line. „No model
 * configured", „empty answer" and „answered with the goal text" all returned
 * the sentence with nothing in the log, so from the outside a working
 * distiller and an absent one are the same picture. That is the substitution
 * this codebase keeps finding, in a function I wrote to avoid it.
 *
 * Not free and worth it: one line per goal at most, and only when the search
 * is about to be handed something nobody intended.
 */
function declined(goalText: string, reason: string): DistilledQuery {
  // eslint-disable-next-line no-console
  console.warn(`[search-query] not distilled (${reason}); searching the goal text as typed`);
  return { query: goalText };
}

/**
 * ROW 253's SECOND DOOR — THE DISTILLER IS A SECOND PROVIDER, AND IT WAS STILL
 * BEING HANDED THE NAME.
 *
 * What shipped on 22 September stops a person's name reaching the WEB SEARCH.
 * It sits after `distilSearchQuery`, which is a model call on OpenAI
 * (`config/openai.ts`) and not on the model that answers the conversation. So
 * on „I want to be introduced to <a real person>" the name still left the
 * building — to a different company from the one the whole product runs on —
 * and what was blocked was only the distilled name reaching Tavily. Half a
 * door. I wrote it down the same night rather than let it read as closed.
 *
 * THE OBVIOUS FIX IS THE WRONG ONE, AND I MEASURED IT BEFORE BELIEVING IT.
 * „Skip the distiller too" was my first answer, on the reasoning that for an
 * introduction goal the distilled query is just a name, so the raw text
 * probably costs nothing. That was reading the OUTPUT and not the INPUT.
 * Across every opening second-circle search whose goal carries an
 * introduction phrase:
 *
 *     distilled query   median  3 words   max  5
 *     raw goal text     median 14 words   max 34
 *     raw goals over 12 words                21 of 40
 *
 * Row 110 measured what a whole sentence does to the second circle — a phrase
 * matching 0 people, and a sentence timing out at 15 s returning NOTHING,
 * three times. Handing it the raw goal would put 21 of those 40 into exactly
 * that regime. Skipping the distiller trades a privacy door for half the
 * second circle.
 *
 * SO THE QUERY IS BUILT HERE, FROM THE OWNER'S OWN WORDS, AND NOTHING LEAVES.
 *
 * WHY A WORD RULE IS RIGHT HERE AND WRONG ABOVE. The top of this file argues
 * at length that a stop-word rule cannot distil a general goal: in „notary for
 * an apartment purchase contract" the value is the first noun, in „repairman
 * for a Toyota Prius hybrid battery" it is everything after it, and telling
 * those apart is reading the sentence. All of that still stands. It does not
 * apply to THIS case, and the difference is not a matter of degree: here we
 * are not deciding what the sentence is about. The owner has already said it,
 * in one of a short list of phrasings, and the thing we want is the name
 * sitting next to the phrase they used. That is a position in a sentence, not
 * a judgement about one.
 */

/** English: the name follows the phrase. „introduce me to X", „meeting with X". */
const INTRODUCTION_LEAD =
  /\b(?:introduce me to|introduced to|introduction to|an introduction from|arrange a meeting with|put me in touch with|get in touch with)\b/gi;

/** Georgian: the name precedes it. „<X>-თან დაკავშირება", „<X> გამაცანი". */
const INTRODUCTION_TRAIL = /(?:დაკავშირებ|გამაცნ|გააცნო|შემახვედრ)\p{L}*/gu;

/**
 * Four is the whole of the name in every shape we have logged, „Netai Test 10"
 * included, and a fifth word has never been part of one.
 */
const MAX_LOCAL_QUERY_WORDS = 4;

/**
 * TWO WORDS OR NOTHING, and one real goal is the reason.
 *
 * On 19 September somebody wrote four sentences ending „…ნინია აბრამიშვილთან
 * პირდაპირი შეკითხვა, აქსელთან დაკავშირებით რჩევასთან დაკავშირებით." The
 * phrase they used sits beside „აქსელთან" — the subject they want advice
 * about — and the person they are trying to reach is six words earlier, on the
 * far side of a comma. A rule that reads a position in a sentence gets that
 * one wrong, and no rule of this kind will get it right.
 *
 * What it CAN do is know that it has not found a name. One bare word beside
 * the phrase is not a person; the four shapes that are carry two or more. So a
 * single word declines, and declining falls back to the goal text as typed —
 * the same path this file has always taken when the model failed, slow and
 * occasionally empty and NEVER a leak.
 */
const MIN_LOCAL_QUERY_WORDS = 2;

/**
 * The words that end a name, in both languages.
 *
 * Not a general stop-word list — it never has to be one. It only has to stop
 * at the word after the name in the sentences people actually write, and every
 * entry here is one that occurred in the logged goals.
 */
const NOT_PART_OF_A_NAME = new Set([
  'a',
  'an',
  'the',
  'i',
  'my',
  'me',
  'we',
  'he',
  'she',
  'they',
  'them',
  'him',
  'her',
  'it',
  'to',
  'for',
  'about',
  'through',
  'with',
  'from',
  'and',
  'or',
  'but',
  'because',
  'so',
  'who',
  'that',
  'this',
  'next',
  'please',
  'asking',
  'ask',
  'want',
  'would',
  'like',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'do',
  'does',
  'did',
  'not',
  'no',
  'if',
  'when',
  'მჭირდება',
  'მინდა',
  'გთხოვ',
  'უნდა',
  'არის',
  'და',
  'რომ',
  'ამ',
  'მას',
  'იცნობ',
]);

/** A clause ends the name: „…to Netai Test 4. I want this done as…". */
const ENDS_A_CLAUSE = /[.,;:!?—–]$/u;

/** Leading and trailing punctuation only — „(Nino," is „Nino". */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * „Test 6-თან" — a Georgian case ending hung off a name that is not Georgian.
 *
 * `georgianStem` already trims these endings downstream, and it never sees
 * this one: the word it is attached to is Latin, so the stemmer does not read
 * it. Ticket 20 row 10 is the same fault in the other direction — „რატიანს"
 * matched nothing because of one letter.
 */
const HYPHENATED_GEORGIAN_ENDING = /-[Ⴀ-ჿ]+$/u;

function cleanWord(raw: string): string {
  return raw.replace(EDGE_PUNCTUATION, '').replace(HYPHENATED_GEORGIAN_ENDING, '');
}

/**
 * The phrase is never part of the name, AND THE FIRST MEASUREMENT IS WHY THIS
 * LINE EXISTS.
 *
 * A goal can use the phrase twice — „…ნინია აბრამიშვილთან პირდაპირი შეკითხვა,
 * აქსელთან დაკავშირებით რჩევასთან დაკავშირებით." Reading back from the second
 * occurrence walks straight over the first one, and the query came out as
 * „აქსელთან დაკავშირებით რჩევასთან": three words, so the two-word floor below
 * passed it, and one of the three was the phrase itself. Stopping here makes
 * that span one word, which is the floor's job and it then does it.
 */
const IS_THE_PHRASE = /^(?:დაკავშირებ|გამაცნ|გააცნო|შემახვედრ)/u;

/**
 * The name beside the phrase, read outwards until the clause ends.
 *
 * `backwards` is the Georgian case: there the phrase follows the name, so a
 * word whose own spelling ends the clause is the boundary and is NOT taken —
 * it belongs to the clause before the name, not to the name.
 */
function nameBeside(text: string, backwards: boolean): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const ordered = backwards ? [...words].reverse() : words;
  const taken: string[] = [];
  for (const raw of ordered) {
    if (backwards && ENDS_A_CLAUSE.test(raw)) break;
    const word = cleanWord(raw);
    if (word === '' || NOT_PART_OF_A_NAME.has(word.toLowerCase())) break;
    if (IS_THE_PHRASE.test(word)) break;
    taken.push(word);
    if (taken.length === MAX_LOCAL_QUERY_WORDS) break;
    if (!backwards && ENDS_A_CLAUSE.test(raw)) break;
  }
  return backwards ? taken.reverse() : taken;
}

/**
 * The goal's search query, built without a model and without leaving the
 * building. Empty string when it cannot find a name — never a guess.
 *
 * Every occurrence of every phrase is read, and the longest name wins: a goal
 * naming both a bridge and a target („Ask X to introduce me to Y") mentions
 * the phrase once, but „send a formal introduction request to X, asking X to
 * introduce me to Y" mentions two, and the one carrying a name is not always
 * the first.
 */
export function introductionQueryWithoutAModel(goalText: string): string {
  let best: string[] = [];
  const consider = (candidate: string[]): void => {
    if (candidate.length > best.length) best = candidate;
  };

  for (const match of goalText.matchAll(INTRODUCTION_LEAD)) {
    consider(nameBeside(goalText.slice(match.index + match[0].length), false));
  }
  for (const match of goalText.matchAll(INTRODUCTION_TRAIL)) {
    consider(nameBeside(goalText.slice(0, match.index), true));
  }

  return best.length >= MIN_LOCAL_QUERY_WORDS ? best.join(' ') : '';
}

/**
 * What `distilSearchQuery` is to an ordinary goal, this is to one that asks to
 * reach a named person — with no model call of any kind behind it.
 *
 * Returns the same shape, so the caller logs and searches identically and the
 * tool log still shows both the query and the goal it came from.
 */
export function distilIntroductionLocally(goalText: string): DistilledQuery {
  const query = introductionQueryWithoutAModel(goalText);
  if (query === '')
    return declined(
      goalText,
      'no name found beside the phrase, and nothing sent out to look for one',
    );
  return { query, fromGoal: goalText };
}
