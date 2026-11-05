jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { NamedAction, PlanStep, StepAction } from '../planSteps';
import { nightlyReviewEvent, silentDayEvent } from '../planNightly';
import {
  CLOSE_QUESTION_NOTE,
  CLOSE_QUESTION_NOTE_WITH_PLAN,
  closeQuestionNote,
} from '../idleWakes.service';
import { introOutcomeEvent } from '../taskEngine.events';
import { approvedPlanNamesMember, namedOnAnAskStep } from '../planAdvance.service';

/**
 * Session 3's K9 audit (docs/prompt_stage3/K9_REFUSALS.md), rows B3, B6, B10,
 * B11 and the structural half of B4: with an approved plan / a plan with steps
 * in force, the server's texts follow the plan; without one they stay as they
 * were. Fictional people only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const STEP: PlanStep = { id: 's1', action: StepAction.Web, ask_owner: false };
const RULE = '(rule 268)';
const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('B3: the approval note', () => {
  it('reads agreement in any words, a delegation included', () => {
    expect(src('chat.service.ts')).toContain(
      'ნებისმიერი სიტყვებით, მათ შორის როცა გადაწყვეტილებას შენ განდობს („შენ გადაწყვიტე")',
    );
  });
});

describe('B10: the nightly review and the silent-day wake', () => {
  it('follow the next step on a plan with steps, with the audit’s closing line', () => {
    for (const text of [
      nightlyReviewEvent({ steps: [STEP] }),
      silentDayEvent({ steps: [STEP] }, RULE),
    ]) {
      expect(text).toContain('თუ გეგმას შემდეგი ნაბიჯი აქვს — ის ახლავე გააკეთე.');
      expect(text).toContain('ბოლოს ერთი ხაზი: რა მოხდა და რა არის შემდეგი (გეგმის დღეებით).');
      expect(text).not.toContain('propose_task_plan');
      expect(text).not.toContain('როგორც კი ვინმე გიპასუხებს');
    }
  });

  it('keep the old text without steps', () => {
    const silent = silentDayEvent(null, RULE);
    expect(silent).toContain('თუ სიაში ყველას უკვე მისწერე — ეს მეთოდის შეცვლის დროა');
    expect(silent.endsWith(RULE)).toBe(true);
    expect(nightlyReviewEvent({})).toContain('თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე');
  });

  it('are what the engine wakes with', () => {
    expect(src('taskEngine.service.ts')).toContain(
      'await wakeTask(task.id, silentDayEvent(task.plan, RULE_268_QUIET_DAY_ONE));',
    );
  });
});

describe('B11: the five-day wake', () => {
  it('does the next step first when a plan is approved, and asks only when steps ran out', () => {
    expect(closeQuestionNote(true)).toBe(CLOSE_QUESTION_NOTE_WITH_PLAN);
    expect(CLOSE_QUESTION_NOTE_WITH_PLAN).toContain('ის ახლავე გააკეთე');
    expect(closeQuestionNote(false)).toBe(CLOSE_QUESTION_NOTE);
    expect(src('taskEngine.service.ts')).toContain(
      'closeQuestionNote(task.plan_approved_at !== null)',
    );
  });
});

describe('B6: a mediator the plan asks suggested someone else', () => {
  const event = (mediatorInPlan: boolean): Readonly<Record<string, string>> =>
    introOutcomeEvent('თიკო', false, 'kept_by_mediator', 'ბესო', true, {
      answer: 'ვერ დაგეხმარები, ლევანს ჰკითხე',
      mediatorInPlan,
    });

  it('is acted on inside the plan, the owner told in a line', () => {
    expect(event(true).ka).toContain('და გეგმის ფარგლებშია: ითხოვე გაცნობა ბესო-ის გავლით');
    expect(event(true).en).toContain('it is inside the plan');
    expect(event(true).en).not.toContain('before the owner says yes');
  });

  it('waits for the owner without a plan', () => {
    expect(event(false).en).toContain('do nothing on it before the owner says yes');
  });

  it('asks the plan whether it names the mediator, and says no on a failure', async () => {
    mockQuery.mockImplementation(
      async (sql: string) =>
        (sql.includes('SELECT plan, plan_step')
          ? {
              rows: [
                { plan: { people_to_involve: [{ phone: '+995500000001' }] }, plan_step: null },
              ],
            }
          : { rows: [{ phone: '995500000001' }] }) as never,
    );
    await expect(approvedPlanNamesMember(7001, 9001)).resolves.toBe(true);
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(approvedPlanNamesMember(7001, 9001)).resolves.toBe(false);
  });
});

describe('B4 (structural): a person named on an `on_named: ask` step', () => {
  const plan = {
    steps: [
      {
        id: 's1',
        action: StepAction.Ask,
        who: { phone: '+995500000001', name: 'ანა' },
        on_named: { action: NamedAction.Ask },
        ask_owner: false,
      },
      {
        id: 's2',
        action: StepAction.Ask,
        who: { phone: '+995500000002', name: 'ბექა' },
        ask_owner: false,
      },
    ],
  };

  function database(rows: unknown[]): void {
    mockQuery.mockImplementation(
      async (sql: string) =>
        (sql.includes('SELECT plan, plan_step')
          ? { rows: [{ plan, plan_step: 's1' }] }
          : { rows }) as never,
    );
  }

  it('is admitted when an answer on such a step names them', async () => {
    database([{ step_id: 's1', answer: 'კი, ჰკითხე გიორგი ტესტაძეს, ის იცის' }]);
    await expect(namedOnAnAskStep(7001, 'გიორგი ტესტაძე')).resolves.toBe(true);
  });

  it('is not admitted for a name no answer gave, or from a step without the rule', async () => {
    database([{ step_id: 's1', answer: 'არავის ვიცნობ' }]);
    await expect(namedOnAnAskStep(7001, 'გიორგი ტესტაძე')).resolves.toBe(false);
    database([{ step_id: 's2', answer: 'ჰკითხე გიორგი ტესტაძეს' }]);
    await expect(namedOnAnAskStep(7001, 'გიორგი ტესტაძე')).resolves.toBe(false);
  });

  it('keeps the wall shut on a failure', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(namedOnAnAskStep(7001, 'გიორგი ტესტაძე')).resolves.toBe(false);
  });
});
