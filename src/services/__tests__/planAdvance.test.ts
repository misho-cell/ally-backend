import { NamedAction, PlanStep, StepAction, LEGACY_STEP_ID } from '../planSteps';
import {
  StepEnd,
  isForward,
  stepAfter,
  stepAnsweredNote,
  stepForRecipient,
  stepStartedEvent,
  withStepNote,
} from '../planAdvance';

/** Autonomy stage 2, K3: a step's own rule decides what comes next. Fictional data. */
const ANA = '+995500000001';
const BEKA = '+995500000002';
const GELA = '+995500000003';

const STEPS: PlanStep[] = [
  {
    id: 's1',
    action: StepAction.Ask,
    who: { phone: ANA, name: 'ანა' },
    on_silence: { after_days: 2, next_step: 's3' },
    on_named: { action: NamedAction.Introduce },
    ask_owner: false,
  },
  { id: 's2', action: StepAction.Ask, who: { phone: BEKA, name: 'ბექა' }, ask_owner: false },
  {
    id: 's3',
    action: StepAction.Ask,
    who: { phone: GELA, name: 'გელა' },
    what: 'სტუდენტური კლუბი',
    on_no: { next_step: 's4' },
    ask_owner: false,
  },
  { id: 's4', action: StepAction.Web, ask_owner: true },
];
const PLAN = { steps: STEPS };

describe('stepAfter', () => {
  it('a no goes to the next step in order when the step names no rule', () => {
    expect(stepAfter(PLAN, 's1', StepEnd.Declined)?.id).toBe('s2');
  });

  it('a no follows on_no when the step has one', () => {
    expect(stepAfter(PLAN, 's3', StepEnd.Declined)?.id).toBe('s4');
  });

  it('silence follows on_silence, and only a step with that rule moves on silence', () => {
    expect(stepAfter(PLAN, 's1', StepEnd.Silent)?.id).toBe('s3');
    expect(stepAfter(PLAN, 's2', StepEnd.Silent)).toBeNull();
  });

  it('the „ask everyone" step of an old plan never ends on one person’s no', () => {
    expect(stepAfter({}, LEGACY_STEP_ID, StepEnd.Declined)).toBeNull();
  });

  it('nothing for an unknown step or the last one', () => {
    expect(stepAfter(PLAN, 'zz', StepEnd.Declined)).toBeNull();
    expect(stepAfter(PLAN, 's4', StepEnd.Declined)).toBeNull();
  });
});

describe('stepForRecipient', () => {
  it('finds the step asking this person from the current one on', () => {
    expect(stepForRecipient(PLAN, 's1', ['995500000002'])?.id).toBe('s2');
    expect(stepForRecipient(PLAN, null, [ANA])?.id).toBe('s1');
  });

  it('records a send to an earlier step’s person on that step', () => {
    expect(stepForRecipient(PLAN, 's3', [ANA])?.id).toBe('s1');
  });

  it('puts any send of an old plan on its one step', () => {
    expect(stepForRecipient({}, null, [GELA])?.id).toBe(LEGACY_STEP_ID);
  });

  it('is null for a person no step names', () => {
    expect(stepForRecipient(PLAN, 's1', ['+995500000099'])).toBeNull();
  });
});

describe('isForward', () => {
  it('only later steps are forward; no current step means the plan starts', () => {
    expect(isForward(PLAN, null, 's1')).toBe(true);
    expect(isForward(PLAN, 's1', 's3')).toBe(true);
    expect(isForward(PLAN, 's3', 's1')).toBe(false);
    expect(isForward(PLAN, 's2', 's2')).toBe(false);
  });
});

describe('the events', () => {
  it('names the new step, why, and that no owner question is needed', () => {
    const event = stepStartedEvent(PLAN, STEPS[2], { stepId: 's1', end: StepEnd.Silent });
    expect(event.ka).toBe(
      '(ნაბიჯ 1-ზე პასუხი ვადაში არ მოვიდა.) ნაბიჯი 3 დაიწყო: კითხვა — გელა (სტუდენტური კლუბი). ' +
        'გეგმა დამტკიცებულია — გააკეთე ახლა, მფლობელის კითხვის გარეშე.',
    );
    expect(event.en).toContain('Step 3 has started: ask — გელა (სტუდენტური კლუბი).');
  });

  it('sends the run to the owner only at a step the plan marked', () => {
    const event = stepStartedEvent(PLAN, STEPS[3]);
    expect(event.en).toBe(
      'Step 4 has started: search the web. The plan marked this step for the owner’s word: ' +
        'ask them first, in one sentence, and wait.',
    );
    expect(event.ru).toContain('Шаг 4');
    expect(event.es).toContain('paso 4');
  });

  it('after an answer: the result check, the name rule and the next step', () => {
    const note = stepAnsweredNote(PLAN, 's1');
    expect(note?.en).toBe(
      'An answer came on step 1. If the plan’s result is met — set_task_result. If the answer ' +
        'names somebody — the plan says ask for the introduction, without asking the owner. ' +
        'If not — the next step is 2: ask — ბექა.',
    );
    expect(stepAnsweredNote(PLAN, 's4')?.en).toBe(
      'An answer came on step 4. If the plan’s result is met — set_task_result.',
    );
    expect(stepAnsweredNote(PLAN, 'zz')).toBeNull();
  });

  it('puts the note under the event in every language, and changes nothing without one', () => {
    const note = { ka: 'ნ', en: 'n', ru: 'н', es: 'ñ' };
    expect(withStepNote('პასუხი', note)).toEqual({
      ka: 'პასუხი\n\nნ',
      en: 'პასუხი\n\nn',
      ru: 'პასუხი\n\nн',
      es: 'პასუხი\n\nñ',
    });
    expect(withStepNote('პასუხი', null)).toBe('პასუხი');
    expect(withStepNote(note, null)).toEqual(note);
  });
});
