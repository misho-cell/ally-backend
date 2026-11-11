import { recordClaudeUsage } from './costLedger.service';
import { TargetAnswer } from './targetConsent';
import { QUICK_MODEL, noThinkingFor } from './aiModels';

/**
 * The tester's battery (6 Nov, C4): the target was asked whether to meet the
 * owner and typed „კი, სიამოვნებით გავიცნობ". Only the two buttons and a short
 * list of yes-phrases were read, so the answer matched nothing: the run then
 * wrote „თანხმობა დაფიქსირდა" with nothing recorded, the owner was never told
 * and no meeting chat opened. The founder's #8779: no fixed word lists. While
 * the question is open, a small model reads the answer's meaning; the server
 * checks only that the question is open. Any failure reads as no answer, and
 * the line goes on to the ordinary run as before.
 */
const TARGET_ANSWER_MODEL = process.env.TARGET_ANSWER_MODEL?.trim() || QUICK_MODEL;
const TARGET_ANSWER_TIMEOUT_MS = 4_000;
const TARGET_ANSWER_MAX_TOKENS = 50;
const MAX_LINE_CHARS = 1_000;

const TARGET_ANSWER_PROMPT =
  'A person was asked by their assistant whether they want to be introduced to someone and ' +
  'meet them. You get their REPLY. Reply with JSON only: {"answer": "yes" | "no" | "unclear"}. ' +
  '"yes" when the reply agrees to the introduction in any words; "no" when it declines or says ' +
  'not now; "unclear" when it asks something, talks about something else, or does not decide. ' +
  'Any language.';

const ANSWERS: Readonly<Record<string, TargetAnswer>> = {
  yes: TargetAnswer.Yes,
  no: TargetAnswer.No,
};

export interface TargetAnswerOrigin {
  readonly userId: string;
  readonly threadId: number;
}

/** The model's answer read as yes, no or nothing. */
export function targetAnswerFromModel(text: string): TargetAnswer | null {
  const match = /"answer"\s*:\s*"(\w+)"/u.exec(text);
  return match === null ? null : (ANSWERS[match[1]?.toLowerCase() ?? ''] ?? null);
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

/** Yes, no, or null when the reply does not decide or the model could not be read. */
export async function readTargetAnswer(
  line: string,
  origin: TargetAnswerOrigin,
): Promise<TargetAnswer | null> {
  if (line.trim() === '') return null;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: TARGET_ANSWER_MODEL,
        ...noThinkingFor(TARGET_ANSWER_MODEL),
        max_tokens: TARGET_ANSWER_MAX_TOKENS,
        system: TARGET_ANSWER_PROMPT,
        messages: [{ role: 'user', content: `REPLY:\n${line.slice(0, MAX_LINE_CHARS)}` }],
      },
      { timeout: TARGET_ANSWER_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'target_answer',
      model: TARGET_ANSWER_MODEL,
      usage: response.usage,
      threadId: origin.threadId,
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[target-answer] usage not recorded:', (err as Error).message);
    });
    return targetAnswerFromModel(replyText(response.content));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[target-answer] could not read the answer:', (err as Error).message);
    return null;
  }
}
