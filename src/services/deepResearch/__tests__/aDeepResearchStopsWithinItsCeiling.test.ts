const mockRunSearches = jest.fn();
const mockReadFullPages = jest.fn();
const mockReadPages = jest.fn();
const mockSpentOnRun = jest.fn();
const mockSpentToday = jest.fn();
const mockSaveRun = jest.fn();
const mockFactsByNumber = jest.fn();

jest.mock('../researchCalls', () => ({
  PAGE_PRICE_KEY: 'firecrawl.scrape',
  runSearches: (...a: unknown[]) => mockRunSearches(...a),
  readFullPages: (...a: unknown[]) => mockReadFullPages(...a),
}));
jest.mock('../researchReader', () => ({ readPages: (...a: unknown[]) => mockReadPages(...a) }));
jest.mock('../researchSpend', () => ({
  READ_RESERVE_USD: 0.1,
  dailyLimitUsd: () => 25,
  priceOf: async (keys: readonly string[]) => keys.length * 0.01,
  spentOnRun: (...a: unknown[]) => mockSpentOnRun(...a),
  spentToday: (...a: unknown[]) => mockSpentToday(...a),
}));
jest.mock('../researchRunRecord', () => ({ saveRun: (...a: unknown[]) => mockSaveRun(...a) }));
jest.mock('../../companyBase/researchFactsByNumber.service', () => ({
  factsByNumber: (...a: unknown[]) => mockFactsByNumber(...a),
}));
jest.mock('../researchSubject', () => ({ researchSubject: jest.fn(), SubjectRefusal: {} }));

import { ProviderName, ResearchStep, StopReason, SubjectKind } from '../deepResearch.types';
import { researchPerson } from '../deepResearch.service';

const SUBJECT = {
  phone: '+995599000001',
  kind: SubjectKind.Member,
  names: ['Nino Beridze'],
  companies: ['Colibri'],
  role: '',
  city: '',
};
const OPTIONS = { load: 'load-deep-test', dryRun: false, maxUsd: 0.5 };
const TEAM_PAGE = {
  url: 'https://colibri.ge/team',
  title: 'Team',
  text: 'Nino',
  provider: ProviderName.Exa,
};
const FACT = { key: 'employer', value: 'Colibri', source_url: TEAM_PAGE.url, status: 'confirmed' };

beforeEach(() => {
  jest.resetAllMocks();
  mockRunSearches.mockResolvedValue([TEAM_PAGE]);
  mockReadFullPages.mockResolvedValue([]);
  mockSpentOnRun.mockResolvedValue(0);
  mockSpentToday.mockResolvedValue(0);
  mockFactsByNumber.mockResolvedValue({ rows_written: 1 });
  mockReadPages
    .mockResolvedValueOnce({ verdicts: [{ url: TEAM_PAGE.url, samePerson: 'yes' }], facts: [FACT] })
    .mockResolvedValue({ verdicts: [], facts: [] });
});

/** Misho, 19 Nov: a ceiling per person and a day, and a stop when nothing new comes. */
describe('a deep research stops within its ceiling', () => {
  it('stops after two steps in a row that add no fact, and writes what it found under its tag', async () => {
    const report = await researchPerson(SUBJECT, OPTIONS);
    expect(report.steps_run).toEqual([ResearchStep.Find, ResearchStep.Read, ResearchStep.Widen]);
    expect(report.stopped).toBe(StopReason.NothingNew);
    expect(report.facts_found).toBe(1);
    expect(report.sources_same_person).toBe(1);
    expect(mockReadFullPages).toHaveBeenCalledWith(expect.any(String), [TEAM_PAGE.url]);
    expect(mockFactsByNumber).toHaveBeenCalledWith(
      [{ ...FACT, phone: SUBJECT.phone }],
      OPTIONS.load,
      false,
    );
    expect(mockSaveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        load: OPTIONS.load,
        factsWritten: 1,
        stopped: StopReason.NothingNew,
      }),
    );
  });

  it('runs no step that would pass the person’s ceiling', async () => {
    mockSpentOnRun.mockResolvedValue(0.45);
    const report = await researchPerson(SUBJECT, OPTIONS);
    expect(report.stopped).toBe(StopReason.PersonBudget);
    expect(report.steps_run).toEqual([]);
    expect(mockRunSearches).not.toHaveBeenCalled();
    expect(mockFactsByNumber).not.toHaveBeenCalled();
  });

  it('runs no step that would pass the day’s ceiling', async () => {
    mockSpentToday.mockResolvedValue(24.95);
    expect((await researchPerson(SUBJECT, OPTIONS)).stopped).toBe(StopReason.DailyBudget);
  });

  it('starts no step once the request’s time is nearly spent', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(10 * 60 * 1000);
    const report = await researchPerson(SUBJECT, OPTIONS);
    now.mockRestore();
    expect(report.stopped).toBe(StopReason.OutOfTime);
    expect(report.steps_run).toEqual([]);
  });

  it('writes nothing on a dry run, and still records what it saw', async () => {
    const report = await researchPerson(SUBJECT, { ...OPTIONS, dryRun: true });
    expect(report.facts_written).toBe(0);
    expect(mockFactsByNumber).not.toHaveBeenCalled();
    expect(mockSaveRun).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });

  it('goes on when the model cannot be reached, and records the run', async () => {
    mockReadPages.mockReset().mockRejectedValue(new Error('overloaded'));
    const report = await researchPerson(SUBJECT, OPTIONS);
    expect(report.facts_found).toBe(0);
    expect(report.stopped).toBe(StopReason.NothingNew);
    expect(mockSaveRun).toHaveBeenCalled();
  });
});
