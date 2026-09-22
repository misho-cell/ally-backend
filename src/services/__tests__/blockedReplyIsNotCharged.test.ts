import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 76 — „NOTHING WAS LOST" WAS NOT TRUE, AND WE WERE CHARGING FOR IT.
 *
 * When the reply moderation blocks an answer, the owner reads
 * `moderationBlocked`: „that is on us, not on your wording. Nothing was lost;
 * say „again" and I will rewrite it."
 *
 * They were charged for the answer they never saw. The three real blocks in
 * the fifteen days to 22 September, read from the live tables with what each
 * cost its owner:
 *
 *   13 Sep  thread 14792   run f13787a8    6 tokens
 *   15 Sep  thread 15016   run 20711eb2   10 tokens
 *   21 Sep  thread 20857   run dad8bba4   20 tokens
 *
 * Thirty-six tokens in fifteen days. The money is not the point: the product
 * told somebody nothing was lost while keeping what they had paid, and then
 * charged them again for the retry that worked.
 *
 * WHY A SOURCE TEST. The debit is one branch at the end of `processChat`, a
 * function long past any unit harness, and what has to hold is a RELATION
 * between two places in it — the moderation verdict decides the charge. A test
 * that mocked its way to the debit would assert the mock. This asserts the
 * relation, and fails if either half moves.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/** Comments stripped: the paragraph above the branch describes it in words. */
const CODE = CHAT.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ');

describe('a reply the owner never saw is not charged for', () => {
  it('the debit is guarded by the moderation verdict', () => {
    expect(CODE).toContain('payerId !== null && !replySafe');
  });

  /**
   * The guard has to come FIRST. `else if (payerId !== null)` after it is what
   * makes the blocked case exclusive; the other order charges and then logs.
   */
  it('and the ordinary debit is the else, not a second statement', () => {
    const guard = CODE.indexOf('payerId !== null && !replySafe');
    const debit = CODE.indexOf('debitRun(payerId, runId)');

    expect(guard).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(guard);
    expect(CODE.slice(guard, debit)).toContain('} else if (payerId !== null) {');
  });

  /**
   * NOT SILENTLY. A missing row is a weak record — „we chose not to charge"
   * and „the debit failed" look identical in the table, and this codebase
   * keeps finding that exact substitution. The line says which it was.
   */
  it('says out loud that it did not charge, and why', () => {
    const guard = CODE.indexOf('payerId !== null && !replySafe');
    const branch = CODE.slice(guard, guard + 600);

    expect(branch).toContain('[wallet]');
    expect(branch).toContain('NOT charged');
    expect(branch).toContain('moderation');
  });

  /**
   * `usage_events` is what the PROVIDER cost us and it is untouched — the
   * business's own books still say what the blocked answer cost to produce.
   * Only `token_transactions`, which is what the OWNER pays, goes unwritten.
   */
  it('does not reach for a refund, which would dip the balance and need a second guard', () => {
    const guard = CODE.indexOf('payerId !== null && !replySafe');
    const branch = CODE.slice(guard, guard + 600);

    expect(branch).not.toContain('moderation_refund');
    expect(branch).not.toContain('recordClaudeUsage');
  });
});

/**
 * And the sentence the owner reads has to keep saying it, in every language —
 * it is the half of the done-when that was already true, and the half that
 * made the charge a lie.
 */
describe('the line that promises nothing was lost', () => {
  const RUN_LANGUAGE = readFileSync(join(__dirname, '..', 'runLanguage.ts'), 'utf8');

  it('still tells the owner it is on us, not on their wording', () => {
    expect(RUN_LANGUAGE).toContain('Nothing was lost');
    expect(RUN_LANGUAGE).toContain('შესრულებული სამუშაო არ დაკარგულა');
  });
});
