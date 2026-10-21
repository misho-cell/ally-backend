const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockExclusions = jest.fn();
jest.mock('../tools/contactExclusions', () => ({
  fetchExclusionsForPhones: (...a: unknown[]) => mockExclusions(...a),
}));

import {
  countryInNeed,
  findCompaniesForNeed,
  industriesForNeed,
  industryWords,
  needWords,
} from '../tools/findCompaniesForNeed';

const INDUSTRIES = [
  {
    industryId: 'logistics_transport',
    words: industryWords(
      'transport; logistics; freight; cargo',
      'ტრანსპორტი; ლოჯისტიკა',
      'Logistics & transport',
    ),
  },
  { industryId: 'insurance', words: industryWords('insurance; insurer', 'დაზღვევა', 'Insurance') },
];

beforeEach(() => {
  jest.resetAllMocks();
  mockExclusions.mockResolvedValue(new Map());
});

/** D847 (TECH_TASK_COMPANY_BASE §6): a need, not a company name, finds the companies. */
describe('a need finds companies, and the people tied to them', () => {
  it('reads the need as an industry and a place, in either language', () => {
    const words = needWords('I need transportation in Kazakhstan');
    expect(industriesForNeed(words, INDUSTRIES)).toEqual(['logistics_transport']);
    expect(countryInNeed(words, ['Georgia', 'Kazakhstan'])).toBe('kazakhstan');
    expect(industriesForNeed(needWords('ტრანსპორტით'), INDUSTRIES)).toEqual([
      'logistics_transport',
    ]);
    expect(industriesForNeed(needWords('a good dentist'), INDUSTRIES)).toEqual([]);
  });

  it('shows confirmed people with a phone id, public directors, and the way to the warm path', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            industry_id: 'logistics_transport',
            industry: 'Logistics',
            synonyms_en: 'transport; cargo',
            synonyms_ka: '',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ country: 'Kazakhstan' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 'C-KZ-001',
            name_en: 'TransCaspian Cargo',
            legal_name_ka: '',
            what_it_does: 'cargo logistics',
            industry_id: 'logistics_transport',
            country: 'Kazakhstan',
            city: 'Almaty',
            website: '',
            hits: 2,
            people: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_id: 'C-KZ-001',
            phone: '+77010000001',
            person_name: 'Rustam Akhmetov',
            role: 'Executive Director',
            tie: 'current',
            evidence: 'CELA public web',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { company_id: 'C-KZ-001', name_ka: '', name_latin: 'Rustam Akhmetov', role: 'director' },
        ],
      });

    const out = await findCompaniesForNeed('7', 'I need transportation in Kazakhstan');

    expect(out.industries).toEqual(['logistics_transport']);
    expect(out.companies[0]).toMatchObject({
      name: 'TransCaspian Cargo',
      place: 'Almaty, Kazakhstan',
      people: [{ name: 'Rustam Akhmetov', role: 'Executive Director', phone: '+77010000001' }],
      public_roles: ['Rustam Akhmetov — director'],
    });
    expect(out.note).toContain('find_warm_path');
    const [companiesSql, companiesParams] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(companiesParams[2]).toBe('kazakhstan');
    expect(companiesSql).toContain("l.status = 'confirmed'");
    const [peopleSql] = mockQuery.mock.calls[3] as [string];
    // TECH_TASK §4: a possible link is never said.
    expect(peopleSql).toContain("status = 'confirmed'");
  });

  it('with no company in the base, says so with an empty list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const out = await findCompaniesForNeed('7', 'a good dentist');
    expect(out.companies).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
