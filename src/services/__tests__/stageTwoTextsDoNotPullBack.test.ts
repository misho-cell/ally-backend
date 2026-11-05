import { readFileSync } from 'fs';
import { join } from 'path';
import { PlanStep, StepAction } from '../planSteps';
import { nightlyReviewEvent } from '../planNightly';

/**
 * Autonomy stage 2 (session 3's finding): two server texts worked against an
 * executable plan — „approve only on a clear yes" left „you decide" out, and
 * the nightly review asked for a new yes after three silent days.
 */
const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');
const STEP: PlanStep = { id: 's1', action: StepAction.Web, ask_owner: false };

describe('the approval note', () => {
  const chat = src('chat.service.ts');
  const note = chat.slice(chat.indexOf('const PLAN_ANSWER_IN_WORDS'));

  it('takes the meaning of agreement, delegation included, in every language', () => {
    const body = note.slice(0, note.indexOf('};'));
    expect(body).not.toContain('მკაფიოდ დაეთანხმება');
    expect(body).not.toContain('clearly agrees');
    expect(body).toContain('„შენ გადაწყვიტე"');
    expect(body).toContain('„you decide"');
    expect(body.match(/delegated: true/gu)).toHaveLength(4);
  });
});

describe('the nightly review', () => {
  it('keeps the old text for a plan without steps', () => {
    const text = nightlyReviewEvent({});
    expect(text).toContain('თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე');
    expect(nightlyReviewEvent(null)).toBe(text);
  });

  it('asks for no new yes on a plan with steps — silence is on_silence', () => {
    const text = nightlyReviewEvent({ steps: [STEP] });
    expect(text).not.toContain('მეთოდი შეცვალე');
    expect(text).not.toContain('propose_task_plan');
    expect(text).toContain('on_silence');
    expect(text).toContain('ახალი „კი" არ სჭირდება');
    expect(text.startsWith('ღამის გადახედვა:')).toBe(true);
  });

  it('is what the engine wakes with, and the three-day sweep skips plans with steps', () => {
    const engine = src('taskEngine.service.ts');
    expect(engine).toContain('await wakeTask(task.id, nightlyReviewEvent(task.plan));');
    const sweep = engine.slice(engine.indexOf('export async function sweepMethodChanges'));
    const stamp = sweep.indexOf('await markMethodChangeWoken(task.id);');
    const skip = sweep.indexOf('if (planHasSteps(task.plan)) continue;');
    expect(stamp).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(stamp);
    expect(skip).toBeLessThan(sweep.indexOf('await wakeTask('));
  });
});
