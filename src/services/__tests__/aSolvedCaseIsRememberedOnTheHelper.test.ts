import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { answerHelped, recordSolvedCases } from '../solvedCases.service';
import { laterChoice } from '../askOpening';
import { buildExactMatchSql } from '../tools/wordMatch';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * 5446, founder ruling D792 (16 Oct): a goal solved with a helper's answer is
 * remembered on the helper, silently, and search finds and ranks the helper by
 * it without the model ever being told why.
 */
describe('which answer helped', () => {
  it('counts a real answer and a yes', () => {
    expect(answerHelped('ჰკითხე ჩემს კოლეგას ბანკში, ის მოგიგვარებს')).toBe(true);
    expect(answerHelped('კი, ვიცნობ')).toBe(true);
  });

  it('does not count no, later or nothing', () => {
    expect(answerHelped('არა, არ ვიცნობ')).toBe(false);
    expect(answerHelped(laterChoice('ka'))).toBe(false);
    expect(answerHelped('')).toBe(false);
    expect(answerHelped(null)).toBe(false);
  });
});

describe('recording a solved goal', () => {
  beforeEach(() => mockQuery.mockReset());

  it('writes each helper who answered, with the goal’s own words, once per goal', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { to_user_id: 11, from_user_id: 7, answer: 'ტიკოს ჰკითხე', case_text: 'TBC loan' },
          { to_user_id: 12, from_user_id: 7, answer: 'არა, არ ვიცნობ', case_text: 'TBC loan' },
        ],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never);

    expect(await recordSolvedCases(42)).toBe(1);
    const [readSql, readParams] = mockQuery.mock.calls[0];
    expect(readSql).toContain("ta.status = 'answered'");
    expect(readSql).toContain('ta.declined_at IS NULL');
    expect(readParams).toEqual([42]);
    const [writeSql, writeParams, timeout] = mockQuery.mock.calls[1];
    expect(writeSql).toContain('INSERT INTO helper_solved_cases');
    expect(writeSql).toContain('ON CONFLICT (helper_user_id, task_id) DO NOTHING');
    expect(writeParams).toEqual([42, [11], [7], ['TBC loan']]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('writes nothing when nobody helped', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await recordSolvedCases(42)).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('when it is recorded', () => {
  const store = readFileSync(join(__dirname, '..', 'taskStore.service.ts'), 'utf8');

  it('follows a close as finished, and only that close', () => {
    const at = store.indexOf("if (updated && status === 'closed' && closedAs === 'finished') {");
    expect(at).toBeGreaterThan(-1);
    expect(store.slice(at, at + 900)).toContain('recordSolvedCases(taskId)');
  });
});

describe('how search reads it', () => {
  it('finds the helper by the goal’s words among the asker’s own contacts, silently', () => {
    const sql = buildExactMatchSql('501', [['თიბისი']], [], true).matchedCte;
    expect(sql).toContain('JOIN helper_solved_cases hs ON hs.helper_user_id = up5."userId"');
    expect(sql).toContain('WHERE up5.phone IN (SELECT phone FROM mine)');
    const branch = sql.slice(sql.indexOf('SELECT up5.phone'), sql.indexOf('helper_solved_cases'));
    expect(branch).toContain('2 AS priority');
    expect(branch).toContain('TRUE AS self_work');
  });

  it('is not read by a search that cannot carry the no-reason note', () => {
    expect(buildExactMatchSql('501', [['თიბისი']], []).matchedCte).not.toContain(
      'helper_solved_cases',
    );
  });
});
