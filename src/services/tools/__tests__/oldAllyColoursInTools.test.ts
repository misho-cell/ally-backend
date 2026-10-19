jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { AllyColour } from '../../oldAllyColours.service';
import { LinkColours, linkKey } from '../../colourLinks';
import { COLOUR_NOTE, OLD_ALLY_COLOUR_TOOLS, withOldAllyColours } from '../withOldAllyColours';
import { heaviestLinkFirst } from '../searchSecondDegree';
import { inColourOrder, WarmPath, withColourWhy } from '../findWarmPath';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const TARGET = '+995500000021';
const NIKA = '+995500000022';
const ANA = '+995500000023';
const BEKA = '+995500000024';

type Row = Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(((sql: string) =>
    Promise.resolve({
      rows: sql.includes('close_bridges')
        ? [{ phone: TARGET, count: 2, closest: ['Nika', 'Ana'] }]
        : [{ phone: TARGET, tier: 'green' }],
      rowCount: 1,
    })) as never);
});

const listResult = (): Row => ({
  found: true,
  results: [{ phone: TARGET, name: 'Giorgi' }],
});

const SHAPES: ReadonlyArray<readonly [string, () => Row, (out: Row) => Row]> = [
  ['search_contact_by_name', listResult, (out) => (out.results as Row[])[0]],
  ['search_by_tag', listResult, (out) => (out.results as Row[])[0]],
  ['search_second_degree', listResult, (out) => (out.results as Row[])[0]],
  ['get_contact_full_profile', () => ({ phone: TARGET, tags: [] }), (out) => out],
  [
    'find_warm_path',
    () => ({ found: true, target: { phone: TARGET, name: 'Giorgi' }, paths: [] }),
    (out) => out.target as Row,
  ],
];

describe('#5974 every person-finding tool carries the colours and the bubble', () => {
  it('covers exactly the five tools', () => {
    expect([...OLD_ALLY_COLOUR_TOOLS].sort()).toEqual(SHAPES.map(([name]) => name).sort());
  });

  it.each(SHAPES)(
    '%s: owner_colour and bubble on the person, the note beside it',
    async (tool, make, person) => {
      const out = (await withOldAllyColours(OWNER, tool, make())) as Row;

      expect(person(out).owner_colour).toBe(AllyColour.Green);
      expect(person(out).bubble).toEqual({ count: 2, closest: ['Nika', 'Ana'] });
      expect(out.colour_note).toBe(COLOUR_NOTE);
      expect(JSON.stringify(person(out).bubble)).not.toMatch(/\d{5,}/);
    },
  );

  it('leaves every other tool, and a failed read, exactly as it was', async () => {
    const other = { results: [{ phone: TARGET }] };
    expect(await withOldAllyColours(OWNER, 'list_my_contacts', other)).toBe(other);

    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const result = listResult();
    expect(await withOldAllyColours(OWNER, 'search_by_tag', result)).toBe(result);
  });

  it('asks the database once per call for the whole page, not once per row', async () => {
    const many = { results: [{ phone: TARGET }, { phone: NIKA }, { phone: ANA }] };
    await withOldAllyColours(OWNER, 'search_by_tag', many);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('says nothing when there is nothing to say', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const out = (await withOldAllyColours(OWNER, 'search_by_tag', listResult())) as Row;
    expect(out.colour_note).toBeUndefined();
    expect((out.results as Row[])[0].bubble).toEqual({ count: 0, closest: [] });
  });
});

const links = new Map<string, LinkColours>([
  [linkKey(ANA, TARGET), { ownerColour: AllyColour.Green, bridgeHoldsClose: true, weight: 8 }],
  [linkKey(BEKA, TARGET), { ownerColour: AllyColour.Blue, bridgeHoldsClose: false, weight: 4 }],
]);

describe('#5974 second degree: the heaviest colour link first', () => {
  it('ranks by the link and keeps the order given on a tie', () => {
    const bridges = [{ phone: NIKA }, { phone: BEKA }, { phone: ANA }];
    expect(heaviestLinkFirst(bridges, TARGET, links).map((b) => b.phone)).toEqual([
      ANA,
      BEKA,
      NIKA,
    ]);
    const uncoloured = [{ phone: NIKA }, { phone: '+995500000099' }];
    expect(heaviestLinkFirst(uncoloured, TARGET, links)).toEqual(uncoloured);
  });
});

describe('#5974 find_warm_path: colour after hops, with a reason', () => {
  const path = (phones: string[], name: string): WarmPath => ({
    hops: phones.length + 1,
    relayable: true,
    bridges: phones.map((phone, i) => ({
      phone,
      name: i === 0 ? name : null,
      is_member: true,
      account_state: 'netai_user',
    })),
  });

  it('keeps fewest hops first and lets the colour order within them', () => {
    const nika = path([NIKA], 'Nika');
    const beka = path([BEKA], 'Beka');
    const ana = path([ANA], 'Ana');
    const longAna = path([ANA, NIKA], 'Ana');
    const ordered = inColourOrder([longAna, nika, beka, ana], TARGET, links);
    expect(ordered).toEqual([ana, beka, nika, longAna]);
  });

  it("names the first bridge's reason by the owner's colour, never the bridge's", () => {
    const out = withColourWhy(path([ANA], 'Ana'), TARGET, links);
    expect(out.bridges[0].colour_why).toBe('your green contact Ana holds them close');
    expect(
      withColourWhy(path([NIKA], 'Nika'), TARGET, links).bridges[0].colour_why,
    ).toBeUndefined();
  });
});
