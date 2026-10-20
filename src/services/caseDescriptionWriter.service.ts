import { query } from '../db/postgres/client';
import { recordClaudeUsage } from './costLedger.service';
import { detectRunLanguage, RunLanguage } from './runLanguage';
import { emitThreadUpdated } from './sse.service';
import {
  CASE_DESCRIPTION_ON,
  CaseFacts,
  caseDescriptionPrompt,
  caseFactsText,
  cleanCaseDescription,
} from './caseDescription';

const DESCRIPTION_MODEL = process.env.THREAD_TITLE_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const DESCRIPTION_MAX_TOKENS = 220;
const DESCRIPTION_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 5_000;
/**
 * #6535 / #5413 failed again (Giorgi, G-151, 20 Oct evening): the description
 * listed what the assistant did — „თქვენი ასისტენტი კიდევ კითხავს ბესოს…". It
 * was written from the goal's working notes and the LATEST lines, which are the
 * progress. The description is the owner's problem, so it is written from how
 * the case began: the title and its first lines, never the notes.
 */
const LINES_READ = 4;

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

interface FactRow {
  readonly title: string | null;
}

interface LineRow {
  readonly role: string;
  readonly content: string;
}

/** The case's title and its first lines. */
async function caseFacts(threadId: number): Promise<CaseFacts | null> {
  const head = await query<FactRow>(
    `SELECT t.title FROM threads t WHERE t.id = $1 LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  const row = head.rows[0];
  if (row === undefined) return null;
  const lines = await query<LineRow>(
    `SELECT c.role, c.content
       FROM conversations c
      WHERE c.thread_id = $1 AND c.kind = 'message' AND length(trim(c.content)) > 0
        AND c.role IN ('user', 'assistant')
      ORDER BY c.created_at ASC
      LIMIT $2`,
    [threadId, LINES_READ],
    QUERY_TIMEOUT_MS,
  );
  return {
    title: row.title,
    brief: null,
    lines: lines.rows.map((l) => `${l.role === 'user' ? 'owner' : 'assistant'}: ${l.content}`),
  };
}

function ownersLanguage(facts: CaseFacts): string {
  const ownerText = facts.lines.filter((l) => l.startsWith('owner:')).join(' ');
  return LANGUAGE_NAMES[detectRunLanguage(ownerText || (facts.title ?? ''))];
}

async function describe(
  userId: string,
  threadId: number,
  facts: CaseFacts,
): Promise<string | null> {
  const { default: anthropic } = await import('../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: DESCRIPTION_MODEL,
      max_tokens: DESCRIPTION_MAX_TOKENS,
      system: caseDescriptionPrompt(ownersLanguage(facts)),
      messages: [{ role: 'user', content: caseFactsText(facts) }],
    },
    { timeout: DESCRIPTION_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId,
    kind: 'case_description',
    model: DESCRIPTION_MODEL,
    usage: response.usage,
    threadId,
  }).catch(() => undefined);
  const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  return cleanCaseDescription(raw);
}

/**
 * 5413: rewrites the case description after a run on a goal's conversation and
 * sends it to the owner's open screens. Best-effort: a failure leaves the last
 * description in place and is only logged.
 */
export async function refreshCaseDescription(
  userId: string,
  threadId: number,
  on: boolean = CASE_DESCRIPTION_ON,
): Promise<boolean> {
  if (!on) return false;
  try {
    const facts = await caseFacts(threadId);
    if (facts === null) return false;
    const description = await describe(userId, threadId, facts);
    if (description === null) return false;
    await query(
      `UPDATE threads SET case_description = $2, case_description_at = NOW() WHERE id = $1`,
      [threadId, description],
      QUERY_TIMEOUT_MS,
    );
    emitThreadUpdated(userId, { id: threadId, case_description: description });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[case-description] thread ${threadId}:`, (err as Error).message);
    return false;
  }
}

/**
 * 5413 retest (Giorgi, 20 Oct): only 3 of his 7 open cases had a description.
 * The description is written after an owner's run on the case, and a case that
 * has moved since 16 Oct only through answers, cards and wakes never had one:
 * 2,130 of 2,793 open cases with a reply since 17 Oct were empty. So opening a
 * case without one writes it, once per container per case, in the background;
 * the panel gets it through `thread_updated` as after a run.
 */
const MISSING_TRIED_FOR_MS = 30 * 60_000;
const missingTriedAt = new Map<number, number>();

/**
 * G-151: a go-between's case and an introduction request are cases too, and had
 * none — only a conversation holding an open goal was described. A description
 * written before the rule above was progress, so it counts as missing and is
 * written again from the case's beginning. The cut-off is after this change is
 * live (it ships before 20:00Z), so no description written the old way stays.
 */
const FROM_THE_BEGINNING_SINCE = '2026-10-20T20:00:00Z';
const CASE_TYPES_WITHOUT_A_GOAL = ['incoming_ask', 'outgoing_request'];

/** True when the thread is a case with no description, or one written from progress. */
async function lacksDescription(threadId: number): Promise<boolean> {
  const result = await query<{ lacks: boolean }>(
    `SELECT (t.case_description IS NULL OR trim(t.case_description) = ''
             OR t.case_description_at IS NULL OR t.case_description_at < $2::timestamptz) AS lacks
       FROM threads t
      WHERE t.id = $1
        AND (t.type = ANY($3::text[])
             OR EXISTS (SELECT 1 FROM tasks g WHERE g.thread_id = t.id AND g.status = 'open'))
      LIMIT 1`,
    [threadId, FROM_THE_BEGINNING_SINCE, CASE_TYPES_WITHOUT_A_GOAL],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.lacks === true;
}

/** Writes the description of a case that has none, at most once per half hour per case. */
export async function describeIfMissing(
  userId: string,
  threadId: number,
  now: number = Date.now(),
): Promise<boolean> {
  const tried = missingTriedAt.get(threadId);
  if (tried !== undefined && now - tried < MISSING_TRIED_FOR_MS) return false;
  missingTriedAt.set(threadId, now);
  try {
    if (!(await lacksDescription(threadId))) return false;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[case-description] thread ${threadId} (missing check):`, (err as Error).message);
    return false;
  }
  return refreshCaseDescription(userId, threadId);
}
