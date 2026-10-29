const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockNumbers = jest.fn();
jest.mock('../axelLoad/axelBaseLoad.service', () => ({
  numbersByHash: (...a: unknown[]) => mockNumbers(...a),
}));
const mockRoster = jest.fn();
const mockPhonebooks = jest.fn();
jest.mock('../axelExport/axelData', () => ({
  readRoster: (...a: unknown[]) => mockRoster(...a),
  readPhonebooks: (...a: unknown[]) => mockPhonebooks(...a),
}));

import { CompanyBasePart, loadCompanyBasePart } from '../companyBase/companyBaseLoad.service';
import { linkRows, publicPeopleRows, searchTextOf } from '../companyBase/companyBasePlan';
import { labelNameKeys } from '../companyBase/phonebookNames';

const HASH = 'a'.repeat(24);
const LINKS =
  'person_key,person_name,company_id,company,role,tie,evidence,status,savers,source,detail\n' +
  `P-1,Rustam,C-KZ-001,TransCaspian,Executive Director,current,CELA public web,confirmed,0,web,\n` +
  `${HASH},Nino,204854595,TBC,,saved with company name,phone label,possible,1,label,\n` +
  `P-9,Nobody,204854595,TBC,,current,fact,confirmed,0,web,\n` +
  `P-2,Bad,204854595,TBC,,current,fact,maybe,0,web,\n` +
  `P-7,Giorgi Gamogonili,204854595,TBC,Director,current,fact,confirmed,0,web,\n`;
const NUMBERS = `person_key,number_hash,tie\nP-1,${'b'.repeat(24)},strong\nP-9,${'c'.repeat(24)},weak\n`;

beforeEach(() => {
  jest.resetAllMocks();
  mockPhonebooks.mockResolvedValue([]);
});

/** D847 (TECH_TASK_COMPANY_BASE §3): the package's company files become the base. */
describe('the company base loads from the package', () => {
  it('ties a link to a number by its own token or the person’s loadable token; a weak tie is no number', () => {
    const { rows, weaklyTied } = linkRows(LINKS, NUMBERS);
    expect(rows.map((r) => r.hashes)).toEqual([['b'.repeat(24)], [HASH], []]);
    expect(weaklyTied).toBe(1);
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
    mockRoster.mockResolvedValue([]);
    const report = await loadCompanyBasePart(CompanyBasePart.Links, LINKS, true, NUMBERS);
    expect(report).toMatchObject({ rows_in_file: 4, rows_written: 1 });
    expect(report.skipped).toEqual({ person_weakly_tied: 1, number_not_found: 2 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  /** #7525: a package hashed under a retired secret resolves no token; a unique name places it. */
  it('places a link whose hash no longer resolves by a name only one roster member carries', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ company_id: 'C-KZ-001' }, { company_id: '204854595' }],
    });
    mockNumbers.mockResolvedValue(new Map());
    mockRoster.mockResolvedValue([
      { phone: '+995500000101', name: 'Nino', match_names: [] },
      { phone: '+995500000102', name: 'Rustam', match_names: [] },
      { phone: '+995500000103', name: 'Rustam', match_names: [] },
    ]);
    const report = await loadCompanyBasePart(CompanyBasePart.Links, LINKS, true, NUMBERS);
    expect(report).toMatchObject({ rows_written: 1 });
    expect(report.skipped).toEqual({
      person_weakly_tied: 1,
      placed_by_member_name: 1,
      number_not_found: 2,
    });
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

/** #7525 (Misho, 29 Oct): the old key is gone, so the list is made again from the members' phonebooks. */
describe('the new list: a person found by the name members saved them under', () => {
  const companies = { rows: [{ company_id: 'C-KZ-001' }, { company_id: '204854595' }] };

  it('reads a label’s name from its edges, in either order, and not from inside it', () => {
    expect(labelNameKeys('Giorgi Gamogonili TBC')).toContain('giorgi gamogonili');
    expect(labelNameKeys('TBC Giorgi Gamogonili')).toContain('giorgi gamogonili');
    expect(labelNameKeys('Gamogonili Giorgi')).toContain('giorgi gamogonili');
    expect(labelNameKeys('Nino Giorgi Gamogonili Jr')).not.toContain('giorgi gamogonili');
  });

  it('places a link on the one number whose label carries the full name', async () => {
    mockQuery.mockResolvedValue(companies);
    mockNumbers.mockResolvedValue(new Map());
    mockRoster.mockResolvedValue([
      { user_id: 1, phone: '+995500000101', name: 'Nino', match_names: [] },
    ]);
    mockPhonebooks.mockResolvedValue([
      { owner_id: 1, contact_digits: '995500000201', label: 'Giorgi Gamogonili TBC' },
      { owner_id: 1, contact_digits: '995500000201', label: 'გიორგი გამოგონილი' },
    ]);
    const report = await loadCompanyBasePart(CompanyBasePart.Links, LINKS, true, NUMBERS);
    expect(report.skipped).toMatchObject({ placed_by_member_name: 1, placed_by_phonebook_name: 1 });
  });

  it('places nobody when two numbers carry the name', async () => {
    mockQuery.mockResolvedValue(companies);
    mockNumbers.mockResolvedValue(new Map());
    mockRoster.mockResolvedValue([
      { user_id: 1, phone: '+995500000101', name: 'X', match_names: [] },
    ]);
    mockPhonebooks.mockResolvedValue([
      { owner_id: 1, contact_digits: '995500000201', label: 'Giorgi Gamogonili' },
      { owner_id: 1, contact_digits: '995500000202', label: 'Giorgi Gamogonili Bank' },
    ]);
    const report = await loadCompanyBasePart(CompanyBasePart.Links, LINKS, true, NUMBERS);
    expect(report.skipped.placed_by_phonebook_name).toBeUndefined();
  });

  it('places nobody when two people in the file share the name', async () => {
    mockQuery.mockResolvedValue(companies);
    mockNumbers.mockResolvedValue(new Map());
    mockRoster.mockResolvedValue([
      { user_id: 1, phone: '+995500000101', name: 'X', match_names: [] },
    ]);
    mockPhonebooks.mockResolvedValue([
      { owner_id: 1, contact_digits: '995500000201', label: 'Giorgi Gamogonili' },
    ]);
    const twoPeople =
      LINKS + `P-8,Giorgi Gamogonili,C-KZ-001,TransCaspian,,current,fact,confirmed,0,web,\n`;
    const report = await loadCompanyBasePart(CompanyBasePart.Links, twoPeople, true, NUMBERS);
    expect(report.skipped.placed_by_phonebook_name).toBeUndefined();
  });
});
