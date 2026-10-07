import Anthropic from '@anthropic-ai/sdk';

import anthropic from '../config/anthropic';
import { AskChoice, choicesProblem, parseAskChoices } from './askChoices';
import { recordClaudeUsage } from './costLedger.service';
import { RunLanguage } from './runLanguage';

/**
 * D711 (the founder, 7 Oct): every question that goes to another person
 * passes a second check on the server before it leaves — about the asker in
 * the third person, correct language, one question, nothing the owner did not
 * say, and (D712) buttons that are real answers to it. A failing text is
 * rewritten once, and the rewritten one is sent (his words) — never held.
 *
 * A broken check never holds a question back: a timeout, a provider error or
 * an unreadable verdict sends the question as it was written, and says so in
 * the log.
 */
export interface AskDraft {
  readonly question: string;
  readonly choices: readonly AskChoice[];
}

export interface EditedAsk extends AskDraft {
  /** True when the editor's version replaced the draft. */
  readonly edited: boolean;
}

export interface AskEditContext {
  /** The owner's own recent lines on this goal, oldest first — what may be said. */
  readonly ownerWords: readonly string[];
  readonly askerName: string;
  readonly language: RunLanguage;
}

/** In front of a message somebody is waiting for, beside the other questions of a wave. */
const EDIT_BUDGET_MS = 6_000;
const MAX_OUTPUT_TOKENS = 800;
/** A rewrite that grows past this has added something; it is not used. */
const MAX_GROWTH_CHARS = 300;
const MAX_OWNER_LINES = 4;
const MAX_OWNER_LINE_CHARS = 600;

const MAX_QUESTION_MARKS = 1;
const QUESTION_MARK_RE = /[?？]/gu;

function questionMarks(text: string): number {
  return text.match(QUESTION_MARK_RE)?.length ?? 0;
}

const EDITOR_MODEL = process.env.ASK_EDITOR_MODEL?.trim() || 'claude-haiku-4-5-20251001';

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

function editorBrief(context: AskEditContext): string {
  const language = LANGUAGE_NAMES[context.language];
  return [
    `You check one question that ${context.askerName}'s assistant is about to send to another ` +
      `person, and the buttons under it. The reader reads ${language}.`,
    '',
    'It passes only if ALL of these hold:',
    `1. It is about ${context.askerName} in the third person („${context.askerName} is looking ` +
      'for…"), never the asker’s own first-person sentence („I need…", „I want…").',
    `2. It is correct, natural ${language}, the way a person writes — not formal, no invented words.`,
    '3. It asks ONE question. If it asks two, keep the one the owner’s words ask for.',
    '4. It says nothing the owner did not say: no reason, place, time, quality or person ' +
      'added. Every fact the owner gave is kept exactly.',
    '5. It asks what the owner asked, with the same meaning. If the owner wants to be put in ' +
      'touch with someone, it asks the reader to connect them — never merely whether the ' +
      'reader can contact that person.',
    `6. There are 2–4 buttons in ${language}, each a real, natural answer to THIS question ` +
      '(at most 40 characters). Never one button alone; never only „later". Each has a ' +
      'meaning: "yes" (agrees, knows, will do it), "no" (declines, does not know), "later" ' +
      '(will answer later), "answer" (any other concrete answer).',
    '',
    'Reply with JSON only, no other text:',
    '{"ok": true} when everything holds, or',
    '{"ok": false, "question": "…", "choices": [{"label": "…", "means": "yes|no|later|answer"}]} ' +
      'with the corrected question and buttons.',
  ].join('\n');
}

function editorInput(draft: AskDraft, context: AskEditContext): string {
  return JSON.stringify({
    owner_words: context.ownerWords
      .slice(-MAX_OWNER_LINES)
      .map((line) => line.slice(0, MAX_OWNER_LINE_CHARS)),
    question: draft.question,
    choices: draft.choices,
  });
}

interface Verdict {
  readonly ok?: unknown;
  readonly question?: unknown;
  readonly choices?: unknown;
}

function readVerdict(text: string): Verdict | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Verdict) : null;
  } catch {
    return null;
  }
}

/** The editor's version, when it is a usable one; null keeps the draft. */
export function rewriteFrom(verdict: Verdict, draft: AskDraft): AskDraft | null {
  if (verdict.ok === true) return null;
  const question = typeof verdict.question === 'string' ? verdict.question.trim() : '';
  if (question === '' || question.length > draft.question.length + MAX_GROWTH_CHARS) return null;
  // One question (rule 3), checked without trusting the model that wrote it.
  if (questionMarks(question) > MAX_QUESTION_MARKS) return null;
  const choices = parseAskChoices(verdict.choices);
  if (choices === null || choicesProblem(choices) !== null) return null;
  return { question, choices };
}

function kept(draft: AskDraft, why: string): EditedAsk {
  // eslint-disable-next-line no-console
  console.warn(`[ask-editor] sent as written — ${why}`);
  return { ...draft, edited: false };
}

export async function editOutgoingAsk(
  draft: AskDraft,
  context: AskEditContext,
): Promise<EditedAsk> {
  let text: string;
  try {
    const response = await anthropic.messages.create(
      {
        model: EDITOR_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: editorBrief(context),
        messages: [{ role: 'user', content: editorInput(draft, context) }],
      },
      { timeout: EDIT_BUDGET_MS },
    );
    void recordClaudeUsage({
      userId: null,
      kind: 'ask_editor',
      model: EDITOR_MODEL,
      usage: response.usage,
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[ask-editor] usage not recorded:', (err as Error).message);
    });
    text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  } catch (err) {
    return kept(draft, `the check failed: ${(err as Error).message}`);
  }
  const verdict = readVerdict(text);
  if (verdict === null) return kept(draft, 'the verdict was not JSON');
  if (verdict.ok === true) return { ...draft, edited: false };
  const rewritten = rewriteFrom(verdict, draft);
  if (rewritten === null) return kept(draft, 'the rewrite was not usable');
  // eslint-disable-next-line no-console
  console.log('[ask-editor] the question was rewritten before it left');
  return { ...rewritten, edited: true };
}
