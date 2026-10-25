jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../tools/webSearch', () => ({
  __esModule: true,
  webSearch: jest.fn(),
  fetchPage: jest.fn(),
}));
jest.mock('../extract', () => ({
  __esModule: true,
  extractFacts: jest.fn(),
  extractResearch: jest.fn(),
}));

import { query } from '../../../db/postgres/client';
import { fetchPage, webSearch } from '../../tools/webSearch';
import { extractFacts, extractResearch } from '../extract';
import {
  queueRegistrationResearch,
  REGISTRATION_RESEARCH_ON,
  researchNextUser,
  startRegistrationResearch,
} from '../registrationResearch.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSearch = webSearch as jest.MockedFunction<typeof webSearch>;
const mockFetch = fetchPage as jest.MockedFunction<typeof fetchPage>;
const mockExtract = extractFacts as jest.MockedFunction<typeof extractFacts>;
const mockResearch = extractResearch as jest.MockedFunction<typeof extractResearch>;
const PAGE_URL = 'https://a.ge/nino';

function sqlOf(call: unknown[]): string {
  return String(call[0]);
}

/** 4126 item 1: one run per new user, inside the stop, OFF until Misho's yes. */
describe('registration research run', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('is ON since Misho’s yes (§129); switched off, nothing is queued and no ticker starts', async () => {
    expect(REGISTRATION_RESEARCH_ON).toBe(true);
    expect(await queueRegistrationResearch(7, false)).toBe(false);
    expect(startRegistrationResearch(false)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('queues a user once: the insert does nothing for a second time', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    expect(await queueRegistrationResearch(7, true)).toBe(true);
    expect(sqlOf(mockQuery.mock.calls[0])).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('does nothing when nobody is queued', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await researchNextUser()).toBe(false);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('searches, reads the pages, and stores sourced facts on the user’s own number', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 7, name: 'Nino Satsdeli', city: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    mockSearch.mockResolvedValue({
      results: [{ url: PAGE_URL, title: 'Nino', snippet: 'auditor' }],
    });
    mockFetch.mockResolvedValue({ url: PAGE_URL, content: 'Nino Satsdeli works at Bank A.' });
    mockExtract.mockResolvedValueOnce([
      { key: 'employer', value: 'Bank A', sources: [PAGE_URL], date: null },
    ]);

    expect(await researchNextUser(false)).toBe(true);
    expect(mockSearch).toHaveBeenCalledTimes(4);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const insert = mockQuery.mock.calls.find((c) => sqlOf(c).includes('INSERT INTO contact_facts'));
    expect(insert?.[1]).toEqual([
      '+995500000001',
      '0',
      'employer',
      'Bank A',
      'public_research',
      PAGE_URL,
      null,
      'possible',
      null,
    ]);
    expect(sqlOf(insert ?? [])).toContain('removed_by_subject_at IS NOT NULL');
    const done = mockQuery.mock.calls.find((c) => sqlOf(c).includes('SET status = $2'));
    expect(done?.[1]).toEqual([7, 'done', 4, 1, 1, null]);
  });

  it('records a failure with what was spent, and never throws', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 7, name: 'Nino Satsdeli', city: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    mockSearch.mockRejectedValueOnce(new Error('search down'));
    expect(await researchNextUser(false)).toBe(true);
    const failed = mockQuery.mock.calls.find((c) => sqlOf(c).includes('SET status = $2'));
    expect(failed?.[1]?.[1]).toBe('failed');
    expect(failed?.[1]?.[5]).toBe('search down');
  });

  it('never searches a single-word name nobody saved in full (#7726)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 7, name: 'Giorgi', city: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    expect(await researchNextUser(false)).toBe(true);
    expect(mockSearch).not.toHaveBeenCalled();
    const done = mockQuery.mock.calls.find((c) => sqlOf(c).includes('SET status = $2'));
    expect(done?.[1]?.[5]).toBe('single-word name: no public search');
  });

  it('closes a user with no name or number without searching', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 7, name: null, city: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    expect(await researchNextUser(false)).toBe(true);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('with the list switch on, keeps the people a public list names in list_people (4126 item 3)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 7, name: 'Nino Satsdeli', city: null }] } as never)
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000001' }] } as never)
      .mockResolvedValue({ rows: [], rowCount: 1 } as never);
    mockSearch.mockResolvedValue({
      results: [{ url: PAGE_URL, title: 'Board', snippet: 'board' }],
    });
    mockFetch.mockResolvedValue({ url: PAGE_URL, content: 'Board of Bank A: Nino Satsdeli.' });
    mockResearch.mockResolvedValueOnce({
      facts: [{ key: 'employer', value: 'Bank A', sources: [PAGE_URL], date: null }],
      listed: [
        {
          name: 'Nino Satsdeli',
          organisation: 'Bank A',
          listedRole: 'Board member',
          sourceUrl: PAGE_URL,
          checkedOn: '2026-10-12',
        },
      ],
    });

    expect(await researchNextUser(true)).toBe(true);
    expect(mockExtract).not.toHaveBeenCalled();
    const listed = mockQuery.mock.calls.find((c) => sqlOf(c).includes('INSERT INTO list_people'));
    expect(listed?.[1]).toEqual([
      'Nino Satsdeli',
      'Bank A',
      'Board member',
      PAGE_URL,
      '2026-10-12',
      '+995500000001',
    ]);
  });
});
