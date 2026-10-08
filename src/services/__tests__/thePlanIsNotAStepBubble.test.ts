import { readFileSync } from 'fs';
import { join } from 'path';
import { stepRepeatsThePlanQuestion } from '../chat.service';

const STEP =
  'სოსო მზარეულის ასისტენტს დაველაპარაკები და შევეცდები გავარკვიო, ვისი რეკომენდაცია შეუძლია მოგცეს.\n\nდავიწყო?';

/** 2909 (conv 44079): the plan said in a step bubble and again in the reply. */
describe('a step written beside propose_task_plan', () => {
  it('is not published when it asks the plan question', () => {
    expect(stepRepeatsThePlanQuestion(STEP, ['propose_task_plan', 'present_choices'])).toBe(true);
    expect(
      stepRepeatsThePlanQuestion('I will ask Soso. Shall I start?', ['propose_task_plan']),
    ).toBe(true);
  });

  it('is published in any other round, or without the question', () => {
    expect(stepRepeatsThePlanQuestion(STEP, ['search_by_tag'])).toBe(false);
    expect(stepRepeatsThePlanQuestion('ვეძებ კონტაქტებში.', ['propose_task_plan'])).toBe(false);
  });

  it('is checked at every place a step goes out', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat.match(/const narration = withoutPlanQuestionStep\(/gu)).toHaveLength(2);
    expect(chat).toContain('!stepRepeatsThePlanQuestion(narration, continuationTools)');
  });
});
