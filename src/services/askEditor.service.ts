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
  /** The person the question goes to — addressed as „you", never named in it. */
  readonly readerName: string;
  readonly language: RunLanguage;
}

/**
 * In front of a message somebody is waiting for, beside the other questions
 * of a wave. The tester's run 3 (44223): at 8 s, four of a wave of eight timed
 * out on the strong model and went as written — first person and all. One
 * attempt, no retries, so this is the whole of the wait.
 */
const EDIT_BUDGET_MS = 15_000;
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

/**
 * The strong model, as the translation path learned (askTranslation.service):
 * the tester's 44207 — the small model's rewrite of a reason was „დავველაპარაკოს",
 * not a Georgian word. This text goes in front of a person doing somebody a favour.
 */
const EDITOR_MODEL = process.env.ASK_EDITOR_MODEL?.trim() || 'claude-sonnet-5';

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

/**
 * The tester's REGRESSION 44196 (bdb51ed): rule 1 said „the asker in the third
 * person" and named nobody else, so the editor rewrote all nine questions of
 * the run into the READER's name in the third person and lost the asker. The
 * question sits under „<asker>'s assistant asks you:" — it speaks TO the
 * reader, ABOUT the asker. Both people are named, and a passing question is
 * left alone.
 */
function editorBrief(context: AskEditContext): string {
  const language = LANGUAGE_NAMES[context.language];
  const asker = context.askerName;
  const reader = context.readerName;
  return [
    `You check one question before it is sent to ${reader}, and the buttons under it. It ` +
      `appears under the line „${asker}'s assistant asks you:". ${reader} reads ${language}.`,
    '',
    'It passes only if ALL of these hold:',
    `1. It speaks TO ${reader} as „you" (in Georgian the informal „შენ") and never names ` +
      `${reader}. What ${asker} needs or wants is told ABOUT ${asker}, by name, in the third ` +
      `person („${asker}-ს სჭირდება…", „${asker} ეძებს…", „${asker}-ს უნდა…"). Any first-person ` +
      `form about ${asker} FAILS — „I need", „recommend me", „lend me", „help me", „I want"; in ` +
      'Georgian „მჭირდება", „მირჩიე / მირჩიო", „მასესხო", „დამეხმარე / დამეხმაროს", „მინდა", ' +
      '„გამაცნო". Rewrite such a sentence so it is about the asker.',
    `2. It is correct, natural ${language}, the way a person writes — not formal, no invented words.`,
    '3. It asks ONE question. If it asks two, keep the one the owner’s words ask for.',
    '4. It says nothing the owner did not say: no reason, place, time, quality or person ' +
      'added. Every fact the owner gave is kept exactly.',
    '5. It asks what the owner asked, with the same meaning. If the owner wants to be put in ' +
      'touch with someone, it asks the reader to connect them — never merely whether the ' +
      'reader can contact that person.',
    `6. There are 2–4 buttons in ${language}, each a real, natural answer to THIS question, ` +
      `in ${reader}'s own voice (at most 40 characters). Never one button alone; never only ` +
      '„later". Each has a meaning: "yes" (agrees, knows, will do it), "no" (declines, does ' +
      'not know), "later" (will answer later), "answer" (any other concrete answer).',
    '',
    'When every rule holds, do not improve it: call give_verdict with ok true. Otherwise ' +
      'change as little as possible — only what breaks a rule — and call give_verdict with ok ' +
      'false, the corrected question and its buttons.',
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

/**
 * The tester's run 4 (44290, case 1 at 11:26:31): the verdict came back as
 * prose with JSON inside it that would not parse, and a first-person question
 * went as written. The verdict is now a forced tool call with a schema, so it
 * arrives as an object or not at all.
 */
const VERDICT_TOOL: Anthropic.Tool = {
  name: 'give_verdict',
  description: 'The verdict on the question and its buttons.',
  input_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'True when every rule holds as written.' },
      question: { type: 'string', description: 'The corrected question, when ok is false.' },
      choices: {
        type: 'array',
        description: 'The corrected buttons, when ok is false.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            means: { type: 'string', enum: ['yes', 'no', 'later', 'answer'] },
          },
          required: ['label', 'means'],
        },
      },
    },
    required: ['ok'],
  },
};

function readVerdict(content: readonly Anthropic.ContentBlock[]): Verdict | null {
  const call = content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === VERDICT_TOOL.name,
  );
  const input: unknown = call?.input;
  return typeof input === 'object' && input !== null ? (input as Verdict) : null;
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
  let content: Anthropic.ContentBlock[];
  try {
    const response = await anthropic.messages.create(
      {
        model: EDITOR_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: editorBrief(context),
        tools: [VERDICT_TOOL],
        tool_choice: { type: 'tool', name: VERDICT_TOOL.name },
        messages: [{ role: 'user', content: editorInput(draft, context) }],
      },
      { timeout: EDIT_BUDGET_MS, maxRetries: 0 },
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
    content = response.content;
  } catch (err) {
    return kept(draft, `the check failed: ${(err as Error).message}`);
  }
  const verdict = readVerdict(content);
  if (verdict === null) return kept(draft, 'no verdict came back');
  if (verdict.ok === true) return { ...draft, edited: false };
  const rewritten = rewriteFrom(verdict, draft);
  if (rewritten === null) return kept(draft, 'the rewrite was not usable');
  // eslint-disable-next-line no-console
  console.log('[ask-editor] the question was rewritten before it left');
  return { ...rewritten, edited: true };
}

/**
 * D711 on the introduction path (the tester's 44194 and 44200): the reason
 * went to the go-between and the target word for word, in the owner's first
 * person — „რაზეა საქმე: თანამშრომლობაზე მინდა დაველაპარაკო" reached the
 * target as „their reason: I want to talk about working together". The reason
 * is told about the asker, in the third person, before it is stored, so every
 * reader gets that version. A failed rewrite keeps the owner's words, logged.
 */
function reasonBrief(askerName: string): string {
  return [
    `Rewrite this reason ${askerName} gave for wanting to be introduced to someone, as one ` +
      `short sentence about ${askerName} in the third person, in the SAME language it is ` +
      'written in.',
    '- Keep the meaning exactly. Add nothing: no reason, place, time or quality of your own.',
    `- Every first-person form becomes ${askerName}: „I want to meet" → „${askerName} wants ` +
      'to meet"; in Georgian „მინდა გავიცნო" → „' +
      `${askerName}-ს სურს გაიცნოს", „მჭირდება" → „${askerName}-ს სჭირდება".`,
    '- It is read by the go-between and by the person to be met: never address or name either.',
    `- Only if it already speaks about ${askerName} in the third person, return it unchanged.`,
    '- Reply with the sentence alone. No quotes, no notes.',
  ].join('\n');
}

export async function reasonAboutAsker(reason: string, askerName: string): Promise<string> {
  const said = reason.trim();
  if (said === '') return reason;
  try {
    const response = await anthropic.messages.create(
      {
        model: EDITOR_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: reasonBrief(askerName),
        messages: [{ role: 'user', content: said }],
      },
      { timeout: EDIT_BUDGET_MS, maxRetries: 0 },
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
    const told = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (told === '' || told.length > said.length + MAX_GROWTH_CHARS) {
      // eslint-disable-next-line no-console
      console.warn('[ask-editor] the reason was sent as written — the rewrite was not usable');
      return reason;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[ask-editor] the reason was ${told === said ? 'left as written' : 'told about the asker'}`,
    );
    return told;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ask-editor] the reason was sent as written — the check failed: ${(err as Error).message}`,
    );
    return reason;
  }
}
