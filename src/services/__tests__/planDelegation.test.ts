jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { DELEGATED_FIELD_SCHEMA, recordDelegation } from '../planDelegation';

/** Autonomy stage 2, K5: an approval that hands the decisions over. Fictional ids. */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('recordDelegation', () => {
  it('stores the run’s reading when it is a delegation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await recordDelegation('501', 7001, true);
    expect(mockQuery.mock.calls[0][1]).toEqual([7001, '501', true]);
  });

  it('writes nothing for a plain yes or a value that is not true', async () => {
    await recordDelegation('501', 7001, false);
    await recordDelegation('501', 7001, 'yes');
    await recordDelegation('501', 7001, undefined);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('never undoes the approval on a database fault', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(recordDelegation('501', 7001, true)).resolves.toBeUndefined();
  });
});

describe('where it is wired', () => {
  const src = (file: string): string => readFileSync(join(__dirname, '..', file), 'utf8');

  it('the approve tool declares it, and its handler stores it after the approval', () => {
    const chat = src('chat.service.ts');
    expect(chat).toContain('delegated: DELEGATED_FIELD_SCHEMA,');
    const handler = chat.slice(chat.indexOf("case 'approve_task_plan': {"));
    expect(handler.indexOf('recordDelegation(')).toBeGreaterThan(
      handler.indexOf('if (!outcome.ok) return { approved: false'),
    );
    expect(DELEGATED_FIELD_SCHEMA.type).toBe('boolean');
  });

  it('every new approval starts as no delegation', () => {
    expect(src('taskPlans.service.ts')).toContain('plan_delegated = FALSE,');
    const migration = readFileSync(
      join(__dirname, '..', '..', 'db', 'postgres', 'migrations', '297_plan_delegated.sql'),
      'utf8',
    );
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS plan_delegated BOOLEAN NOT NULL DEFAULT FALSE',
    );
  });
});
