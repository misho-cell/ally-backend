jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { dayOneVerdict, DayOneVerdict } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const row = (people: number, sent: number): void => {
  mockQuery.mockResolvedValueOnce({ rows: [{ people, sent }], rowCount: 1 } as never);
};

/**
 * The tester's L4 round (33740, goal 15320): the approving run asked the
 * plan's one person, and day one then wrote „I asked Ilia" a second time.
 */
describe('day one after the approving run already started the plan', () => {
  beforeEach(() => mockQuery.mockReset());

  it('stands down when everyone in a short plan was already asked', async () => {
    row(1, 1);
    await expect(dayOneVerdict(15320)).resolves.toBe(DayOneVerdict.AlreadyDone);
  });

  it('stands down when its first three were already asked', async () => {
    row(6, 3);
    await expect(dayOneVerdict(1)).resolves.toBe(DayOneVerdict.AlreadyDone);
  });

  it('runs when people are left for it to write to', async () => {
    row(5, 1);
    await expect(dayOneVerdict(1)).resolves.toBe(DayOneVerdict.Start);
  });

  /** The tester's 1133 (A3.1, 36526): day one twice, with nobody to write to. */
  it('stands down when the plan names nobody', async () => {
    row(0, 0);
    await expect(dayOneVerdict(1)).resolves.toBe(DayOneVerdict.NobodyToWriteTo);
  });

  it('runs when the goal is not approved yet', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await expect(dayOneVerdict(1)).resolves.toBe(DayOneVerdict.Start);
  });

  it('counts asks and introductions from just before the approval, with a timeout', async () => {
    row(1, 0);
    await dayOneVerdict(7);
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('FROM task_asks a');
    expect(String(sql)).toContain('FROM introduction_requests r');
    expect(params?.[0]).toBe(7);
    expect(typeof timeout).toBe('number');
  });

  it('is asked inside day one before it wakes the goal', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const start = engine.slice(engine.indexOf('export function startDayOne('));
    expect(start.slice(0, 4000)).toContain(
      'const verdict = await dayOneVerdict(taskId).catch(() => DayOneVerdict.Start);',
    );
  });
});
