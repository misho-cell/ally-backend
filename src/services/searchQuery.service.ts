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
 * Small on purpose. This holds up the opening web search, which holds up the
 * first reply — the web search itself measures 4.0-5.4s inside a 10s budget,
 * so this is what is left before the budget starts costing us results rather
 * than saving them.
 */
const DISTIL_BUDGET_MS = 2_500;

/** A query, not a sentence. Anything longer is the model ignoring the brief. */
const MAX_QUERY_CHARS = 120;

/** Enough for six words in Georgian, where a word can run long. */
const MAX_OUTPUT_TOKENS = 64;

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
  if (model === '' || client === null) return { query: goalText };

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

    const distilled = usableQuery(completion.choices[0]?.message?.content ?? '');
    if (distilled === null || distilled === goalText) return { query: goalText };
    return { query: distilled, fromGoal: goalText };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[search-query] ${model} could not distil:`, (err as Error).message);
    return { query: goalText };
  }
}
