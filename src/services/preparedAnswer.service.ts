import { query } from '../db/postgres/client';
import anthropic from '../config/anthropic';
import { EDITOR_MODEL, LANGUAGE_NAMES } from './askEditor.service';
import { recordClaudeUsage } from './costLedger.service';
import { RunLanguage } from './runLanguage';

/**
 * 1695 (A12, the intelligence research of 6 October, D679/D680): even a clear
 * fit still had to type his answer, and typing is where answers die. On a
 * likely_yes pre-match (1694) one line is composed that he could send, from his
 * own profile fields only — never his notes, never anything he typed — with the
 * brief Misho approved, word for word (§107). It is stored on the ask, shown
 * only to him, and sent only when he taps yes. Nothing composed is ever sent
 * on its own.
 */
/**
 * D747 (the founder, 9 Oct: „no prepared answers"): retired. Nothing is
 * composed, nothing is shown under a yes, and a line stored before the switch
 * is never sent. The column and the code stay; this one switch holds them.
 */
export const PREPARED_ANSWER_ON = false;

const QUERY_TIMEOUT_MS = 5_000;
const COMPOSE_BUDGET_MS = 10_000;
const MAX_OUTPUT_TOKENS = 200;
export const PREPARED_MAX_CHARS = 200;
/** A run of this many digits is a number, and a number never goes in the line (D8). */
const NUMBER_RUN_RE = /\d[\d\s-]{5,}\d/u;
const NOTHING_RE = /^(?:nothing|none|n\/a|არაფერი|ничего|nada)[.!]?$/iu;

/** §107, the exact approved text. */
export function preparedAnswerBrief(language: RunLanguage): string {
  return (
    'From the facts below about the reader himself, write ONE short line in ' +
    `${LANGUAGE_NAMES[language]} that he could send as his answer to this question: what he can ` +
    'offer, business facts only. Never a phone number, never another person' +
    "'s number or private " +
    'fact, never words he typed to his own assistant. If nothing in the facts answers the ' +
    'question, return nothing.'
  );
}

/** His own profile fields: job, employer, and the key/value profile. Never notes. */
async function profileFacts(userId: number): Promise<string[]> {
  const [user, kv] = await Promise.all([
    query<{ job: string | null; employer: string | null }>(
      `SELECT NULLIF(TRIM("jobPosition"), '') AS job, NULLIF(TRIM(employer), '') AS employer
         FROM "User" WHERE id = $1 LIMIT 1`,
      [userId],
      QUERY_TIMEOUT_MS,
    ),
    query<{ key: string; value: string }>(
      `SELECT key, value FROM user_profile_kv WHERE user_id = $1::text LIMIT 20`,
      [String(userId)],
      QUERY_TIMEOUT_MS,
    ),
  ]);
  const facts: string[] = [];
  const row = user.rows[0];
  if (row?.job) facts.push(`job: ${row.job}`);
  if (row?.employer) facts.push(`employer: ${row.employer}`);
  for (const { key, value } of kv.rows) {
    if (value.trim() !== '') facts.push(`${key}: ${value.trim()}`);
  }
  return facts;
}

/** The line, when it is one he could send; null when it is anything else. */
export function usablePreparedLine(raw: string): string | null {
  const line = raw
    .trim()
    .replace(/^["„“]|["”“]$/gu, '')
    .trim();
  if (line === '' || NOTHING_RE.test(line)) return null;
  if (line.includes('\n') || line.length > PREPARED_MAX_CHARS) return null;
  return NUMBER_RUN_RE.test(line) ? null : line;
}

/** His prepared answer to this question, or null (nothing to offer, or the call failed). */
export async function composePreparedAnswer(
  readerUserId: number,
  question: string,
  language: RunLanguage,
): Promise<string | null> {
  if (!PREPARED_ANSWER_ON) return null;
  try {
    const facts = await profileFacts(readerUserId);
    if (facts.length === 0) return null;
    const response = await anthropic.messages.create(
      {
        model: EDITOR_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: preparedAnswerBrief(language),
        messages: [{ role: 'user', content: JSON.stringify({ question, facts }) }],
      },
      { timeout: COMPOSE_BUDGET_MS, maxRetries: 0 },
    );
    void recordClaudeUsage({
      userId: null,
      kind: 'prepared_answer',
      model: EDITOR_MODEL,
      usage: response.usage,
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[prepared-answer] usage not recorded:', (err as Error).message);
    });
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return usablePreparedLine(text);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[prepared-answer] not composed:', (err as Error).message);
    return null;
  }
}

/** The frame under the question: what a tap on yes sends. */
export function preparedAnswerLine(language: RunLanguage, yesLabel: string, line: string): string {
  switch (language) {
    case 'en':
      return `Tapping „${yesLabel}" sends: „${line}"`;
    case 'ru':
      return `Нажав «${yesLabel}», вы отправите: «${line}»`;
    case 'es':
      return `Al tocar «${yesLabel}» se envía: «${line}»`;
    default:
      return `„${yesLabel}"-ს დაჭერით გაიგზავნება: „${line}"`;
  }
}

/** The line stored on the live ask in this conversation, when he has not answered yet. */
export async function preparedAnswerOn(askThreadId: number): Promise<string | null> {
  if (!PREPARED_ANSWER_ON) return null;
  const result = await query<{ prepared_answer: string | null }>(
    `SELECT prepared_answer FROM task_asks
      WHERE ask_thread_id = $1 AND status = 'sent' AND prepared_answer IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [askThreadId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.prepared_answer ?? null;
}
