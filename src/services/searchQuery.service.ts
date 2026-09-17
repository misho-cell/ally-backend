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
