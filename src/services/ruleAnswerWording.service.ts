import { missingFacts } from './answerFacts';
import { recordClaudeUsage } from './costLedger.service';
import { RunLanguage } from './runLanguage';

/**
 * D652 (the founder, box 37654, „a - 2"): a saved automatic answer is the
 * helper's own sentence, and under D648 nothing goes in the helper's own words.
 * At every send a small model words it afresh, as the helper's assistant would;
 * the founder accepted the small cost and the second of delay. The facts check
 * of D648 applies to this wording too: when it loses a name, number, price,
 * time, date, address or link, the saved sentence goes as it is, and so it does
 * when the model cannot be reached — an answer late or lost is worse than an
 * answer in the helper's words.
 */
const RULE_WORDING_MODEL = process.env.RULE_WORDING_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const RULE_WORDING_TIMEOUT_MS = 8_000;
const RULE_WORDING_MAX_TOKENS = 400;
const MAX_INPUT_CHARS = 1_000;

const LANGUAGE_NAME: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

function wordingPrompt(language: RunLanguage): string {
  return (
    "You are a person's assistant. Somebody asked them a question, and they keep a standing " +
    'answer for questions like it. Write that answer to the asker in your own words, as their ' +
    `assistant passing it on, in ${LANGUAGE_NAME[language] ?? LANGUAGE_NAME.ka}. Not a quotation and ` +
    'no quotation marks. Keep every name, number, price, time, date, address and link exactly as ' +
    'written. Add nothing they did not say. One to three sentences. Reply with the text only.'
  );
}

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
    .join(' ')
    .trim();
}

export async function ruleAnswerInOwnWords(
  ruleAnswer: string,
  question: string,
  language: RunLanguage,
  recipientUserId: string,
): Promise<string> {
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: RULE_WORDING_MODEL,
        max_tokens: RULE_WORDING_MAX_TOKENS,
        system: wordingPrompt(language),
        messages: [
          {
            role: 'user',
            content:
              `Question: ${question.slice(0, MAX_INPUT_CHARS)}\n` +
              `Standing answer: ${ruleAnswer.slice(0, MAX_INPUT_CHARS)}`,
          },
        ],
      },
      { timeout: RULE_WORDING_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: recipientUserId,
      kind: 'rule_answer_wording',
      model: RULE_WORDING_MODEL,
      usage: response.usage,
    }).catch(() => undefined);
    const worded = textOf(response.content);
    if (worded === '') return ruleAnswer;
    const lost = missingFacts(ruleAnswer, worded);
    if (lost.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[answer-rule] the wording lost ${lost.length} fact(s) — the saved answer goes`);
      return ruleAnswer;
    }
    return worded;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[answer-rule] could not word the saved answer:', (err as Error).message);
    return ruleAnswer;
  }
}
