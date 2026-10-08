import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../config/anthropic';
import { EDITOR_MODEL, LANGUAGE_NAMES } from './askEditor.service';
import { laterChoice } from './askOpening';
import { APPROVE_LABEL, CHANGE_LABEL } from './choiceNotes';
import { recordClaudeUsage } from './costLedger.service';
import { otherChoiceLabel } from './otherChoice';
import { RunLanguage } from './runLanguage';

/**
 * 2579, first part (§105, Misho's yes on 8 October). The owner's buttons are
 * written by the model, and nothing checked them: „დიახ, სთხოვენ გაცნობა",
 * „არა, დეველოდოთ ლევანის პასუხს" (7 Oct), „ვცალობ", „არსად არ ვდადი" (8 Oct).
 * The helper's question already passes an editor (D711); the owner's buttons now
 * pass the same model, with the brief Misho approved, word for word. The
 * server's own labels (approve, change, other, later) are never sent to it.
 * A failed or unusable check keeps the buttons as written.
 */
const CHECK_BUDGET_MS = 10_000;
const MAX_OUTPUT_TOKENS = 400;
const MAX_BUTTON_CHARS = 40;
const MAX_MESSAGE_CHARS = 1_500;
const RUN_LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/** §105, the exact approved text; {language} is the conversation's language by name. */
export function ownerButtonsBrief(language: RunLanguage): string {
  const name = LANGUAGE_NAMES[language];
  return (
    'You check the buttons under one message before the owner sees them. ' +
    `The owner reads ${name}. Each button is what the OWNER taps to answer that message, in the ` +
    "owner's own voice, at most 40 characters. A button passes only if it is correct, natural " +
    `${name} made of real words, and a real answer to the message. When every button passes, ` +
    'call give_verdict with ok true. Otherwise fix only the broken buttons, keeping their meaning ' +
    'and their order, and call give_verdict with ok false and the corrected buttons.'
  );
}

const VERDICT_TOOL: Anthropic.Tool = {
  name: 'give_verdict',
  description: 'The verdict on the buttons.',
  input_schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean', description: 'True when every button passes as written.' },
      buttons: {
        type: 'array',
        description: 'The corrected buttons, in the same order, when ok is false.',
        items: { type: 'string' },
      },
    },
    required: ['ok'],
  },
};

/** Labels the server writes itself, in every language: never the editor's to change. */
function serverLabels(): ReadonlySet<string> {
  const labels = RUN_LANGUAGES.flatMap((lang) => [
    APPROVE_LABEL[lang],
    CHANGE_LABEL[lang],
    otherChoiceLabel(lang),
    laterChoice(lang),
  ]);
  return new Set(labels.map((label) => label.trim()));
}

/** The editor's buttons when they are a usable replacement for the ones sent; else null. */
export function usableButtons(verdict: unknown, sent: readonly string[]): string[] | null {
  if (verdict === null || typeof verdict !== 'object') return null;
  const v = verdict as { ok?: unknown; buttons?: unknown };
  if (v.ok === true || !Array.isArray(v.buttons) || v.buttons.length !== sent.length) return null;
  const buttons = v.buttons.map((b) => (typeof b === 'string' ? b.trim() : ''));
  if (buttons.some((b) => b === '' || b.length > MAX_BUTTON_CHARS)) return null;
  return new Set(buttons).size === buttons.length ? buttons : null;
}

async function askTheEditor(
  message: string,
  buttons: readonly string[],
  language: RunLanguage,
): Promise<unknown> {
  const response = await anthropic.messages.create(
    {
      model: EDITOR_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: ownerButtonsBrief(language),
      tools: [VERDICT_TOOL],
      tool_choice: { type: 'tool', name: VERDICT_TOOL.name },
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ message: message.slice(0, MAX_MESSAGE_CHARS), buttons }),
        },
      ],
    },
    { timeout: CHECK_BUDGET_MS, maxRetries: 0 },
  );
  void recordClaudeUsage({
    userId: null,
    kind: 'owner_buttons',
    model: EDITOR_MODEL,
    usage: response.usage,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[owner-buttons] usage not recorded:', (err as Error).message);
  });
  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === VERDICT_TOOL.name,
  );
  return call?.input ?? null;
}

/** The owner's buttons, with the model-written ones checked; the server's own untouched. */
export async function checkedOwnerButtons(
  message: string,
  choices: readonly string[],
  language: RunLanguage,
): Promise<string[]> {
  const fixed = serverLabels();
  const free = choices.map((c, i) => ({ c, i })).filter(({ c }) => !fixed.has(c.trim()));
  if (free.length === 0) return [...choices];
  try {
    const sent = free.map(({ c }) => c);
    const better = usableButtons(await askTheEditor(message, sent, language), sent);
    if (better === null) return [...choices];
    const out = [...choices];
    free.forEach(({ i }, k) => {
      out[i] = better[k];
    });
    if (new Set(out).size !== out.length) return [...choices];
    // eslint-disable-next-line no-console
    console.log('[owner-buttons] buttons corrected before they were shown');
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[owner-buttons] shown as written — the check failed:', (err as Error).message);
    return [...choices];
  }
}
