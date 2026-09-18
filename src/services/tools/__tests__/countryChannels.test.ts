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

// Every regex param, flattened across all calls. The channel patterns now
// travel as an ARRAY (one statement answers all channels), so nested values
// are flattened too — otherwise this quietly stops seeing half of them.
function allRegexParams(): string[] {
  const out: string[] = [];
  const take = (p: unknown): void => {
    if (typeof p === 'string' && p.startsWith('\\m')) out.push(p);
    else if (Array.isArray(p)) p.forEach(take);
  };
  mockQuery.mock.calls.forEach((c) => (c[1] as unknown[]).forEach(take));
  return out;
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
    expect(regexes).toContain('\\mgiz\\M');
    expect(regexes).toContain('\\mdaad\\M');
    // No raw-cased pattern may survive — it can never match a lowercased label.
    expect(regexes.some((r) => /[A-Z]/.test(r) && !r.includes('\\M'))).toBe(false);
  });

  it('short acronyms are exact tokens, never prefixes — "giz" must not match "Gizo" (§3.2)', async () => {
    await getCountryChannels('501', 'Germany', ['GIZ', 'AHK', 'DAAD', 'Goethe-Institut']);

    const regexes = allRegexParams();
    // ≤4 chars → whole-token (\m...\M); longer names keep the prefix match.
    expect(regexes).toContain('\\mgiz\\M');
    expect(regexes).toContain('\\mahk\\M');
    expect(regexes).toContain('\\mdaad\\M');
    expect(regexes).toContain('\\mgoethe-institut');
    expect(regexes).not.toContain('\\mgiz');
    expect(regexes).not.toContain('\\mahk');
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

/**
 * 15 September. The log showed this tool at 8.1s a sweep, and it ran one sweep
 * PER CHANNEL — five, six when institutions are named — each rebuilding the
 * identical label material and re-running the identical country scan.
 *
 * Measured on prod: one sweep 2278ms, all six together 2058ms. The same. So
 * six sweeps were paying six times for one answer, about 48 seconds of
 * database work inside a live conversation.
 *
 * These hold the shape of the replacement, because the risk of collapsing six
 * queries into one is not speed — it is handing a person to the wrong channel.
 */
describe('one pass, every channel', () => {
  it('asks the database once, not once per channel', async () => {
    await getCountryChannels('501', 'Germany', ['GIZ']);

    const sweeps = mockQuery.mock.calls.filter(([sql]) => (sql as string).includes('channel_hits'));
    expect(sweeps).toHaveLength(1);
  });

  it('gives each person back to the channel they matched, and only that one', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { key: 'alumni_universities', phone: '+995500000001', name: 'Nino' },
        { key: 'alumni_universities', phone: '+995500000002', name: 'Dato' },
        { key: 'embassies_diplomacy', phone: '+995500000003', name: 'Lasha' },
      ],
      rowCount: 3,
    } as never);

    const channels = channelsOf(await getCountryChannels('501', 'Germany', []));
    const byKey = new Map(channels.map((c) => [c.channel, c]));

    expect(byKey.get('alumni_universities')?.count).toBe(2);
    expect(byKey.get('alumni_universities')?.sample.map((s) => s.name)).toEqual(['Nino', 'Dato']);
    expect(byKey.get('embassies_diplomacy')?.count).toBe(1);
    // A channel nobody matched still reports itself — "no alumni angle in your
    // network" is information the user needs, so an empty channel is an answer.
    expect(byKey.get('clubs_fellowships')?.count).toBe(0);
    expect(channels).toHaveLength(5);
  });

  it('carries every channel’s keywords, not just the first channel’s', async () => {
    await getCountryChannels('501', 'Germany', []);

    const [, params] = mockQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('channel_hits'),
    ) as [string, unknown[]];
    const keys = params.find(
      (p): p is string[] => Array.isArray(p) && p.some((v) => v === 'alumni_universities'),
    );
    // Every channel is represented, and each of its patterns carries its key.
    expect(new Set(keys)).toEqual(
      new Set([
        'alumni_universities',
        'clubs_fellowships',
        'associations_chambers',
        'embassies_diplomacy',
        'bilateral_councils',
      ]),
    );
  });
});

/**
 * Row 158 — the tool had never once worked.
 *
 * Every call in thirty days, three of three, died with „canceling statement
 * due to statement timeout" at 16.3 to 16.6 seconds. On the seat's hard goal
 * of 17 September two of them burned 33 seconds of a 195-second run and
 * returned nothing, and the model carried on without them.
 *
 * The regex join ran over every label of every contact and only then met the
 * country. Measured on 501: 134,628 label rows against about 65 channel
 * patterns, roughly 8.7 million regex evaluations, to find ONE contact for
 * Germany and none at all for Finland. Joining the country first is the same
 * result by construction and took 418 ms on production.
 *
 * Asserted on the SQL because that is where the rule lives, and because the
 * failure it prevents is invisible in any result: the old shape returns the
 * right rows too, when it is given twenty seconds it does not have.
 */
describe('row 158 — the country filter runs before the channel patterns', () => {
  it('restricts the labels to the country inside channel_hits', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await getCountryChannels('501', 'Germany');

    const sql = String(
      mockQuery.mock.calls.map((c) => String(c[0])).find((q) => q.includes('channel_hits')),
    );
    const insideChannelHits = sql.slice(
      sql.indexOf('channel_hits AS ('),
      sql.indexOf('SELECT h.key'),
    );
    // The join that makes it cheap, in the CTE that does the regex work.
    expect(insideChannelHits).toContain('JOIN country_hits co ON co.phone = l.phone');
    expect(insideChannelHits).toContain('~ c.rx');
  });

  it('does not filter by country only AFTER the patterns have run', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await getCountryChannels('501', 'Germany');

    const sql = String(
      mockQuery.mock.calls.map((c) => String(c[0])).find((q) => q.includes('channel_hits')),
    );
    // The old shape joined it on the OUTER select, one step too late. If that
    // line comes back, so does a tool that has never worked.
    expect(sql.slice(sql.indexOf('SELECT h.key'))).not.toContain('JOIN country_hits');
  });
});
