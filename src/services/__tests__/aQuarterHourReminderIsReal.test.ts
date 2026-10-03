jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { setTaskWake } from '../taskStore.service';

/**
 * Board #502 (Ninia): „remind me of this goal in 15 minutes" was told the
 * shortest reminder is an hour. The wake ticker runs every 20 seconds, so the
 * floor was only the tool's own words and its clamp. Both now allow 0.25 h.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('a goal can wake in a quarter of an hour', () => {
  it('tells the model 15 minutes is allowed', () => {
    const tool = chat.slice(chat.indexOf("name: 'set_task_wake'"));
    expect(tool.slice(0, 900)).toContain('0.25–168');
    expect(tool.slice(0, 900)).not.toContain('1–168');
  });

  it('clamps to a quarter hour and a week, not to an hour', () => {
    expect(chat).toContain('const MIN_WAKE_HOURS = 0.25;');
    expect(chat).toContain('const MAX_WAKE_HOURS = 168;');
    const handler = chat.slice(chat.indexOf("case 'set_task_wake': {"));
    expect(handler.slice(0, 600)).toContain('Math.max(MIN_WAKE_HOURS');
  });

  it('stores a fractional hour as a real interval', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    expect(await setTaskWake('174300', 14340, 0.25)).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("NOW() + ($3 || ' hours')::interval");
    expect(params[2]).toBe(0.25);
  });
});
