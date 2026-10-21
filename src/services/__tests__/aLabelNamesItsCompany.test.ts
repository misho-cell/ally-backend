const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
const mockRoster = jest.fn();
const mockPhonebooks = jest.fn();
jest.mock('../axelExport/axelData', () => ({
  readRoster: (...a: unknown[]) => mockRoster(...a),
  readPhonebooks: (...a: unknown[]) => mockPhonebooks(...a),
}));

import {
  buildNameIndex,
  companiesInLabel,
  labelLinkStatus,
  normaliseLabel,
} from '../companyBase/labelCompanyMatch';
import {
  LABEL_EVIDENCE,
  MATCH_AFTER_IMPORT_MS,
  matchMemberLabels,
  scheduleLabelMatchAfterImport,
} from '../companyBase/labelMatch.service';

const TBC = '204854595';
const BOG = '204378869';
const MARGI = '404539825';
const TEGETA = '206239729';
const NAMES = [
  { companyId: TBC, nameNormalised: 'tbc', strength: 'strong' },
  { companyId: TBC, nameNormalised: 'tibisi', strength: 'strong' },
  { companyId: BOG, nameNormalised: 'bog', strength: 'strong' },
  { companyId: BOG, nameNormalised: 'solo', strength: 'strong' },
  { companyId: MARGI, nameNormalised: 'margi', strength: 'weak' },
  { companyId: '202886127', nameNormalised: 'nino', strength: 'weak' },
  { companyId: TEGETA, nameNormalised: 'tegeta', strength: 'strong' },
  { companyId: '406501977', nameNormalised: 'ksb', strength: 'strong' },
  { companyId: 'C-GE-528', nameNormalised: 'ksb', strength: 'strong' },
];
const INDEX = buildNameIndex(NAMES);

beforeEach(() => jest.resetAllMocks());

/** D847 (TECH_TASK_COMPANY_BASE §4, acceptance tests 3, 5 and 8). */
describe('a phonebook label names its company', () => {
  it('in either script, with a Georgian case ending, by brand (test 3, test 8)', () => {
    expect(normaliseLabel('ნინო თიბისი')).toBe('nino tibisi');
    expect(companiesInLabel('Nino TBC', INDEX)).toEqual([TBC]);
    expect(companiesInLabel('ნინო თიბისი', INDEX)).toEqual([TBC]);
    expect(companiesInLabel('Solo bankiri', INDEX)).toEqual([BOG]);
    expect(companiesInLabel('Tegetadan Giorgi', INDEX)).toEqual([TEGETA]);
  });

  it('a weak name only beside an organisation word, never a first name (test 5)', () => {
    expect(companiesInLabel('Nino Margi', INDEX)).toEqual([]);
    expect(companiesInLabel('Nino Margi LLC manager', INDEX)).toEqual([MARGI]);
  });

  it('a name two companies share names neither', () => {
    expect(companiesInLabel('KSB', INDEX)).toEqual([]);
  });

  it('two different savers confirm, one is possible (test 4)', () => {
    expect(labelLinkStatus(3)).toBe('confirmed');
    expect(labelLinkStatus(1)).toBe('possible');
  });

  it('counts each member once per number and company, and replaces the last run', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: NAMES.map((n) => ({
        company_id: n.companyId,
        name_normalised: n.nameNormalised,
        strength: n.strength,
      })),
    });
    mockRoster.mockResolvedValue([{ user_id: 1 }, { user_id: 2 }, { user_id: null }]);
    mockPhonebooks.mockResolvedValue([
      { owner_id: 1, contact_digits: '995599000001', label: 'Nino TBC' },
      { owner_id: 2, contact_digits: '995599000001', label: 'ნინო თიბისი' },
      { owner_id: 2, contact_digits: '995599000001', label: 'Nino Tbc Business' },
      { owner_id: 1, contact_digits: '995599000002', label: 'Nino Margi' },
    ]);
    mockQuery.mockResolvedValue({ rows: [] });
    const report = await matchMemberLabels(false);
    expect(mockPhonebooks).toHaveBeenCalledWith([1, 2]);
    expect(report).toMatchObject({ labels_read: 4, links: 1, confirmed: 1, possible: 0 });
    const [del, delParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(del).toContain('DELETE FROM person_company_links');
    expect(delParams).toEqual([LABEL_EVIDENCE]);
    const [, params] = mockQuery.mock.calls[2] as [string, unknown[]];
    expect(params[1]).toEqual([TBC]);
    expect(params[2]).toEqual([2]);
    expect(params[5]).toEqual(['confirmed']);
  });

  it('with no names loaded, replaces nothing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockRoster.mockResolvedValue([{ user_id: 1 }]);
    const report = await matchMemberLabels(false);
    expect(report.links).toBe(0);
    expect(mockPhonebooks).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('runs once after a burst of imports (trigger 1)', async () => {
    jest.useFakeTimers();
    mockQuery.mockResolvedValue({ rows: [] });
    mockRoster.mockResolvedValue([]);
    scheduleLabelMatchAfterImport();
    scheduleLabelMatchAfterImport();
    expect(mockQuery).not.toHaveBeenCalled();
    jest.advanceTimersByTime(MATCH_AFTER_IMPORT_MS);
    await Promise.resolve();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
