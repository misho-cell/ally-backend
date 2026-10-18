jest.mock('../tools/webSearch', () => ({ webSearch: jest.fn() }));
jest.mock('../costLedger.service', () => ({ recordFixedUsage: jest.fn() }));
jest.mock('../toolCallLog.service', () => ({ logToolCall: jest.fn() }));

import { webSearch } from '../tools/webSearch';
import { recordFixedUsage } from '../costLedger.service';
import { logToolCall } from '../toolCallLog.service';
import {
  buildRoleSearchSection,
  lenderNamedIn,
  roleSearchQueries,
  runRoleSearch,
} from '../roleWebSearch.service';

const mockedSearch = webSearch as jest.MockedFunction<typeof webSearch>;
const mockedUsage = recordFixedUsage as jest.MockedFunction<typeof recordFixedUsage>;
const RUN = { userId: '187879', runId: 'run-5248', threadId: 59071 } as const;
const LIKAS_TEXT =
  'თიბისიში ვინმე მჭირდება, ვინც ჩემს ბიზნეს სესხის განაცხადს უპასუხებს — სამი კვირაა ელოდება.';

describe('#5248 (D825): a loan at a bank is searched by role before the first answer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsage.mockResolvedValue(undefined);
  });

  it('builds the role query in English and Georgian for Lika’s TBC text', () => {
    const queries = roleSearchQueries(LIKAS_TEXT);
    expect(queries?.en).toBe('TBC Bank SME business lending head');
    expect(queries?.ka).toBe('თიბისი ბანკი მცირე და საშუალო ბიზნესის დაკრედიტების ხელმძღვანელი');
  });

  it('reads the English spelling too', () => {
    expect(roleSearchQueries('someone at TBC who can answer my business loan')?.en).toBe(
      'TBC Bank SME business lending head',
    );
    expect(lenderNamedIn('a mortgage at Bank of Georgia')?.en).toBe('Bank of Georgia');
  });

  it('runs no role search without a lender or without a lending need', () => {
    expect(roleSearchQueries('ბიზნეს სესხი მჭირდება')).toBeNull();
    expect(roleSearchQueries('თიბისიში ანგარიში გავხსენი, ბარათი არ მოსულა')).toBeNull();
    expect(roleSearchQueries('I need a wedding photographer in Kutaisi')).toBeNull();
  });

  it('runs both queries, charges and logs each one', async () => {
    mockedSearch.mockResolvedValue({ results: [{ title: 'Head of SME', url: 'https://x.ge' }] });
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(mockedSearch.mock.calls.map((call) => call[0])).toEqual([queries.en, queries.ka]);
    expect(mockedUsage).toHaveBeenCalledTimes(2);
    expect(logToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'web_search:role', input: { query: queries.en } }),
    );
    expect(finds.results.every((found) => found.result !== null)).toBe(true);
  });

  it('keeps the half that answered when the other fails', async () => {
    mockedSearch
      .mockResolvedValueOnce({ results: [{ title: 'Head of SME', url: 'https://x.ge' }] })
      .mockRejectedValueOnce(new Error('search down'));
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    const finds = await runRoleSearch(RUN, queries);
    expect(finds.results.map((found) => found.result === null)).toEqual([false, true]);
    const section = buildRoleSearchSection(finds);
    expect(section).toContain('## როლით ძიება');
    expect(section).toContain(`### ${queries.en}`);
    expect(section).not.toContain(`### ${queries.ka}`);
  });

  it('writes no section when neither query answered', async () => {
    mockedSearch.mockRejectedValue(new Error('search down'));
    const queries = roleSearchQueries(LIKAS_TEXT);
    if (queries === null) throw new Error('expected role queries');
    expect(buildRoleSearchSection(await runRoleSearch(RUN, queries))).toBe('');
  });
});
