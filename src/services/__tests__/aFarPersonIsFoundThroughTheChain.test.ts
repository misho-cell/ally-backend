jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/findWarmPath', () => ({ __esModule: true, namesFor: jest.fn() }));

import { query } from '../../db/postgres/client';
import { namesFor } from '../tools/findWarmPath';
import { farMembersHolding, HITS_SHOWN, wordPatterns } from '../farCircles.service';
import { normalizePhone } from '../phone';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockNames = namesFor as jest.MockedFunction<typeof namesFor>;

const OWNER = 186272;
/** owner → L1 → L2 → L3 → L4, each saving only the next; L4 saved the notary. */
const CHAIN = [186273, 186274, 186275, 186276];
const phoneOf = (id: number): string => `99559900${id}`;
/** The label each link saved the next one under; empty = none saved. */
let labels: (string | null)[] = [];

function routeChain(saved: { holder: number; alias: string } | null): void {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const ring = (params?.[0] ?? []) as number[];
    if (sql.includes('DISTINCT ON (up."userId")')) {
      const rows = ring.flatMap((id) => {
        const next = id === OWNER ? CHAIN[0] : CHAIN[CHAIN.indexOf(id) + 1];
        return next === undefined ? [] : [{ from_id: id, user_id: next, phone: phoneOf(next) }];
      });
      return { rows } as never;
    }
    if (sql.includes('WITH ORDINALITY')) {
      const chain = (params?.[1] ?? []) as string[];
      return { rows: chain.map((_, i) => ({ ord: i + 1, label: labels[i] ?? null })) } as never;
    }
    if (sql.includes('LIKE ALL')) {
      const rows =
        saved !== null && ring.includes(saved.holder)
          ? [{ holder_id: saved.holder, phone: '995599777000', alias: saved.alias }]
          : [];
      return { rows } as never;
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

/**
 * 5347, the tester's 63203 (0 of 4): a person five handshakes away was never
 * found, so find_warm_path was never called. The walk goes on through people
 * who use Netai until somebody saved them under the words asked for.
 */
describe('a person beyond the second circle', () => {
  beforeEach(() => {
    labels = [];
    mockQuery.mockReset();
    mockNames.mockReset();
    mockNames.mockImplementation(
      async (_owner: string, phones: string[]) =>
        new Map(phones.map((phone, i) => [normalizePhone(phone), `link ${i + 1}`])) as never,
    );
  });

  it('is found five hops out, with the whole chain to them', async () => {
    routeChain({ holder: CHAIN[3], alias: 'ნოტარიუსი ქუთაისში' });

    const found = await farMembersHolding(OWNER, 'ნოტარიუსი ქუთაისში');

    expect(found).toEqual([
      {
        name: 'ნოტარიუსი ქუთაისში',
        phone: normalizePhone('995599777000'),
        hops: 5,
        firstLinkPhone: normalizePhone(phoneOf(CHAIN[0])),
        via: ['link 1', 'link 2', 'link 3', 'link 4'],
      },
    ]);
  });

  it('names each link by the label the one before saved them under (63264 A)', async () => {
    routeChain({ holder: CHAIN[3], alias: 'ზურაბ ქობულაძე' });
    labels = ['ლევან ჯაფარიძე', 'ნინო კაპანაძე', null, 'მარიამ ლომიძე'];

    const [hit] = await farMembersHolding(OWNER, 'ზურაბ ქობულაძე');

    expect(hit.via).toEqual(['ლევან ჯაფარიძე', 'ნინო კაპანაძე', 'link 3', 'მარიამ ლომიძე']);
  });

  it('never searches the owner’s own phonebook or the second circle again', async () => {
    routeChain(null);

    await farMembersHolding(OWNER, 'ნოტარიუსი');

    const searchedRings = mockQuery.mock.calls
      .filter(([sql]) => String(sql).includes('LIKE ALL'))
      .map(([, params]) => (params as unknown[])[0]);
    expect(searchedRings).toEqual([[CHAIN[1]], [CHAIN[2]], [CHAIN[3]]]);
  });

  it('matches a tag the holder gave as well as the label (63264 B, C)', async () => {
    routeChain(null);

    await farMembersHolding(OWNER, 'ნოტარიუსი');

    const searched = mockQuery.mock.calls.find(([sql]) => String(sql).includes('LIKE ALL'));
    expect(String(searched?.[0])).toContain('"UserTags"');
    expect(String(searched?.[0])).toContain('"UserAlias"');
  });

  it('walks no further than four people in the middle', async () => {
    routeChain(null);

    await farMembersHolding(OWNER, 'ნოტარიუსი');

    const rings = mockQuery.mock.calls.filter(([sql]) => String(sql).includes('DISTINCT ON'));
    expect(rings).toHaveLength(4);
  });

  it('finds nobody, and reads nothing, for words too short to mean anything', async () => {
    expect(await farMembersHolding(OWNER, 'ა ბ')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('never shows a number where a link has no name', async () => {
    routeChain({ holder: CHAIN[1], alias: 'ნოტარიუსი' });
    mockNames.mockResolvedValue(new Map() as never);

    const [hit] = await farMembersHolding(OWNER, 'ნოტარიუსი');

    expect(hit.via).toEqual([null, null]);
    expect(hit.hops).toBe(3);
  });

  it('shows at most a handful', () => {
    expect(HITS_SHOWN).toBeLessThanOrEqual(5);
  });
});

describe('the words compared', () => {
  it('drop the case ending and compare in the database’s own form', () => {
    expect(wordPatterns('ზურაბ ქობულაძეს')).toEqual(['%zurab%', '%kobulaze%']);
  });

  it('drop words under three letters', () => {
    expect(wordPatterns('ის და ნოტარიუსი')).toEqual(['%notarius%']);
  });
});

describe('an empty search', () => {
  // Loaded here so the mocks above stand for the whole chat module too.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chat = require('../chat.service') as typeof import('../chat.service');

  beforeEach(() => mockQuery.mockReset());

  it('is the second circle saying nobody', () => {
    expect(chat.secondCircleEmpty({ found: false, reason: 'no_matches' })).toBe(true);
    expect(chat.secondCircleEmpty({ found: false, reason: 'no_contacts_in_graph' })).toBe(false);
    expect(chat.secondCircleEmpty({ found: true, results: [] })).toBe(false);
  });

  it('comes back as it was when the walk finds nobody or fails', async () => {
    const empty = { found: false, reason: 'no_matches' };
    routeChain(null);
    expect(await chat.withFurtherOut('186272', 'ნოტარიუსი', empty)).toEqual(empty);
    mockQuery.mockRejectedValue(new Error('timeout'));
    expect(await chat.withFurtherOut('186272', 'ნოტარიუსი', empty)).toEqual(empty);
  });

  it('carries who was found further out, and what to do with them', async () => {
    routeChain({ holder: CHAIN[3], alias: 'ნოტარიუსი ქუთაისში' });
    const out = await chat.withFurtherOut('186272', 'ნოტარიუსი', { found: false });
    expect(out).toMatchObject({ found: false, further_out: [{ hops: 5 }] });
    expect((out as { further_out_note: string }).further_out_note).toContain('find_warm_path');
  });
});
