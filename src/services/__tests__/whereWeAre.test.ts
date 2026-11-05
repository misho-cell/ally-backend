jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { PlanStep, StepAction } from '../planSteps';
import { StepEventKind } from '../planProgress.service';
import { renderWhereWeAre } from '../whereWeAre';
import { whereWeAreSection } from '../whereWeAre.service';
import { Task } from '../taskStore.service';

/** Autonomy stage 2, K4: „where we are" at the top of every goal run. Fictional data. */
const mockQuery = query as jest.MockedFunction<typeof query>;

const STEPS: PlanStep[] = [
  {
    id: 's1',
    action: StepAction.Ask,
    who: { phone: '+995500000001', name: 'ანა' },
    ask_owner: false,
  },
  {
    id: 's2',
    action: StepAction.Ask,
    who: { phone: '+995500000002', name: 'ბექა' },
    what: 'კლუბის კონტაქტი',
    ask_owner: false,
  },
  { id: 's3', action: StepAction.Web, ask_owner: true },
];
const PLAN = { solved_when: 'ორი სტუდენტი თანახმაა', steps: STEPS };
const DECLINED = {
  step_id: 's1',
  kind: StepEventKind.Declined,
  ref: '42',
  created_at: '2026-11-05T09:30:00Z',
};

describe('renderWhereWeAre', () => {
  it('says the result, the current step, the last event, the next step and the permissions', () => {
    expect(renderWhereWeAre({ plan: PLAN, currentStepId: 's2', events: [DECLINED] })).toBe(
      '\n\n## სად ვართ [გეგმის მსვლელობა — სერვერის ჩანაწერი]\n' +
        'შედეგი, როცა: ორი სტუდენტი თანახმაა\n' +
        'ახლანდელი ნაბიჯი: 2 — კითხვა — ბექა (კლუბის კონტაქტი).\n' +
        'შემდეგი ნაბიჯი (თანმიმდევრობით; უარზე/სიჩუმეზე — ნაბიჯის წესით): 3 — ვებ-ძიება.\n' +
        'ბოლო მოვლენა: ნაბიჯი 1 — უარი (2026-11-05 09:30 UTC).\n' +
        'მფლობელის კითხვის გარეშე აკეთებ: ნაბიჯები 1, 2 — მათი წესებიც (დასახელებულის გაცნობა ' +
        'ან კითხვა, შემდეგ ნაბიჯზე გადასვლა). მფლობელს მხოლოდ აცნობებ.\n' +
        'მფლობელის სიტყვა საჭიროა მხოლოდ: ნაბიჯი 3 — ჯერ ჰკითხე.\n',
    );
  });

  it('before any step: names the first, and says nothing happened yet', () => {
    const text = renderWhereWeAre({ plan: PLAN, currentStepId: null, events: [] });
    expect(text).toContain('ჯერ არცერთი არ დაწყებულა. პირველი: 1 — კითხვა — ანა.');
    expect(text).toContain('ბოლო მოვლენა: ჯერ არაფერი.');
  });

  it('at the last step and with result_when', () => {
    const text = renderWhereWeAre({
      plan: { ...PLAN, result_when: 'შეხვედრა შედგა' },
      currentStepId: 's3',
      events: [],
    });
    expect(text).toContain('შედეგი, როცა: შეხვედრა შედგა');
    expect(text).toContain('ეს გეგმის ბოლო ნაბიჯია');
  });

  it('reads an old plan as one step asking everyone in it', () => {
    const text = renderWhereWeAre({ plan: { solved_when: 'x' }, currentStepId: 's1', events: [] });
    expect(text).toContain('ახლანდელი ნაბიჯი: 1 — კითხვა — გეგმის ყველა ადამიანი.');
    expect(text).toContain('ნაბიჯები 1');
    expect(text).not.toContain('მფლობელის სიტყვა საჭიროა');
  });

  it('says so when the owner delegated', () => {
    const text = renderWhereWeAre({ plan: PLAN, currentStepId: 's1', events: [], delegated: true });
    expect(text).toContain('მფლობელმა გადაგაბარა');
  });
});

describe('whereWeAreSection', () => {
  const task = (approved: boolean): Task =>
    ({
      id: 7001,
      plan: PLAN,
      plan_version: 1,
      plan_approved_at: approved ? '2026-11-05T09:00:00Z' : null,
    }) as unknown as Task;

  beforeEach(() => {
    mockQuery.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('reads the step and the last event for an approved plan', async () => {
    mockQuery.mockImplementation(
      async (sql: string) =>
        (sql.includes('SELECT plan_step')
          ? { rows: [{ plan_step: 's2' }], rowCount: 1 }
          : { rows: [DECLINED], rowCount: 1 }) as never,
    );
    const text = await whereWeAreSection(task(true));
    expect(text).toContain('ახლანდელი ნაბიჯი: 2');
    expect(text).toContain('ნაბიჯი 1 — უარი');
  });

  it('is empty without an approved plan, and never holds the prompt up', async () => {
    await expect(whereWeAreSection(task(false))).resolves.toBe('');
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(whereWeAreSection(task(true))).resolves.toBe('');
  });
});

describe('its place in the prompt', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('comes right before the goal’s own section', () => {
    expect(chat).toContain(
      '(await whereWeAre) +\n      (boundTask ? buildTaskEngineSection(boundTask, boundAsks)',
    );
  });
});
