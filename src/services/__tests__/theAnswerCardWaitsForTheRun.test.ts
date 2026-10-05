jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { conversationIsBusy } from '../taskEngine.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * The tester's 1159 (38975): an automatic answer's card went on screen seven
 * seconds before the asker's own run wrote „I asked…". The card waits while
 * the goal's conversation is still answering; the retry shows it after.
 */
describe('the answer card', () => {
  beforeEach(() => jest.clearAllMocks());

  it('waits while the goal’s conversation is working', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'working' }] } as never);
    await expect(conversationIsBusy(17458, 38975)).resolves.toBe(true);
  });

  it('goes when the conversation is idle, or has no thread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'idle' }] } as never);
    await expect(conversationIsBusy(17458, 38975)).resolves.toBe(false);
    await expect(conversationIsBusy(17458, null)).resolves.toBe(false);
  });

  it('is checked before any card is shown or run woken', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const body = engine.slice(engine.indexOf('async function deliverOwedAnswers('));
    expect(body.indexOf('conversationIsBusy(taskId')).toBeGreaterThan(0);
    expect(body.indexOf('conversationIsBusy(taskId')).toBeLessThan(
      body.indexOf('answersAreOnScreen(owed'),
    );
  });
});
