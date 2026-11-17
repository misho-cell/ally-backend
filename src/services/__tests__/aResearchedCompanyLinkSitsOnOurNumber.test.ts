const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
  withTransaction: async (work: (c: { query: jest.Mock }) => Promise<unknown>) =>
    work({ query: mockClientQuery }),
}));

import {
  LinkStatus,
  isLoadSource,
  linkByNumber,
  parseLinks,
  undoLoad,
} from '../companyBase/companyLoadByNumber.service';

const SOURCE = 'load-axel-wave1';
const ROW = {
  phone: '599 00 00 01',
  company_id: 'W-GE-001',
  person_name: 'Nino Beridze',
  role: 'founder',
  evidence: 'fact: founder of Colibri',
  status: 'confirmed',
};

beforeEach(() => jest.resetAllMocks());

/** Misho, 17 Nov: the companies tied to our people are written, and can be taken back out. */
describe('a researched company link sits on our number', () => {
  it('accepts only a load tag, never a real source like a label', () => {
    expect(isLoadSource(SOURCE)).toBe(true);
    expect(isLoadSource('label')).toBe(false);
    expect(isLoadSource('load-x; DROP')).toBe(false);
  });

  it('normalises the number and counts every row it leaves out, with its reason', () => {
    const { links, skipped } = parseLinks([
      ROW,
      { ...ROW, status: 'maybe' },
      { ...ROW, phone: '12' },
      { ...ROW, company_id: '' },
      'nonsense',
    ]);
    expect(links).toEqual([
      {
        phone: '+995599000001',
        companyId: 'W-GE-001',
        personName: 'Nino Beridze',
        role: 'founder',
        evidence: 'fact: founder of Colibri',
        status: LinkStatus.Confirmed,
      },
    ]);
    expect(skipped).toEqual({ bad_status: 1, bad_phone: 1, no_company_id: 1, not_an_object: 1 });
  });

  it('writes only a known company on a number Netai holds, under its tag, as parameters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ v: 'W-GE-001' }] })
      .mockResolvedValueOnce({ rows: [{ v: '+995599000001' }] })
      .mockResolvedValueOnce({ rows: [] });
    const report = await linkByNumber(
      [ROW, { ...ROW, company_id: 'W-GE-404' }, { ...ROW, phone: '599000002' }],
      SOURCE,
      false,
    );
    expect(report).toEqual({
      dry_run: false,
      rows_in_request: 3,
      rows_written: 1,
      skipped: { company_not_loaded: 1, number_unknown: 1 },
    });
    const [sql, params] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(sql).not.toContain('599000001');
    expect(params[6]).toBe(SOURCE);
  });

  it('writes nothing on a dry run', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ v: 'W-GE-001' }] })
      .mockResolvedValueOnce({ rows: [{ v: '+995599000001' }] });
    const report = await linkByNumber([ROW], SOURCE, true);
    expect(report.rows_written).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('undoes a load in one transaction, and never deletes a package company', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ n: 2 }] });
    const report = await undoLoad(SOURCE, false);
    expect(report).toEqual({
      dry_run: false,
      source: SOURCE,
      links: 2,
      public_people: 2,
      names: 2,
      companies: 2,
    });
    const sqls = mockClientQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.every((s) => s.includes('DELETE'))).toBe(true);
    expect(sqls[3]).toContain("company_id LIKE 'W-%'");
    expect(mockClientQuery.mock.calls.every((c) => (c[1] as string[])[0] === SOURCE)).toBe(true);
  });

  it('only counts on a dry undo', async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ n: 0 }] });
    await undoLoad(SOURCE, true);
    expect(mockClientQuery.mock.calls.some((c) => (c[0] as string).includes('DELETE'))).toBe(false);
  });
});
