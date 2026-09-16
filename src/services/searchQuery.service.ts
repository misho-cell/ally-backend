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

const SYSTEM_PROMPT = [
  'You turn one person’s description of what they need into a short web search query.',
  '',
  'Rules:',
  '- Answer with the query ALONE. No quotes, no explanation, no punctuation at the end.',
  '- 2 to 6 words. Name the service or thing being looked for, and the place.',
  '- Write it in the same language the person used.',
  '- Drop every first-person word — "I need", "I am looking for", "who will".',
  '- Keep the words that make the search specific. If someone needs a repairman',
  '  for a Toyota Prius hybrid battery, the car and the battery are the query and',
  '  "repairman" is nearly worthless on its own.',
  '- If the person names no place and a city is given to you below, add that city.',
  '- Never invent a place, a brand or a detail the person did not give you.',
].join('\n');

function userPrompt(goalText: string, city: string | null): string {
  const place = city === null || city.trim() === '' ? 'none known' : city.trim();
  return `The person’s city: ${place}\n\nWhat they need:\n${goalText}`;
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

export interface DistilContext {
  readonly userId: string;
  readonly runId: string;
  readonly city: string | null;
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
          { role: 'user', content: userPrompt(goalText, ctx.city) },
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
