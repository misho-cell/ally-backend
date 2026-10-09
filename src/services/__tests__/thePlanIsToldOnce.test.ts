import { readFileSync } from 'fs';
import { join } from 'path';
import { carriesPlanSentence } from '../planJustification';

/** 48247 (thread 46960): a plan step and then the final reply told the same plan twice. */
describe('a plan told early as a step', () => {
  it('is recognised by the plan sentence, in the tester’s words', () => {
    expect(
      carriesPlanSentence(
        'ნიკოს, გიას, ლევანის და დავითის ასისტენტებს დაველაპარაკები და შევეცდები. დავიწყო?',
      ),
    ).toBe(true);
    expect(carriesPlanSentence('ვეძებ შენს ნაცნობებში.')).toBe(false);
  });

  it('is dropped once the reply carries the plan, right after the word-for-word tidy-up', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const repeats = chat.indexOf('await dropStepsTheReplyRepeats(threadId, runId, storedReply);');
    const plans = chat.indexOf('await dropPlanStepsTheReplyCarries(threadId, runId, storedReply);');
    expect(repeats).toBeGreaterThan(-1);
    expect(plans).toBeGreaterThan(repeats);
    const fn = chat.slice(chat.indexOf('async function dropPlanStepsTheReplyCarries('));
    expect(fn.slice(0, 600)).toContain('if (!runId || !carriesPlanSentence(reply)) return;');
  });
});
