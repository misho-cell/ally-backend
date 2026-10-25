const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockNumbers = jest.fn();
jest.mock('../axelLoad/axelBaseLoad.service', () => ({
  numbersByHash: (...a: unknown[]) => mockNumbers(...a),
}));

import { CompanyBasePart, loadCompanyBasePart } from '../companyBase/companyBaseLoad.service';
import { linkRows, publicPeopleRows, searchTextOf } from '../companyBase/companyBasePlan';

const HASH = 'a'.repeat(24);
const LINKS =
  'person_key,person_name,company_id,company,role,tie,evidence,status,savers,source,detail\n' +
  `P-1,Rustam,C-KZ-001,TransCaspian,Executive Director,current,CELA public web,confirmed,0,web,\n` +
  `${HASH},Nino,204854595,TBC,,saved with company name,phone label,possible,1,label,\n` +
  `P-9,Nobody,204854595,TBC,,current,fact,confirmed,0,web,\n` +
  `P-2,Bad,204854595,TBC,,current,fact,maybe,0,web,\n`;
const NUMBERS = `person_key,number_hash,tie\nP-1,${'b'.repeat(24)},strong\nP-9,${'c'.repeat(24)},weak\n`;

beforeEach(() => jest.resetAllMocks());

/** D847 (TECH_TASK_COMPANY_BASE §3): the package's company files become the base. */
describe('the company base loads from the package', () => {
  it('ties a link to a number by its own token or the person’s loadable token; a weak tie is no number', () => {
    const { rows, withoutNumber } = linkRows(LINKS, NUMBERS);
    expect(rows.map((r) => r.hashes)).toEqual([['b'.repeat(24)], [HASH]]);
    expect(withoutNumber).toBe(1);
  });

  it('keeps only public roles, and a description everyone can search', () => {
    const sheet =
      'company_id,company,person_name_georgian,person_name_latin,role,ownership_pct,owner_is_a_company,current_or_former,netai_person_code\n' +
      '1,X,ა ბ,A B,director,,,current,\n1,X,გ დ,G D,,,,,P-5\n';
    expect(publicPeopleRows(sheet)).toHaveLength(1);
    expect(
      searchTextOf({ name_en: 'TBC Bank', what_it_does: 'Retail BANKING', service_words: 'ბანკი' }),
    ).toBe('tbc bank · retail banking · ბანკი');
  });

  it('places links on the numbers the server finds, and writes nothing on a dry run', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ company_id: 'C-KZ-001' }, { company_id: '204854595' }],
    });
    mockNumbers.mockResolvedValue(new Map([['b'.repeat(24), '+77010000001']]));
    const report = await loadCompanyBasePart(CompanyBasePart.Links, LINKS, true, NUMBERS);
    expect(report).toMatchObject({ rows_in_file: 3, rows_written: 1 });
    expect(report.skipped).toEqual({ person_without_number: 1, number_not_found: 1 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('upserts by the file’s own key, so a reload doubles nothing', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const csv =
      'industry_id,industry,synonyms_en,synonyms_ka\ninsurance,Insurance,insurer,დაზღვევა\n';
    const report = await loadCompanyBasePart(CompanyBasePart.Industries, csv, false);
    expect(report.rows_written).toBe(1);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('ON CONFLICT (industry_id) DO UPDATE');
  });
});
