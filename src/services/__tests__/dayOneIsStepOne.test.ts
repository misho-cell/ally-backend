const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  withTransaction: jest.fn(async (work: (client: { query: jest.Mock }) => Promise<unknown>) =>
    work({ query: mockClientQuery }),
  ),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { PlanStep, StepAction } from '../planSteps';
import { planDayOneEvent } from '../planAdvance.service';

/**
 * Autonomy stage 2, K12: day one of a plan with steps is „ნაბიჯი 1 დაიწყო: …"
 * instead of „[მოვლენა] გეგმა ახლახან დამტკიცდა — …". Fictional data.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const STEPS: PlanStep[] = [
  {
    id: 's1',
    action: StepAction.Ask,
    who: { phone: '+995500000001', name: 'ანა' },
    ask_owner: false,
  },
  { id: 's2', action: StepAction.Web, ask_owner: false },
];

function database(plan: unknown, current: string | null): void {
  mockQuery.mockImplementation(
    async () =>
      (plan === null
        ? { rows: [], rowCount: 0 }
        : { rows: [{ plan, plan_step: current }], rowCount: 1 }) as never,
  );
}

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('planDayOneEvent', () => {
  it('starts step one and names it', async () => {
    database({ steps: STEPS }, null);
    const event = await planDayOneEvent(7001);
    expect(event?.ka).toBe(
      'ნაბიჯი 1 დაიწყო: კითხვა — ანა. გეგმა დამტკიცებულია — გააკეთე ახლა, მფლობელის კითხვის გარეშე.',
    );
    expect(mockClientQuery.mock.calls[0]).toEqual([
      'UPDATE tasks SET plan_step = $2 WHERE id = $1',
      [7001, 's1'],
    ]);
  });

  it('a retried day one finds the step already started and does not start it again', async () => {
    database({ steps: STEPS }, 's1');
    await expect(planDayOneEvent(7001)).resolves.toEqual(
      expect.objectContaining({ en: expect.stringContaining('Step 1 has started') }),
    );
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('is null for a plan without steps or no approved plan, and on a fault', async () => {
    database({ solved_when: 'x' }, null);
    await expect(planDayOneEvent(7001)).resolves.toBeNull();
    database(null, null);
    await expect(planDayOneEvent(7001)).resolves.toBeNull();
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(planDayOneEvent(7001)).resolves.toBeNull();
  });
});

describe('the day-one wake', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('reads its event at wake time, falling back to the old one without steps', () => {
    const start = engine.slice(engine.indexOf('export function startDayOne'));
    expect(start.slice(0, 400)).toContain('() => dayOneEventFor(taskId),');
    const event = engine.slice(engine.indexOf('async function dayOneEventFor'));
    expect(event.slice(0, 300)).toContain('if (step === null) return DAY_ONE_EVENT;');
    expect(event.slice(0, 500)).toContain('DAY_ONE_FIRST_PASS[language]');
  });

  it('resolves a lazy event before entering the thread', () => {
    expect(engine).toContain(
      "const text = typeof eventText === 'function' ? await eventText() : eventText;",
    );
  });
});
