import {
  LEGACY_STEP_ID,
  NamedAction,
  StepAction,
  nextInOrder,
  parseSteps,
  planHasSteps,
  stepAsksPhone,
  stepById,
  stepNumber,
  stepsOf,
  stepsWithoutOwner,
} from '../planSteps';
import { parsePlan } from '../taskPlans.service';
import { planStepsLine } from '../planStepsText';

/**
 * Autonomy stage 2, K1: the plan as steps. Fictional people and numbers only.
 */
const ANA = '+995 500 00 00 01';
const BEKA = '+995500000002';
const PEOPLE = { peoplePhones: [ANA, BEKA] };

const ASK_ANA = {
  id: 's1',
  action: 'ask',
  who: { phone: ANA, name: 'ანა ტესტაძე' },
  what: 'იცნობს თუ არა საერთაშორისო ურთიერთობების სტუდენტებს',
  on_silence: { after_days: 2, next_step: 's2' },
  on_no: { next_step: 's2' },
  on_named: { action: 'introduce' },
};
const ASK_BEKA = { id: 's2', action: 'ask', who: { phone: BEKA, name: 'ბექა ტესტია' } };
const WEB = { id: 's3', action: 'web', what: 'სტუდენტური კლუბები', ask_owner: true };

describe('parseSteps', () => {
  it('reads a full step list and keeps every rule', () => {
    const out = parseSteps([ASK_ANA, ASK_BEKA, WEB], PEOPLE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value).toHaveLength(3);
    expect(out.value[0]).toEqual({
      id: 's1',
      action: StepAction.Ask,
      who: { phone: ANA, name: 'ანა ტესტაძე' },
      what: ASK_ANA.what,
      on_silence: { after_days: 2, next_step: 's2' },
      on_no: { next_step: 's2' },
      on_named: { action: NamedAction.Introduce },
      ask_owner: false,
    });
    expect(out.value[2].ask_owner).toBe(true);
  });

  it('treats absent steps as an old plan, not an error', () => {
    expect(parseSteps(undefined, PEOPLE)).toEqual({ ok: true, value: [] });
    expect(parseSteps([], PEOPLE)).toEqual({ ok: true, value: [] });
  });

  it('gives a step without an id its position', () => {
    const out = parseSteps([{ action: 'web' }, { action: 'search' }], PEOPLE);
    expect(out.ok && out.value.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it.each([
    ['not a list', { action: 'ask' }, 'list'],
    ['an unknown action', [{ action: 'call' }], 'action must be one of'],
    [
      'silence of zero days',
      [{ ...ASK_ANA, on_silence: { after_days: 0, next_step: 's2' } }, ASK_BEKA],
      'after_days',
    ],
    [
      'silence of half a day',
      [{ ...ASK_ANA, on_silence: { after_days: 1.5, next_step: 's2' } }, ASK_BEKA],
      'after_days',
    ],
    ['an ask with no phone', [{ action: 'ask', who: { name: 'ანა' } }], 'who.phone'],
    [
      'an ask to somebody outside the plan',
      [{ action: 'ask', who: { phone: '+995500000099' } }],
      'people_to_involve',
    ],
    [
      'two steps with one id',
      [
        { id: 'a', action: 'web' },
        { id: 'a', action: 'search' },
      ],
      'used twice',
    ],
    ['an unknown on_named action', [{ ...WEB, on_named: { action: 'call' } }], 'on_named'],
  ])('refuses %s', (_label, raw, word) => {
    const out = parseSteps(raw, PEOPLE);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain(word);
  });

  it('refuses more than ten steps', () => {
    const out = parseSteps(
      Array.from({ length: 11 }, () => ({ action: 'web' })),
      PEOPLE,
    );
    expect(out.ok).toBe(false);
  });
});

describe('reading steps off a plan', () => {
  const parsed = parseSteps([ASK_ANA, ASK_BEKA, WEB], PEOPLE);
  const plan = { steps: parsed.ok ? parsed.value : [] };

  it('reads an old plan as one step asking everyone', () => {
    expect(planHasSteps({})).toBe(false);
    expect(planHasSteps(null)).toBe(false);
    expect(stepsOf({})).toEqual([{ id: LEGACY_STEP_ID, action: StepAction.Ask, ask_owner: false }]);
  });

  it('finds steps by id, number and order', () => {
    expect(planHasSteps(plan)).toBe(true);
    expect(stepById(plan, 's2')?.who?.name).toBe('ბექა ტესტია');
    expect(stepById(plan, null)).toBeNull();
    expect(stepById(plan, 'zz')).toBeNull();
    expect(stepNumber(plan, 's3')).toBe(3);
    expect(nextInOrder(plan, 's1')?.id).toBe('s2');
    expect(nextInOrder(plan, 's3')).toBeNull();
    expect(nextInOrder(plan, 'zz')).toBeNull();
  });

  it('matches a step to its person by digits', () => {
    expect(stepAsksPhone(plan.steps[0], '995500000001')).toBe(true);
    expect(stepAsksPhone(plan.steps[0], BEKA)).toBe(false);
    expect(stepAsksPhone(plan.steps[2], ANA)).toBe(false);
  });

  it('lists what the approval covers without the owner', () => {
    expect(stepsWithoutOwner(plan).map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('a v2 plan through parsePlan', () => {
  const v2 = {
    result_when: 'ორი სტუდენტი თანახმაა შეხვედრაზე',
    routes: [{ name: 'ქსელში კითხვა', status: 'waiting' }],
    people_to_involve: [
      { name: 'ანა ტესტაძე', phone: ANA, route: 'ქსელში კითხვა' },
      { name: 'ბექა ტესტია', phone: BEKA, route: 'ქსელში კითხვა' },
    ],
    steps: [ASK_ANA, ASK_BEKA, WEB],
  };

  it('accepts result_when in place of solved_when and keeps the steps', () => {
    const out = parsePlan(v2);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.solved_when).toBe(v2.result_when);
    expect(out.value.result_when).toBe(v2.result_when);
    expect(out.value.steps).toHaveLength(3);
  });

  it('leaves an old plan exactly as it was', () => {
    const out = parsePlan({ ...v2, result_when: undefined, solved_when: 'x', steps: undefined });
    expect(out.ok && 'steps' in out.value).toBe(false);
    expect(out.ok && 'result_when' in out.value).toBe(false);
  });

  it('refuses a step whose person the plan does not name', () => {
    const out = parsePlan({ ...v2, people_to_involve: v2.people_to_involve.slice(0, 1) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('step s2');
  });
});

describe('the steps line on the plan card', () => {
  const parsed = parseSteps([ASK_ANA, ASK_BEKA, WEB], PEOPLE);
  const steps = parsed.ok ? parsed.value : [];
  const people = [{ phone: ANA }, { phone: BEKA }];

  it('shows the steps briefly and marks the owner’s point', () => {
    expect(planStepsLine({ steps, people_to_involve: people }, 'ka')).toBe(
      'ნაბიჯები: 1. ვკითხავ — ანა ტესტაძე; 2. ვკითხავ — ბექა ტესტია; ' +
        '3. ინტერნეტში ვეძებ (აქ შენს სიტყვას დაველოდები).',
    );
    expect(planStepsLine({ steps, people_to_involve: people }, 'en')).toContain(
      '3. search the web (I will wait',
    );
  });

  it('never names a person the server took out of the plan', () => {
    const line = planStepsLine({ steps, people_to_involve: [{ phone: ANA }] }, 'en') ?? '';
    expect(line).not.toContain('ბექა');
    // Giorgi, 9 Nov (case 2): the step to a person no longer shown is left out
    // („2. ask;" said nothing), and the steps after it close up.
    expect(line).toBe(
      'Steps: 1. ask — ანა ტესტაძე; 2. search the web (I will wait for your word here).',
    );
  });

  // Giorgi, 9 Nov: and-two-more hid who they were; every step is named.
  it('names every step, past the fifth too', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `w${i}`,
      action: StepAction.Web,
      ask_owner: false,
    }));
    const line = planStepsLine({ steps: many, people_to_involve: [] }, 'en') ?? '';
    expect(line).toContain('7. search the web.');
    expect(line).not.toContain('more');
  });

  it('adds nothing for an old plan', () => {
    expect(planStepsLine({ people_to_involve: people }, 'ka')).toBeNull();
  });
});

/**
 * Ops' daily checks (6, 7, 8 Nov) and Tornike's 8 Nov report, #12: a rule that
 * leads nowhere — on the last step, pointing back, or at a step never written —
 * is dropped, and the plan goes on. Steps still only move forward.
 */
describe('a rule that leads nowhere', () => {
  it.each([
    [
      'on the last step, at itself',
      [{ id: 's1', action: 'search', what: 'web', on_no: { next_step: 's1' } }],
    ],
    [
      'pointing back',
      [
        { id: 's1', action: 'web' },
        { id: 's2', action: 'search', on_no: { next_step: 's1' } },
      ],
    ],
    ['at a step never written', [{ id: 's1', action: 'web', on_no: { next_step: 's9' } }]],
  ])('%s is dropped and the plan goes on', (_label, steps) => {
    const out = parseSteps(steps, { peoplePhones: [] });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.every((step) => step.on_no === undefined)).toBe(true);
  });

  it('drops a silence rule that leads nowhere, keeping the step', () => {
    const out = parseSteps(
      [{ id: 's1', action: 'web', on_silence: { after_days: 2, next_step: 's2' } }],
      { peoplePhones: [] },
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value).toHaveLength(1);
      expect(out.value[0].on_silence).toBeUndefined();
    }
  });

  it('keeps a rule that points forward', () => {
    const out = parseSteps(
      [
        { id: 's1', action: 'web', on_no: { next_step: 's2' } },
        { id: 's2', action: 'search' },
      ],
      { peoplePhones: [] },
    );
    expect(out.ok && out.value[0].on_no).toEqual({ next_step: 's2' });
  });
});
