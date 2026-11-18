const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: jest.fn(),
}));

import {
  ResearchStatus,
  factsByNumber,
  parseFacts,
} from '../companyBase/researchFactsByNumber.service';

const SOURCE = 'load-linkedin-50';
const ROW = {
  phone: '599 00 00 01',
  key: 'headline',
  value: 'Head of Sales at Colibri',
  source_url: 'https://www.linkedin.com/in/nino-beridze',
  status: 'confirmed',
};

beforeEach(() => jest.resetAllMocks());

/** Misho, 18 Nov: „LinkedIn-ის სია ვნახე, ბაზაში ჩაწერე". */
describe('a LinkedIn find sits on our number', () => {
  it('keeps work and study only, each with the page it was read on', () => {
    const { facts, skipped } = parseFacts([
      ROW,
      { ...ROW, key: 'family' },
      { ...ROW, key: 'education', source_url: 'linkedin, a snippet' },
      { ...ROW, value: ' ' },
      { ...ROW, status: 'rough' },
      { ...ROW, phone: '12' },
      { ...ROW },
      7,
    ]);
    expect(facts).toEqual([
      {
        phone: '+995599000001',
        key: 'headline',
        value: 'Head of Sales at Colibri',
        sourceUrl: 'https://www.linkedin.com/in/nino-beridze',
        status: ResearchStatus.Confirmed,
      },
    ]);
    expect(skipped).toEqual({
      key_not_allowed: 1,
      no_source_url: 1,
      no_value: 1,
      bad_status: 1,
      bad_phone: 1,
      duplicate: 1,
      not_an_object: 1,
    });
  });

  it('writes only on a number Netai holds: private, the system saver, under its tag', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ v: '+995599000001' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const report = await factsByNumber([ROW, { ...ROW, phone: '599000002' }], SOURCE, false);
    expect(report).toEqual({
      dry_run: false,
      rows_in_request: 2,
      rows_written: 1,
      skipped: { number_unknown: 1 },
    });
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('false');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).not.toContain('599000001');
    expect(params.slice(5)).toEqual(['0', 'public_research', SOURCE]);
  });

  it('counts a row the number already carries instead of writing it twice', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ v: '+995599000001' }] })
      .mockResolvedValueOnce({ rowCount: 0 });
    const report = await factsByNumber([ROW], SOURCE, false);
    expect(report.rows_written).toBe(0);
    expect(report.skipped).toEqual({ already_there: 1 });
  });

  it('writes nothing on a dry run, and reads nothing for an empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ v: '+995599000001' }] });
    expect((await factsByNumber([ROW], SOURCE, true)).rows_written).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    mockQuery.mockReset();
    expect((await factsByNumber([], SOURCE, false)).rows_written).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
