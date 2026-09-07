import { query } from '../db/postgres/client';

/**
 * The answer rule approved once (Ticket 10 Task 22; D120).
 *
 * A rule is a user's standing answer to one kind of incoming question. It is
 * created from the second button of the confirm turn — "send now, and answer
 * like this in future" — never on its own; a matching question later is
 * answered from it without a new yes, the ask row is marked automatic, and the
 * weekly summary lists it. The user can see and delete their rules.
 *
 * Matching is deliberately dumb and strict. A model could judge "the same
 * kind of question" better, but a model's judgement cannot be shown to the
 * user as the reason their words went out. Word overlap can: the incoming
 * question must share most of its meaningful words with the question the rule
 * was made from (or the rule's own description), and at least two of them.
 */

const RULE_QUERY_TIMEOUT_MS = 8_000;
const MAX_RULES_PER_USER = 50;
const MAX_TEXT_CHARS = 600;
/** Words shorter than this carry no meaning worth matching on. */
const MIN_WORD_CHARS = 3;
/** This share of the incoming question's meaningful words must appear in the rule. */
const MIN_OVERLAP_SHARE = 0.6;
/** …and never fewer than this many words, whatever the share. */
const MIN_SHARED_WORDS = 2;
/** Georgian case endings replace at most this many letters at the end of a word. */
const MAX_ENDING_CHARS = 2;
const STEM_CHARS = 4;

export interface AnswerRule {
  id: number;
  user_id: number;
  kind: string;
  sample_question: string;
  answer: string;
  active: boolean;
  uses: number;
  last_used_at: string | null;
  created_at: string;
}

/**
 * The words every question carries and no kind is made of. „კარგი … ხომ არ
 * იცი?" is how a Georgian asks for anything; „do you know a good…" likewise.
 * Left in, two unrelated questions share three words and read as one kind.
 */
const STOPWORDS = new Set([
  'ხომ',
  'არა',
  'იცი',
  'იცით',
  'ვინმე',
  'ვინმეს',
  'რამე',
  'გთხოვ',
  'გთხოვთ',
  'შეიძლება',
  'მჭირდება',
  'ვეძებ',
  'კარგი',
  'კარგ',
  'ერთი',
  'the',
  'and',
  'you',
  'know',
  'any',
  'good',
  'someone',
  'anyone',
  'need',
  'looking',
  'for',
  'who',
  'what',
  'please',
  'could',
  'would',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_WORD_CHARS && !STOPWORDS.has(w));
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  if (prefix < STEM_CHARS) return false;
  return prefix >= Math.min(a.length, b.length) - MAX_ENDING_CHARS;
}

/**
 * How much of the incoming question the rule covers, 0–1: the share of the
 * question's meaningful words found in the rule's sample question or kind.
 * Pure, so the threshold is a tested number and not a feeling.
 */
export function ruleCoverage(
  question: string,
  rule: Pick<AnswerRule, 'kind' | 'sample_question'>,
): number {
  const asked = words(question);
  if (asked.length === 0) return 0;
  const known = [...words(rule.sample_question), ...words(rule.kind)];
  const shared = asked.filter((w) => known.some((k) => sameWord(w, k)));
  // A one-word question („სტომატოლოგი?") is covered when that word is; a
  // longer one needs at least two of its words in the rule.
  if (shared.length < Math.min(MIN_SHARED_WORDS, asked.length)) return 0;
  return shared.length / asked.length;
}

/** The one rule that covers the question well enough, or null. Best coverage wins. */
export function pickRule<T extends Pick<AnswerRule, 'kind' | 'sample_question'>>(
  question: string,
  rules: readonly T[],
): T | null {
  let best: { rule: T; coverage: number } | null = null;
  for (const rule of rules) {
    const coverage = ruleCoverage(question, rule);
    if (coverage < MIN_OVERLAP_SHARE) continue;
    if (best === null || coverage > best.coverage) best = { rule, coverage };
  }
  return best?.rule ?? null;
}

export type RuleOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

export async function saveAnswerRule(
  userId: string,
  kind: string,
  sampleQuestion: string,
  answer: string,
): Promise<RuleOutcome<AnswerRule>> {
  const k = kind.trim().slice(0, MAX_TEXT_CHARS);
  const q = sampleQuestion.trim().slice(0, MAX_TEXT_CHARS);
  const a = answer.trim().slice(0, MAX_TEXT_CHARS);
  if (!k) return { ok: false, error: 'kind — one line saying what the rule covers — is required' };
  if (!q || !a) return { ok: false, error: 'the question and the approved answer are required' };
  const count = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM answer_rules WHERE user_id = $1 AND active`,
    [userId],
    RULE_QUERY_TIMEOUT_MS,
  );
  if (Number(count.rows[0]?.n ?? 0) >= MAX_RULES_PER_USER) {
    return { ok: false, error: `at most ${MAX_RULES_PER_USER} active rules` };
  }
  const result = await query<AnswerRule>(
    `INSERT INTO answer_rules (user_id, kind, sample_question, answer)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, kind, sample_question, answer, active, uses, last_used_at, created_at`,
    [userId, k, q, a],
    RULE_QUERY_TIMEOUT_MS,
  );
  return { ok: true, value: result.rows[0] };
}

export async function listAnswerRules(userId: string): Promise<AnswerRule[]> {
  const result = await query<AnswerRule>(
    `SELECT id, user_id, kind, sample_question, answer, active, uses, last_used_at, created_at
     FROM answer_rules WHERE user_id = $1 AND active
     ORDER BY created_at DESC LIMIT $2`,
    [userId, MAX_RULES_PER_USER],
    RULE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** Delete = deactivate. The asks it answered keep pointing at it, for the record. */
export async function deleteAnswerRule(userId: string, ruleId: number): Promise<boolean> {
  const result = await query(
    `UPDATE answer_rules SET active = FALSE WHERE id = $1 AND user_id = $2 AND active`,
    [ruleId, userId],
    RULE_QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

/** The active rule of this recipient that covers the question, if any. */
export async function matchAnswerRule(
  recipientUserId: number,
  question: string,
): Promise<AnswerRule | null> {
  const rules = await listAnswerRules(String(recipientUserId));
  return pickRule(question, rules);
}

export async function recordRuleUse(ruleId: number): Promise<void> {
  await query(
    `UPDATE answer_rules SET uses = uses + 1, last_used_at = NOW() WHERE id = $1`,
    [ruleId],
    RULE_QUERY_TIMEOUT_MS,
  );
}
