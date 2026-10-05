import { missingFacts } from './answerFacts';
import { sentenceCarriedOver } from './sentenceCarriedOver';
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
/** A first wording and one corrected one. */
const WORDING_ATTEMPTS = 2;

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
    'no quotation marks. Speak ABOUT them in the third person — „he/she/they", „his daughter" — ' +
    'never as them („I", „my"). In Georgian one person is „ის / მისი / მას", never „მათი". ' +
    'Keep every name, number, price, time, date, address and link ' +
    'exactly as written, names in their original spelling and letters. Add nothing they did not ' +
    'say. One to three sentences. Reply with the text only.'
  );
}

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
    .join(' ')
    .trim();
}

/** Why a wording may not go: facts it lost, or the saved sentence carried over. */
function wordingFault(ruleAnswer: string, worded: string): string | null {
  if (worded === '') return 'empty';
  const lost = missingFacts(ruleAnswer, worded);
  if (lost.length > 0) return `Keep exactly, as written: ${lost.join(', ')}.`;
  if (sentenceCarriedOver(ruleAnswer, worded) !== null) {
    return 'That repeats their sentence. Say it in your own words, in the third person.';
  }
  return null;
}

async function wordOnce(
  ruleAnswer: string,
  question: string,
  language: RunLanguage,
  recipientUserId: string,
  correction: string | null,
): Promise<string> {
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
            `Standing answer: ${ruleAnswer.slice(0, MAX_INPUT_CHARS)}` +
            (correction === null ? '' : `\n\n${correction}`),
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
  return textOf(response.content);
}

/**
 * The saved answer worded afresh. One more try when the first wording lost a
 * fact or kept the saved sentence (the tester's 1159); after that, the saved
 * sentence goes as it is.
 */
export async function ruleAnswerInOwnWords(
  ruleAnswer: string,
  question: string,
  language: RunLanguage,
  recipientUserId: string,
): Promise<string> {
  try {
    let correction: string | null = null;
    for (let attempt = 0; attempt < WORDING_ATTEMPTS; attempt += 1) {
      const worded = await wordOnce(ruleAnswer, question, language, recipientUserId, correction);
      correction = wordingFault(ruleAnswer, worded);
      if (correction === null) return worded;
    }
    // eslint-disable-next-line no-console
    console.warn(`[answer-rule] the wording failed twice (${correction}) — the saved answer goes`);
    return ruleAnswer;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[answer-rule] could not word the saved answer:', (err as Error).message);
    return ruleAnswer;
  }
}
