const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: mockQuery,
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { keepUserMessage } from '../chat.service';

const THREAD_ID = 50825;
const ROW_ID = 9001;

function sqlOf(call: readonly unknown[]): string {
  return String(call[0]);
}

function writesTheRow(sql: string): boolean {
  return sql.includes('INSERT INTO conversations');
}

function touchesTheThread(sql: string): boolean {
  return sql.includes('UPDATE threads SET updated_at = NOW()');
}

/**
 * 3106 (speed). Every saved row also marks its thread as touched, and that was
 * a second statement right after the INSERT: ~145 ms more per row, and an
 * answer with one tool turn saves four rows. The two now travel together.
 */
describe('a saved row touches its thread in the same round trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: ROW_ID }], rowCount: 1 });
  });

  it('writes the row and touches the thread in one statement', async () => {
    await expect(keepUserMessage('501', THREAD_ID, 'რა ამინდია?')).resolves.toBe(true);
    const writes = mockQuery.mock.calls.map(sqlOf).filter(writesTheRow);
    expect(writes).toHaveLength(1);
    expect(touchesTheThread(writes[0])).toBe(true);
  });

  it('sends no separate statement to touch the thread', async () => {
    await keepUserMessage('501', THREAD_ID, 'რა ამინდია?');
    const touchesAlone = mockQuery.mock.calls
      .map(sqlOf)
      .filter((sql) => touchesTheThread(sql) && !writesTheRow(sql));
    expect(touchesAlone).toHaveLength(0);
  });

  it('touches the thread the row was written to', async () => {
    await keepUserMessage('501', THREAD_ID, 'რა ამინდია?');
    const call = mockQuery.mock.calls.find((c) => writesTheRow(sqlOf(c)));
    expect(call).toBeDefined();
    const sql = sqlOf(call as unknown[]);
    const params = (call as [string, unknown[]])[1];
    expect(sql).toContain('WHERE id = $2');
    expect(params[1]).toBe(THREAD_ID);
  });

  it('still reports a failed write as false', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(keepUserMessage('501', THREAD_ID, 'რა ამინდია?')).resolves.toBe(false);
  });
});
