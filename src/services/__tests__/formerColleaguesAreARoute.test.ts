const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: async (cb: (c: { query: typeof mockClientQuery }) => Promise<unknown>) =>
    cb({ query: mockClientQuery }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadEmployment, removeEmployment } from '../basePeople/employment.service';
import {
  colleagueTies,
  EMPLOYMENT_BASIS,
  employerKey,
  employmentRows,
  isEmploymentSource,
  MAX_PEOPLE_PER_EMPLOYER,
} from '../basePeople/employmentPlan';

/**
 * #7758 (the founder's word via the tester; Misho's yes, 29 Oct, with his
 * limits): where people in the store worked, and when, from public pages; two
 * people whose years at one employer overlap are a route.
 */
const HEADER = 'person_key,employer,role,from_year,to_year,source_url\n';
const CSV =
  HEADER +
  'P-1,TBC Bank,Analyst,2012,2016,https://example.ge/p1\n' +
  'P-2,TBC  bank,Manager,2015,,https://example.ge/p2\n' +
  'P-3,Other LLC,CFO,2010,2011,https://example.ge/p3\n' +
  'P-4,TBC Bank,,2018,2019,https://example.ge/p4\n' +
  'P-5,TBC Bank,,,,https://example.ge/p5\n' +
  'P-6,Some Co,,2015,2016,\n' +
  'P-7,Some Co,,2016,2015,https://example.ge/p7\n';
const YEAR = 2026;

beforeEach(() => jest.resetAllMocks());

describe('an employment history', () => {
  it('needs a public source and sane years; the employer is compared without case or spaces', () => {
    const { rows, skipped } = employmentRows(CSV);
    expect(rows.map((r) => r.personKey)).toEqual(['P-1', 'P-2', 'P-3', 'P-4', 'P-5']);
    expect(skipped).toEqual({ no_source: 1, bad_years: 1 });
    expect(employerKey('TBC  bank')).toBe(employerKey('TBC Bank'));
  });

  // Misho, 30 Oct: the founder's word counts, dated; anything else without a page does not.
  it('takes the founder’s dated word as a source, and nothing vaguer', () => {
    expect(isEmploymentSource('founder, 2026-10-29')).toBe(true);
    expect(isEmploymentSource('Founder,2026-10-29')).toBe(true);
    expect(isEmploymentSource('founder')).toBe(false);
    expect(isEmploymentSource('a friend, 2026-10-29')).toBe(false);
    expect(isEmploymentSource('https://example.ge/p1')).toBe(true);
  });

  it('makes a tie only where the years overlap', () => {
    const ties = colleagueTies(employmentRows(CSV).rows, YEAR);
    expect(ties).toEqual([
      { fromKey: 'P-1', toKey: 'P-2', tie: 'former colleagues at TBC Bank, 2015–2016' },
      { fromKey: 'P-2', toKey: 'P-4', tie: 'former colleagues at TBC Bank, 2018–2019' },
    ]);
  });

  it('says „colleagues since" when both are still there', () => {
    const csv = HEADER + 'A,X Co,,2020,,https://a.ge\nB,X Co,,2022,,https://b.ge\n';
    expect(colleagueTies(employmentRows(csv).rows, YEAR)[0].tie).toBe(
      'colleagues at X Co, since 2022',
    );
  });

  it('makes none at an employer too big for overlap to mean acquaintance', () => {
    const many = Array.from(
      { length: MAX_PEOPLE_PER_EMPLOYER + 1 },
      (_, i) => `K-${i},Big Bank,,2015,2020,https://x.ge/${i}`,
    ).join('\n');
    expect(colleagueTies(employmentRows(HEADER + many).rows, YEAR)).toEqual([]);
  });
});

describe('loading it', () => {
  it('a dry run counts and writes nothing; people outside the store are left out', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ person_key: 'P-1' }, { person_key: 'P-2' }] })
      .mockResolvedValueOnce({ rows: [] });
    const report = await loadEmployment(CSV, true, YEAR);
    expect(report).toMatchObject({ dry_run: true, rows_written: 0, colleague_ties: 1 });
    expect(report.skipped).toMatchObject({ person_not_in_store: 3, no_source: 1 });
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it('replaces only the ties the history implied', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ person_key: 'P-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await loadEmployment(CSV, false, YEAR);
    expect(mockClientQuery.mock.calls[0]).toEqual([
      'DELETE FROM base_person_ties WHERE basis = $1',
      [EMPLOYMENT_BASIS],
    ]);
  });

  it('a person’s history is removed on request', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await removeEmployment('P-9', YEAR)).toBe(false);
    mockQuery.mockResolvedValueOnce({ rowCount: 2 }).mockResolvedValueOnce({ rows: [] });
    expect(await removeEmployment('P-1', YEAR)).toBe(true);
    expect(mockClientQuery).toHaveBeenCalled();
  });

  it('has admin routes to load and to remove', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.post('/base-people/employment'");
    expect(routes).toContain("adminRouter.delete('/base-people/:key/employment'");
  });
});
