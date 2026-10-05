import { recordClaudeUsage } from './costLedger.service';

/**
 * D652 needs a saved rule to fire, and D648 took away the way it fired. The
 * word-overlap match (answerRules.service) compares the question as sent with
 * the rule's saved question — and since D648 every ask is the asker's
 * assistant's own wording, often in another language. The tester's 1158: an
 * English rule for „a good English tutor for a child in Tbilisi" met
 * „იცნობ კარგ ინგლისურის რეპეტიტორს ბავშვისთვის თბილისში?" and „Looking for a
 * solid English language tutor who works well with kids…" and matched neither.
 *
 * Misho's word (5 Oct, „ა"): when the words do not match, a small model judges
 * whether the question is the same kind as one of the recipient's rules. It
 * runs only for a recipient who holds an active rule, says „none" when in
 * doubt, and any failure is „none" — a question not answered automatically
 * goes to the person as an ordinary question, which is always safe.
 */
const RULE_MATCH_MODEL = process.env.RULE_MATCH_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const RULE_MATCH_TIMEOUT_MS = 6_000;
const RULE_MATCH_MAX_TOKENS = 10;
const MAX_QUESTION_CHARS = 600;
const MAX_RULE_CHARS = 300;
const NONE = 'none';

export interface MatchableRule {
  readonly kind: string;
  readonly sample_question: string;
}

/**
 * Ninia's ask 11518 (5 Oct): „a reliable accountant?" was answered by a rule
 * for „a lawyer or another specialist on a specific matter", and the owner was
 * told the lawyer's name. A catch-all in a rule's description is not a promise
 * about every profession; the example question says what the rule is for.
 */
const MATCH_PROMPT =
  'Someone keeps standing answers for certain kinds of questions. Decide whether the new ' +
  'question asks for the same thing as one of the numbered rules: the same profession or ' +
  "service as the rule's example question, and the same place when either names one. A " +
  'catch-all in a description ("or another specialist", "any expert", "etc.") does not widen ' +
  'a rule to other professions: a lawyer rule never answers a question about an accountant. ' +
  'Wording and language do not matter. When unsure, or when it only resembles a rule, answer ' +
  `none. Reply with the rule's number only, or ${NONE}.`;

function rulesList(rules: readonly MatchableRule[]): string {
  return rules
    .map(
      (rule, i) =>
        `${i + 1}. ${rule.kind.slice(0, MAX_RULE_CHARS)} — e.g. „${rule.sample_question.slice(0, MAX_RULE_CHARS)}"`,
    )
    .join('\n');
}

/** The index the model named, or null for none, an unreadable reply or a number out of range. */
export function chosenRuleIndex(reply: string, ruleCount: number): number | null {
  const number = /^\s*(\d+)\s*\.?\s*$/u.exec(reply)?.[1];
  if (number === undefined) return null;
  const index = Number(number) - 1;
  return index >= 0 && index < ruleCount ? index : null;
}

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

/** The rule whose kind the question is, judged by meaning; null when none or on any failure. */
export async function ruleCoveringByMeaning<T extends MatchableRule>(
  question: string,
  rules: readonly T[],
  recipientUserId: string,
): Promise<T | null> {
  if (rules.length === 0 || question.trim() === '') return null;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: RULE_MATCH_MODEL,
        max_tokens: RULE_MATCH_MAX_TOKENS,
        system: MATCH_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Rules:\n${rulesList(rules)}\n\nNew question: ${question.slice(0, MAX_QUESTION_CHARS)}`,
          },
        ],
      },
      { timeout: RULE_MATCH_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: recipientUserId,
      kind: 'rule_answer_match',
      model: RULE_MATCH_MODEL,
      usage: response.usage,
    }).catch(() => undefined);
    const index = chosenRuleIndex(replyText(response.content), rules.length);
    return index === null ? null : rules[index];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[answer-rule] could not judge the match:', (err as Error).message);
    return null;
  }
}
