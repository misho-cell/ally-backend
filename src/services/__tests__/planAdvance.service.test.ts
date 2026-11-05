const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(async (work: (client: { query: jest.Mock }) => Promise<unknown>) =>
    work({ query: mockClientQuery }),
  ),
}));

import { query } from '../../db/postgres/client';
import { PlanStep, StepAction } from '../planSteps';
import {
  MAX_SILENT_STEPS_PER_SWEEP,
  notePlanAskSent,
  notePlanNamed,
  planStepNoteForAnswers,
  silenceIsDue,
  sweepSilentSteps,
} from '../planAdvance.service';

/**
 * Autonomy stage 2, K3: the server moves the plan on what really happened.
 * The database is mocked by the SQL each call sends; fictional ids only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const ANA = '+995500000001';
const BEKA = '+995500000002';
const STEPS: PlanStep[] = [
  {
    id: 's1',
    action: StepAction.Ask,
    who: { phone: ANA, name: 'ანა' },
    on_silence: { after_days: 2, next_step: 's2' },
    ask_owner: false,
  },
  { id: 's2', action: StepAction.Ask, who: { phone: BEKA, name: 'ბექა' }, ask_owner: false },
];
const PLAN = { steps: STEPS };
const NOW = new Date('2026-11-05T12:00:00Z');

interface Db {
  plan: unknown;
  current: string | null;
  phones: string[];
  stepOfAsk: string | null;
  silence: unknown[];
  inserted: boolean;
}

function database(db: Partial<Db>): void {
  const full: Db = {
    plan: PLAN,
    current: null,
    phones: [],
    stepOfAsk: null,
    silence: [],
    inserted: true,
    ...db,
  };
  mockQuery.mockImplementation(async (sql: string) => {
    const rows = (r: unknown[], count = r.length): never => ({ rows: r, rowCount: count }) as never;
    if (sql.includes('SELECT plan, plan_step FROM tasks')) {
      return rows(full.plan === null ? [] : [{ plan: full.plan, plan_step: full.current }]);
    }
    if (sql.includes('FROM "UserPhone"')) return rows(full.phones.map((phone) => ({ phone })));
    if (sql.includes('SELECT step_id FROM plan_step_events')) {
      return rows(full.stepOfAsk === null ? [] : [{ step_id: full.stepOfAsk }]);
    }
    if (sql.includes('FROM tasks t')) return rows(full.silence);
    if (sql.includes('WHERE NOT EXISTS')) return rows([], full.inserted ? 1 : 0);
    return rows([]);
  });
}

function insertedEvents(): unknown[][] {
  return mockQuery.mock.calls
    .filter(([sql]) => String(sql).includes('INSERT INTO plan_step_events'))
    .map(([, params]) => params as unknown[]);
}

function movedTo(): unknown[] {
  return mockClientQuery.mock.calls
    .filter(([sql]) => String(sql).startsWith('UPDATE tasks SET plan_step'))
    .map(([, params]) => (params as unknown[])[1]);
}

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('a sent ask', () => {
  it('starts the step of the person asked and records the send on it', async () => {
    database({ current: 's1', phones: [BEKA] });
    await notePlanAskSent(7001, 42, 9001);
    expect(movedTo()).toEqual(['s2']);
    expect(insertedEvents()).toEqual([[7001, 's2', 'sent', '42']]);
  });

  it('does not move the plan for a send on the current step', async () => {
    database({ current: 's1', phones: [ANA] });
    await notePlanAskSent(7001, 42, 9001);
    expect(movedTo()).toEqual([]);
    expect(insertedEvents()).toEqual([[7001, 's1', 'sent', '42']]);
  });

  it('records nothing without an approved plan, or for a person no step names', async () => {
    database({ plan: null });
    await notePlanAskSent(7001, 42, 9001);
    database({ phones: ['+995500000099'] });
    await notePlanAskSent(7001, 43, 9002);
    expect(insertedEvents()).toEqual([]);
  });

  it('never lets a database fault reach the send', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(notePlanAskSent(7001, 42, 9001)).resolves.toBeUndefined();
  });
});

describe('a named person', () => {
  it('records `named` on the go-between’s step', async () => {
    database({ current: 's1', phones: [ANA] });
    await notePlanNamed(7001, 77, 9001);
    expect(insertedEvents()).toEqual([[7001, 's1', 'named', '77']]);
  });
});

describe('arrived answers', () => {
  it('a yes: recorded once, and the step’s rule rides the wake', async () => {
    database({ current: 's1', stepOfAsk: 's1' });
    const note = await planStepNoteForAnswers(7001, [{ id: 42, declined: false }]);
    expect(note?.en).toContain('An answer came on step 1.');
    expect(note?.en).toContain('the next step is 2: ask — ბექა');
    expect(insertedEvents()).toEqual([[7001, 's1', 'answered', '42']]);
    expect(movedTo()).toEqual([]);
  });

  it('a no on the current step moves the plan and names the new step', async () => {
    database({ current: 's1', stepOfAsk: 's1' });
    const note = await planStepNoteForAnswers(7001, [{ id: 42, declined: true }]);
    expect(movedTo()).toEqual(['s2']);
    expect(note?.en).toBe(
      '(Step 1 got a no.) Step 2 has started: ask — ბექა. The plan is approved — do it now, ' +
        'without asking the owner.',
    );
  });

  it('a no already acted on (a retried wake) names the current step without moving again', async () => {
    database({ current: 's2', stepOfAsk: 's1', inserted: false });
    const note = await planStepNoteForAnswers(7001, [{ id: 42, declined: true }]);
    expect(movedTo()).toEqual([]);
    expect(note?.en).toContain('Step 2 has started');
  });

  it('an old plan records the answer and leaves its wake as it was', async () => {
    database({ plan: { solved_when: 'x' }, current: 's1', stepOfAsk: 's1' });
    await expect(planStepNoteForAnswers(7001, [{ id: 42, declined: true }])).resolves.toBeNull();
    expect(insertedEvents()).toHaveLength(1);
  });

  it('an ask sent outside every step changes nothing', async () => {
    database({ current: 's1', stepOfAsk: null });
    await expect(planStepNoteForAnswers(7001, [{ id: 42, declined: false }])).resolves.toBeNull();
  });
});

describe('silence', () => {
  const row = (lastSent: string | null, heard = false): never =>
    ({ id: 7001, plan: PLAN, plan_step: 's1', last_sent: lastSent, heard }) as never;

  it('is due only after the step’s days, with nothing heard', () => {
    expect(silenceIsDue(row('2026-11-03T12:00:00Z'), NOW)).toBe(true);
    expect(silenceIsDue(row('2026-11-04T12:00:00Z'), NOW)).toBe(false);
    expect(silenceIsDue(row('2026-11-01T12:00:00Z', true), NOW)).toBe(false);
    expect(silenceIsDue(row(null), NOW)).toBe(false);
    expect(
      silenceIsDue({ ...(row('2026-11-01T12:00:00Z') as object), plan_step: 's2' } as never, NOW),
    ).toBe(false);
  });

  it('moves the plan by on_silence and wakes the goal with the new step', async () => {
    database({ silence: [row('2026-11-02T12:00:00Z')] });
    const wake = jest.fn();
    await expect(sweepSilentSteps(wake, NOW)).resolves.toBe(1);
    expect(movedTo()).toEqual(['s2']);
    expect(wake).toHaveBeenCalledWith(
      7001,
      expect.objectContaining({ en: expect.stringContaining('Step 2 has started') }),
    );
    const sweepSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes('FROM tasks t'));
    expect(sweepSql?.[1]).toContain(MAX_SILENT_STEPS_PER_SWEEP);
  });

  it('does not move twice for one silence', async () => {
    database({ silence: [row('2026-11-02T12:00:00Z')], inserted: false });
    const wake = jest.fn();
    await expect(sweepSilentSteps(wake, NOW)).resolves.toBe(0);
    expect(wake).not.toHaveBeenCalled();
  });
});
