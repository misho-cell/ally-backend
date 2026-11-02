const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { keepPastedList, pastedTable } from '../pastedList.service';

beforeEach(() => jest.resetAllMocks());

const COMPANIES = Array.from({ length: 30 }, (_, i) => `Company ${i + 1},თბილისი`);
const CASE_128 = ['აი ჩემი სია, 30 კომპანია (CSV):', 'კომპანია,ქალაქი', ...COMPANIES].join('\n');

/**
 * #8522 (the tester's 80752 item 8, case 128): 30 companies pasted as CSV text
 * were searched one by one and the run's search budget refused most of them.
 */
describe('a pasted list', () => {
  it('is the table under the line that introduces it, header first', () => {
    const table = pastedTable(CASE_128);
    expect(table?.split('\n')[0]).toBe('კომპანია,ქალაქი');
    expect(table?.split('\n')).toHaveLength(31);
  });

  it('is not a short list or ordinary text with commas', () => {
    expect(pastedTable(['a,b', 'c,d', 'e,f'].join('\n'))).toBeNull();
    expect(pastedTable('მჭირდება იურისტი, კარგი, სანდო, თბილისში')).toBeNull();
  });

  it('is kept as the conversation’s file, with the same event an upload gets', async () => {
    mockQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('INSERT INTO thread_files')
          ? { rows: [{ id: 501, created_at: '2026-11-02T00:00:00Z' }] }
          : { rows: [{ id: 9, created_at: '2026-11-02T00:00:00Z' }] },
      ),
    );
    expect(await keepPastedList(7, 42, CASE_128)).toBe(501);
    const event = mockQuery.mock.calls
      .map((call) => (call as [string, unknown[]])[1])
      .find((params) => params.some((p) => typeof p === 'string' && p.includes('file_id 501')));
    expect(event).toBeDefined();
    expect(String(event?.find((p) => typeof p === 'string' && p.includes('file_id')))).toContain(
      'work_the_list',
    );
  });

  it('keeps nothing when the message holds no list', async () => {
    expect(await keepPastedList(7, 42, 'გამარჯობა')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is kept before the run reads its history', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const kept = chat.indexOf('await keepPastedList(threadId, Number(userId), userMessage)');
    expect(kept).toBeGreaterThan(-1);
    expect(kept).toBeLessThan(
      chat.indexOf('const [agentPrompt, tools, history] = await Promise.all(['),
    );
  });
});
