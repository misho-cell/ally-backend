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
import { query, withTransaction } from '../../db/postgres/client';
import {
  MAX_STEP_EVENTS_READ,
  StepEventKind,
  currentStepId,
  moveToStep,
  recentStepEvents,
  recordStepEvent,
  stepOfAsk,
} from '../planProgress.service';

/** Autonomy stage 2, K2: the plan's progress. Fictional goal ids only. */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
});

describe('the migration', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '296_plan_step_events.sql'),
    'utf8',
  );

  it('creates the events table with the six kinds and the current-step column', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS plan_step_events');
    for (const kind of Object.values(StepEventKind)) expect(sql).toContain(`'${kind}'`);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS plan_step TEXT');
    expect(sql).toContain('ON plan_step_events (task_id, created_at DESC)');
  });
});

describe('writing progress', () => {
  it('records an event with parameters only', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await recordStepEvent(7001, 's2', StepEventKind.Sent, '42');
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO plan_step_events');
    expect(params).toEqual([7001, 's2', 'sent', '42']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('moves the current step and records its start in one transaction', async () => {
    await moveToStep(7001, 's3');
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(mockClientQuery.mock.calls[0]).toEqual([
      'UPDATE tasks SET plan_step = $2 WHERE id = $1',
      [7001, 's3'],
    ]);
    expect(mockClientQuery.mock.calls[1][1]).toEqual([7001, 's3', 'started']);
  });

  it('lets a failed write reach the caller', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(recordStepEvent(7001, 's1', StepEventKind.Silent)).rejects.toThrow('db down');
  });
});

describe('reading progress', () => {
  it('reads the current step, null when none', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ plan_step: 's2' }]));
    await expect(currentStepId(7001)).resolves.toBe('s2');
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(currentStepId(7001)).resolves.toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 1');
  });

  it('reads the latest events, capped', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await recentStepEvents(7001, 500);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([7001, MAX_STEP_EVENTS_READ]);
  });

  it('finds the step an ask was sent for', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ step_id: 's1' }]));
    await expect(stepOfAsk(7001, 42)).resolves.toBe('s1');
    expect(mockQuery.mock.calls[0][1]).toEqual([7001, 'sent', '42']);
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(stepOfAsk(7001, 43)).resolves.toBeNull();
  });
});
