import { query } from '../db/postgres/client';

/**
 * The founder, 30 Oct (79102, „the prompt is mine"): two texts the model reads
 * or the owner reads were held in code — the answers card's retelling brief and
 * the plan's closing line — so only a deploy could change them. Each is now
 * also a prompt block the prompt team edits in the admin console. A block with
 * no modes is never composed into a prompt; the server reads it by name.
 *
 * The code's own text is the fallback: until the block exists, or while it is
 * disabled or empty, nothing changes. Reads are kept for a short while and
 * refreshed behind the caller, so a sentence written on every plan never waits
 * on the database, and an edit is live within REFRESH_MS.
 */
const REFRESH_MS = 30_000;
const QUERY_TIMEOUT_MS = 3_000;

export enum ServerTextBlock {
  /** What the retelling model is told the answer is and how to say it (askTranslation). */
  CardRetellBrief = 'card_retell_brief',
  /** The plan's sentence in Georgian; {names} and {assistants} are filled in. */
  PlanAskSentenceKa = 'plan_ask_sentence_ka',
  /** The plan's closing question in Georgian. */
  PlanClosingQuestionKa = 'plan_closing_question_ka',
}

interface Kept {
  readonly at: number;
  readonly text: string | null;
}

const kept = new Map<ServerTextBlock, Kept>();
const inFlight = new Set<ServerTextBlock>();

async function refresh(name: ServerTextBlock): Promise<void> {
  if (inFlight.has(name)) return;
  inFlight.add(name);
  try {
    const result = await query<{ content: string }>(
      `SELECT content FROM prompt_blocks WHERE name = $1 AND enabled = TRUE LIMIT 1`,
      [name],
      QUERY_TIMEOUT_MS,
    );
    const text = result.rows[0]?.content.trim() ?? '';
    kept.set(name, { at: Date.now(), text: text === '' ? null : text });
  } catch (err) {
    // The kept text, or the code's, stays in use; a failed read is no reason to stop a reply.
    // eslint-disable-next-line no-console
    console.warn(`[server-text] ${name} not read:`, (err as Error).message);
    kept.set(name, { at: Date.now(), text: kept.get(name)?.text ?? null });
  } finally {
    inFlight.delete(name);
  }
}

/** The block's text when the prompt team has written one, else the code's own. */
export function serverText(name: ServerTextBlock, fallback: string): string {
  const now = kept.get(name);
  if (now === undefined || Date.now() - now.at >= REFRESH_MS) void refresh(name);
  return now?.text ?? fallback;
}

/** Reads every block now, so the first replies after a start use the team's text. */
export async function loadServerTexts(): Promise<void> {
  await Promise.all(Object.values(ServerTextBlock).map(refresh));
}

/** For tests: forget what was read. */
export function forgetServerTexts(): void {
  kept.clear();
}
