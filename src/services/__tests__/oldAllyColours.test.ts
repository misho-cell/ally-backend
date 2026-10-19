jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import {
  AllyColour,
  coloursAndBubbles,
  isSayableLabel,
  MAX_CLOSEST,
  pagePhones,
  toColour,
} from '../oldAllyColours.service';
import { byLinkWeight, colourWhy, linkColours, linkKey, weightOf } from '../colourLinks';

const mockQuery = query as jest.MockedFunction<typeof query>;

const OWNER = '501';
const NINO = '+995500000011';
const GIA = '+995500000012';
const NOBODY = '+995500000013';

interface Rows {
  readonly own?: ReadonlyArray<Record<string, unknown>>;
  readonly bubble?: ReadonlyArray<Record<string, unknown>>;
}

function answering({ own = [], bubble = [] }: Rows): void {
  mockQuery.mockImplementation(((sql: string) =>
    Promise.resolve({
      rows: sql.includes('close_bridges') ? bubble : own,
      rowCount: 0,
    })) as never);
}

function sqlOf(fragment: string): string {
  const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes(fragment));
  if (call === undefined) throw new Error(`no query with ${fragment}`);
  return String(call[0]);
}

function paramsOf(fragment: string): unknown[] {
  const call = mockQuery.mock.calls.find(([sql]) => String(sql).includes(fragment));
  return (call?.[1] ?? []) as unknown[];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#5974 the old Ally colours', () => {
  it('maps the four stored tiers to colours and anything else to null', () => {
    expect(toColour('green')).toBe(AllyColour.Green);
    expect(toColour('blue')).toBe(AllyColour.Blue);
    expect(toColour('yellow')).toBe(AllyColour.Yellow);
    expect(toColour('red')).toBe(AllyColour.Red);
    expect(toColour('purple')).toBeNull();
    expect(toColour(null)).toBeNull();
  });

  it('gives every number on the page the owner colour, or null, and a zero bubble when nobody close holds him', async () => {
    answering({ own: [{ phone: NINO, tier: 'blue' }] });

    const out = await coloursAndBubbles(OWNER, [NINO, '500 00 00 13']);

    expect(out.get('995500000011')).toEqual({
      owner_colour: AllyColour.Blue,
      bubble: { count: 0, closest: [] },
    });
    expect(out.get('995500000013')).toEqual({
      owner_colour: null,
      bubble: { count: 0, closest: [] },
    });
  });

  it('counts only green and blue on both sides of the bubble', async () => {
    answering({ bubble: [{ phone: GIA, count: '4', closest: ['Nika'] }] });

    const out = await coloursAndBubbles(OWNER, [GIA]);

    expect(out.get('995500000012')?.bubble.count).toBe(4);
    const params = paramsOf('close_bridges');
    expect(params[2]).toEqual(['green', 'blue']);
    const sql = sqlOf('close_bridges');
    // The owner's side and the bridge's side are both held to the close colours.
    expect(sql).toContain('h.user_id = $1::int AND h.tier = ANY($3::text[])');
    expect(sql).toContain('h.contact_phone = ANY($2::text[]) AND h.tier = ANY($3::text[])');
  });

  it('names at most three bridges, and only by labels that are names', async () => {
    answering({
      bubble: [
        {
          phone: GIA,
          count: 6,
          closest: ['Nika', '+995 599 123 456', 'Ana', 'ბექა', 'Dato', 'Levan'],
        },
      ],
    });

    const out = await coloursAndBubbles(OWNER, [GIA]);

    expect(out.get('995500000012')?.bubble.closest).toEqual(['Nika', 'Ana', 'ბექა']);
    expect(out.get('995500000012')?.bubble.closest.length).toBeLessThanOrEqual(MAX_CLOSEST);
  });

  it("reads the bridges' names from the OWNER's own labels and nobody else's", async () => {
    answering({});

    await coloursAndBubbles(OWNER, [GIA]);

    const sql = sqlOf('close_bridges');
    const aliasReads = sql.match(/"UserAlias" ua[\s\S]*?LIMIT 1/g) ?? [];
    expect(aliasReads).toHaveLength(1);
    expect(aliasReads[0]).toContain('ua."contactId" = $1::int');
    expect(paramsOf('close_bridges')[0]).toBe(OWNER);
  });

  it('is two parameterized, bounded queries for the whole page, with a timeout', async () => {
    answering({});

    await coloursAndBubbles(OWNER, [NINO, GIA, NOBODY]);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    for (const [sql, params, timeout] of mockQuery.mock.calls) {
      expect(String(sql)).toMatch(/LIMIT \$\d/);
      expect(String(sql)).not.toContain(NINO);
      expect((params as unknown[])[1]).toEqual([NINO, GIA, NOBODY]);
      expect(typeof timeout).toBe('number');
    }
  });

  it('asks nothing for an empty page', async () => {
    expect((await coloursAndBubbles(OWNER, ['', '  '])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps a page to one entry per number', () => {
    expect(pagePhones(['500 000 011', '+995500000011', ''])).toEqual(['+995500000011']);
  });

  it('never takes a number for a name', () => {
    expect(isSayableLabel('Nika')).toBe(true);
    expect(isSayableLabel('ნიკა 2')).toBe(true);
    expect(isSayableLabel('599123456')).toBe(false);
    expect(isSayableLabel('Nika 599123456')).toBe(false);
  });
});

describe('#5974 the colours along a link', () => {
  it('weighs green over blue over yellow over red over none', () => {
    const weights = [
      AllyColour.Green,
      AllyColour.Blue,
      AllyColour.Yellow,
      AllyColour.Red,
      null,
    ].map(weightOf);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(new Set(weights).size).toBe(weights.length);
  });

  it("reads both sides and keeps the bridge's colour to a close / not close", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { bridge_phone: NINO, next_phone: GIA, owner_tier: 'green', bridge_tier: 'blue' },
        { bridge_phone: NOBODY, next_phone: GIA, owner_tier: 'red', bridge_tier: 'yellow' },
      ],
      rowCount: 2,
    } as never);

    const links = await linkColours(OWNER, [
      { bridge: NINO, next: GIA },
      { bridge: NOBODY, next: GIA },
    ]);

    const strong = links.get(linkKey(NINO, GIA));
    const weak = links.get(linkKey(NOBODY, GIA));
    expect(strong).toEqual({ ownerColour: AllyColour.Green, bridgeHoldsClose: true, weight: 7 });
    expect(weak).toEqual({ ownerColour: AllyColour.Red, bridgeHoldsClose: false, weight: 3 });
    expect(Object.values(strong ?? {})).not.toContain('blue');
  });

  it("says the owner's colour and never the bridge's", () => {
    const why = colourWhy(
      { ownerColour: AllyColour.Green, bridgeHoldsClose: true, weight: 8 },
      'Nika',
    );
    expect(why).toBe('your green contact Nika holds them close');
    expect(colourWhy({ ownerColour: null, bridgeHoldsClose: true, weight: 4 }, 'Nika')).toBe(
      'Nika holds them close',
    );
    expect(
      colourWhy({ ownerColour: AllyColour.Blue, bridgeHoldsClose: false, weight: 4 }, 'Ana'),
    ).toBe('Ana is your blue contact');
    expect(colourWhy({ ownerColour: null, bridgeHoldsClose: false, weight: 2 }, 'Ana')).toBeNull();
  });

  it('puts the heaviest first and keeps the order it was given on a tie', () => {
    const items = [
      { n: 'a', w: 1 },
      { n: 'b', w: 5 },
      { n: 'c', w: 1 },
      { n: 'd', w: 5 },
    ];
    expect(byLinkWeight(items, (i) => i.w).map((i) => i.n)).toEqual(['b', 'd', 'a', 'c']);
  });
});
