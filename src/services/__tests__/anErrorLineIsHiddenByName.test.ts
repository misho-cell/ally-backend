jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { hideErrorLine, showErrorLine } from '../errorLineVisibility.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/** §89 — thread 26302's „try again" line under a scheduled check, hidden by its id. */
describe('hiding one named assistant error line', () => {
  it('moves an assistant error row to hidden and reports it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never);
    expect(await hideErrorLine(26302, 'abc')).toEqual({
      id: 'abc',
      thread_id: 26302,
      was: 'error',
      now: 'hidden',
    });
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("role = 'assistant' AND kind = $3");
    expect(params).toEqual([26302, 'abc', 'error', 'hidden']);
    expect(timeout).toBeGreaterThan(0);
  });

  it('undoes it: hidden back to error', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'abc' }] } as never);
    expect(await showErrorLine(26302, 'abc')).toMatchObject({ was: 'hidden', now: 'error' });
    expect(mockQuery.mock.calls[0][1]).toEqual([26302, 'abc', 'hidden', 'error']);
  });

  it('answers null when the thread holds no such row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await hideErrorLine(1, 'nope')).toBeNull();
  });

  it('is a kind neither the chat nor the model’s history reads', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("kind IN ('message', 'event', 'pending')");
    expect(chat).not.toContain("'hidden'");
  });

  it('is reached through one admin route that validates and names its 404', () => {
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    const route = admin.slice(admin.indexOf("'/threads/:threadId/error-lines/:messageId'"));
    expect(route.slice(0, 1600)).toContain("body('hidden').isBoolean()");
    expect(route.slice(0, 1600)).toContain('no assistant error line with that id in that thread');
  });
});
