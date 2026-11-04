jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { questionsAnsweredLately } from '../taskAsks.service';

/**
 * #8812 (Lika, 4 Nov, P1): a minute after answering she remembered an
 * electrician; the addition was refused because the question was no longer
 * open and its asker could not be found by name.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

describe('an answer given in the last day', () => {
  it('can be found by its asker to take an addition', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ask_thread_id: 9, asker_name: 'Tornike' }],
    } as never);
    expect(await questionsAnsweredLately('7')).toEqual([{ askThreadId: 9, askerName: 'Tornike' }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain("ta.status = 'answered'");
    expect(String(sql)).toContain('make_interval(hours => $3)');
    expect(params).toEqual(['7', expect.any(Number), 24]);
  });

  it('is looked up only by name, after the open questions', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const fn = chat.slice(chat.indexOf('async function askThreadForCall'));
    const open = fn.indexOf('openQuestionsToMe(userId)');
    const lately = fn.indexOf('questionsAnsweredLately(userId)');
    expect(open).toBeGreaterThan(-1);
    expect(lately).toBeGreaterThan(open);
    expect(fn.slice(0, lately)).toContain("name.trim() === ''");
  });
});
