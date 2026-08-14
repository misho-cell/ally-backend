jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { getCountryChannels } from '../countryChannels';

const mockQuery = query as jest.MockedFunction<typeof query>;

interface ChannelRow {
  channel: string;
  count: number;
  sample: { phone: string; name: string | null }[];
}

function channelsOf(result: object): ChannelRow[] {
  return (result as { channels: ChannelRow[] }).channels;
}

// Every sweep's regex params, flattened across all calls.
function allRegexParams(): string[] {
  return mockQuery.mock.calls.flatMap((c) =>
    (c[1] as unknown[]).filter((p): p is string => typeof p === 'string' && p.startsWith('\\m')),
  );
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe('getCountryChannels', () => {
  it('lowercases institution hints so they can match LOWER()ed labels (ticket 6 PART D)', async () => {
    const result = await getCountryChannels('501', 'Germany გერმანია', [
      'GIZ',
      'DAAD',
      'Goethe-Institut',
    ]);

    expect((result as { found: boolean }).found).toBe(true);
    const regexes = allRegexParams();
    expect(regexes).toContain('\\mgiz');
    expect(regexes).toContain('\\mdaad');
    // No raw-cased pattern may survive — it can never match a lowercased label.
    expect(regexes.some((r) => /[A-Z]/.test(r))).toBe(false);
  });

  it('expands hyphen/space institution spellings both ways', async () => {
    await getCountryChannels('501', 'Germany', ['Goethe-Institut', 'Konrad Adenauer']);

    const regexes = allRegexParams();
    expect(regexes).toContain('\\mgoethe-institut');
    expect(regexes).toContain('\\mgoethe institut');
    expect(regexes).toContain('\\mkonrad adenauer');
    expect(regexes).toContain('\\mkonrad-adenauer');
  });

  it('builds country patterns from every language token passed', async () => {
    await getCountryChannels('501', 'Germany გერმანია', []);

    const regexes = allRegexParams();
    expect(regexes).toContain('\\mgermany');
    // The Georgian token rides along, stemmed (გერმანია → გერმანი) and transliterated.
    expect(regexes.some((r) => r.includes('გერმანი'))).toBe(true);
    expect(regexes.some((r) => r.includes('germani'))).toBe(true);
  });

  it('reports named_institutions as its own channel when hints are given', async () => {
    const withHints = await getCountryChannels('501', 'Germany', ['GIZ']);
    expect(channelsOf(withHints).map((c) => c.channel)).toContain('named_institutions');

    mockQuery.mockClear();
    const withoutHints = await getCountryChannels('501', 'Germany', []);
    expect(channelsOf(withoutHints).map((c) => c.channel)).not.toContain('named_institutions');
  });

  it('still answers for a single-language country name', async () => {
    const result = await getCountryChannels('501', 'პოლონეთი', []);
    expect((result as { found: boolean }).found).toBe(true);
    expect(channelsOf(result).length).toBeGreaterThan(0);
  });
});
