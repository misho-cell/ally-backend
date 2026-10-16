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
const LINES_READ = 8;

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

interface FactRow {
  readonly title: string | null;
  readonly brief: string | null;
}

interface LineRow {
  readonly role: string;
  readonly content: string;
}

/** The case's title, its goal's notes and its latest lines; null when it carries no goal. */
async function caseFacts(threadId: number): Promise<CaseFacts | null> {
  const head = await query<FactRow>(
    `SELECT t.title, g.brief
       FROM threads t
       JOIN tasks g ON g.thread_id = t.id
      WHERE t.id = $1
      ORDER BY (g.status = 'open') DESC, g.id DESC
      LIMIT 1`,
    [threadId],
    QUERY_TIMEOUT_MS,
  );
  const row = head.rows[0];
  if (row === undefined) return null;
  const lines = await query<LineRow>(
    `SELECT role, content FROM (
       SELECT c.role, c.content, c.created_at
         FROM conversations c
        WHERE c.thread_id = $1 AND c.kind = 'message' AND length(trim(c.content)) > 0
          AND c.role IN ('user', 'assistant')
        ORDER BY c.created_at DESC
        LIMIT $2) latest
     ORDER BY created_at`,
    [threadId, LINES_READ],
    QUERY_TIMEOUT_MS,
  );
  return {
    title: row.title,
    brief: row.brief,
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
