import { recordClaudeUsage } from './costLedger.service';
import { dictatesTheText, sentenceCarriedOver } from './sentenceCarriedOver';

/**
 * Board #100 (plate F1): when Netai worded a question for the owner it changed
 * facts. An ask said „for a friend" though the owner asked for himself, and
 * „last year" became „this year" (3037/3670, #1552: „ტვირთი" became „ავეჯი").
 * The person asked answers what they read, so a changed fact is a wrong answer
 * delivered politely.
 *
 * #8779 (ops 18:45Z, 5 Nov): the check was three word lists (friend words, time
 * words, a bracketed word whose stem the owner never wrote) and it refused a real
 * owner's ask over „იგივე" („the same"). Like the reply claims (Misho's choice,
 * 5 Nov: „პატარა მოდელი"), a small model now reads the owner's lines and the
 * question and says whether the question changed who it is for, when, or added
 * a detail the owner did not give. The word it names must stand in the question,
 * so it cannot invent one; on any failure nothing is held back.
 */
const FACT_CHECK_MODEL = process.env.FACT_CHECK_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const FACT_CHECK_TIMEOUT_MS = 4_000;
const FACT_CHECK_MAX_TOKENS = 120;
const MAX_OWNER_CHARS = 3_000;
const MAX_QUESTION_CHARS = 1_500;

export enum FactChange {
  Beneficiary = 'beneficiary',
  Time = 'time',
  Detail = 'detail',
}

export interface FactChanged {
  readonly change: FactChange;
  /** The word in the question that the owner did not say. */
  readonly word: string;
}

const FACT_PROMPT =
  'You compare a QUESTION an assistant will send to another person with the OWNER lines ' +
  '(what the owner actually wrote). Does the question change a fact? Only these count: ' +
  '"beneficiary" — it says the need is for someone else (a friend, a relative) when the owner ' +
  'asked for himself; "time" — it names a different time than the owner gave (last year vs this ' +
  'year); "detail" — it narrows the owner\'s thing to something he never said (cargo → ' +
  'furniture). Rewording, politeness, a summary, and words like "the same" or "also" are NOT ' +
  'changes. Reply JSON only: {"change": "none"} or {"change": "<kind>", "word": "<the exact ' +
  'word or short phrase from the QUESTION>"}.';

const FACT_KINDS: readonly string[] = Object.values(FactChange);

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

/** The model's answer, checked: a known kind, and a word that stands in the question. */
export function factChangeFromAnswer(answer: string, question: string): FactChanged | null {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { change, word } = parsed as { change?: unknown; word?: unknown };
  if (typeof change !== 'string' || !FACT_KINDS.includes(change)) return null;
  if (typeof word !== 'string' || word.trim() === '') return null;
  const said = word.trim();
  if (!question.toLowerCase().includes(said.toLowerCase())) return null;
  return { change: change as FactChange, word: said };
}

export interface FactCheckOrigin {
  readonly userId: string;
  readonly runId?: string | null;
  readonly threadId?: number | null;
}

/** What the question changed from the owner's own lines, or null when it kept them (or on any failure). */
export async function factChangedIn(
  question: string,
  ownerLines: readonly string[],
  origin: FactCheckOrigin,
): Promise<FactChanged | null> {
  const owner = ownerLines.join('\n').trim();
  if (owner === '' || question.trim() === '') return null;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: FACT_CHECK_MODEL,
        max_tokens: FACT_CHECK_MAX_TOKENS,
        system: FACT_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `OWNER:\n${owner.slice(-MAX_OWNER_CHARS)}\n\n` +
              `QUESTION:\n${question.slice(0, MAX_QUESTION_CHARS)}`,
          },
        ],
      },
      { timeout: FACT_CHECK_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'fact_check',
      model: FACT_CHECK_MODEL,
      usage: response.usage,
      ...(origin.runId ? { runId: origin.runId } : {}),
      ...(origin.threadId ? { threadId: origin.threadId } : {}),
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[fact-keeping] usage not recorded:', (err as Error).message);
    });
    return factChangeFromAnswer(replyText(response.content), question);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[fact-keeping] could not read the question:', (err as Error).message);
    return null;
  }
}

const CHANGE_EXPLAINED: Readonly<Record<FactChange, (word: string) => string>> = {
  [FactChange.Beneficiary]: (word) =>
    `it says „${word}", but the owner never said it is for anybody else — they are asking for themselves`,
  [FactChange.Time]: (word) =>
    `it says „${word}", a time the owner did not give — keep the owner's own time words`,
  [FactChange.Detail]: (word) =>
    `it adds „${word}", a detail the owner did not give — keep the owner's own word, not a narrower one`,
};

/** What the model is told when a question is held back for a changed fact. */
export function factChangedRefusal(changed: FactChanged): string {
  const what = CHANGE_EXPLAINED[changed.change](changed.word);
  return (
    `Not sent: ${what}. Rewrite the question with every fact exactly as the owner wrote it — ` +
    'who it is for, when, where, how much — and add no reason, beneficiary or time of your own. ' +
    'Then send it again. Do not tell the owner about this; it is a rewrite, not news.'
  );
}

/**
 * D648 in the asker's direction (the tester's 1152, 38572): a follow-up to the
 * helper opened with the owner's exact words — „ხუთშაბათს ვერ ვახერხებ, …" —
 * a quotation of the owner carried to somebody else. A question that holds one
 * of the owner's own lines whole is held back; the facts stay, the words are
 * the assistant's.
 */
/** The owner's sentence the question repeats whole, or null (the tester's 1154: one sentence is enough). */
export function ownersLineQuoted(question: string, ownerLines: readonly string[]): string | null {
  for (const line of ownerLines) {
    if (dictatesTheText(line)) continue;
    const carried = sentenceCarriedOver(line, question);
    if (carried !== null) return carried;
  }
  return null;
}

export const OWNERS_LINE_QUOTED_REFUSAL =
  "Not sent: the question repeats the owner's own words — a sentence of theirs, letter for " +
  'letter. D648: write it in ' +
  'your own words — what the owner means, never a quotation — and keep every fact exactly ' +
  '(names, days, times, places, amounts). Then send it again. Do not tell the owner; it is a ' +
  'rewrite, not news.';
