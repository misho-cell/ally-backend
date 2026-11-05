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
import { notThisStepYetLine, stepRoom } from '../planAdvance';
import { planStepRoom } from '../planAdvance.service';
import { readWave, waveRoomFor } from '../askWaves.service';
import { Task } from '../taskStore.service';

/**
 * Autonomy stage 2, K10: with steps, the plan's own order replaces the waves'
 * three-at-once and „one go-between first" limits. Fictional people only.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const ANA = '+995500000001';
const BEKA = '+995500000002';
const GELA = '+995500000003';
const ask = (id: string, phone: string, name: string): PlanStep => ({
  id,
  action: StepAction.Ask,
  who: { phone, name },
  ask_owner: false,
});
const STEPS: PlanStep[] = [
  ask('s1', ANA, 'ანა'),
  { id: 's2', action: StepAction.Web, ask_owner: false },
  ask('s3', BEKA, 'ბექა'),
  ask('s4', GELA, 'გელა'),
];
const PLAN = { steps: STEPS };

describe('stepRoom', () => {
  it('before any step only the first person may be asked', () => {
    expect(stepRoom(PLAN, null, false, ANA)).toEqual({ allowed: true });
    expect(stepRoom(PLAN, null, false, BEKA).allowed).toBe(false);
  });

  it('while the current step waits, its person and earlier ones only', () => {
    expect(stepRoom(PLAN, 's1', false, ANA)).toEqual({ allowed: true });
    expect(stepRoom(PLAN, 's1', false, BEKA)).toEqual({ allowed: false, now: STEPS[0] });
  });

  it('once the current step is heard from, the next person step opens — past a web step', () => {
    expect(stepRoom(PLAN, 's1', true, BEKA)).toEqual({ allowed: true });
    expect(stepRoom(PLAN, 's1', true, GELA).allowed).toBe(false);
  });

  it('a current step with nobody to ask is done by itself', () => {
    expect(stepRoom(PLAN, 's2', false, BEKA)).toEqual({ allowed: true });
    expect(stepRoom(PLAN, 's3', false, ANA)).toEqual({ allowed: true });
  });

  it('tells the run whose step it is now, and not to ask the owner', () => {
    const line = notThisStepYetLine(PLAN, STEPS[0]);
    expect(line).toContain('ახლა ნაბიჯი 1: კითხვა — ანა.');
    expect(line).toContain('მფლობელს ამაზე არაფერს ეკითხები');
  });
});

describe('the waves under a plan with steps', () => {
  const task = {
    id: 7001,
    title: 'სტუდენტები',
    plan: {
      solved_when: 'x',
      routes: [{ name: 'r', status: 'running' }],
      people_to_involve: [
        { name: 'ანა', phone: ANA, route: 'r' },
        { name: 'ბექა', phone: BEKA, route: 'r' },
        { name: 'გელა', phone: GELA, route: 'r' },
      ],
      never_contact: [],
      steps: STEPS,
    },
    plan_version: 1,
    plan_approved_at: '2026-11-05T09:00:00Z',
  } as unknown as Task;

  function database(current: string | null, heard: boolean): void {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT plan_step, plan_delegated')) {
        return { rows: [{ plan_step: current, plan_delegated: false }], rowCount: 1 } as never;
      }
      if (sql.includes('kind = ANY'))
        return { rows: heard ? [{ one: 1 }] : [], rowCount: 0 } as never;
      return { rows: [], rowCount: 0 } as never;
    });
  }

  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('keeps no wave snapshot, so no wave note and no wave move', async () => {
    database('s1', false);
    await expect(readWave(task)).resolves.toBeNull();
  });

  it('lets the current step’s person through without a wave number', async () => {
    database('s1', false);
    await expect(waveRoomFor(task, ANA, async () => false)).resolves.toEqual({
      allowed: true,
      wave: null,
    });
  });

  it('holds a later step’s person, unless the owner named them (D625)', async () => {
    database('s1', false);
    const held = await waveRoomFor(task, GELA, async () => false);
    expect(held.allowed).toBe(false);
    if (!held.allowed) expect(held.error).toContain('ნაბიჯი 1');
    await expect(waveRoomFor(task, GELA, async () => true)).resolves.toEqual({
      allowed: true,
      wave: null,
    });
  });

  it('fails open to the plan wall when progress cannot be read', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(planStepRoom(7001, PLAN, GELA)).resolves.toEqual({ allowed: true });
  });
});
