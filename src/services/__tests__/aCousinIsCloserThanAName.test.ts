jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { byLinkWeight, colourWhy, linkColours, linkKey, NO_LINK_COLOURS } from '../colourLinks';
import { labelTie, LabelTie } from '../labelCloseness';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** World C (the tester's 68815): three friends hold Zviad, none with a colour. */
const COUSIN = { bridge: '+995500000004', label: 'ზვიად ბერიძე ბიძაშვილი' };
const PLAIN = { bridge: '+995500000006', label: 'ზვიად ბერიძე' };
const BUDDY = { bridge: '+995500000007', label: 'ზვიად ბერიძე ძმაკაცი' };
const TARGET = '+995500000917';

describe('#5974 world C: what a member put in their label of a person says how close they are', () => {
  it('reads kin before a friend before a bare name', () => {
    expect(labelTie([COUSIN.label])).toBe(LabelTie.Kin);
    expect(labelTie([BUDDY.label])).toBe(LabelTie.Friend);
    expect(labelTie([PLAIN.label])).toBe(LabelTie.None);
  });

  it('never reads a buddy as a brother, nor „and" as a sister', () => {
    expect(labelTie(['ძმაკაცი'])).toBe(LabelTie.Friend);
    expect(labelTie(['ნინო და გიო'])).toBe(LabelTie.None);
    expect(labelTie(['გიო ძმა'])).toBe(LabelTie.Kin);
  });

  it('keeps a case ending, English words and the closest of several labels', () => {
    expect(labelTie(['ბიძაშვილს'])).toBe(LabelTie.Kin);
    expect(labelTie(['my cousin Zviad'])).toBe(LabelTie.Kin);
    expect(labelTie(['Zviad', 'gym buddy'])).toBe(LabelTie.Friend);
    expect(labelTie(['ზვიადი ❤'])).toBe(LabelTie.Friend);
    expect(labelTie([])).toBe(LabelTie.None);
  });
});

describe('#5974 world C: a link with no colour is weighed by the bridge’s own label', () => {
  beforeEach(() => mockQuery.mockReset());

  function rowsFor(
    ...holders: ReadonlyArray<{ bridge: string; label: string; tier?: string }>
  ): void {
    mockQuery.mockResolvedValueOnce({
      rows: holders.map((h) => ({
        bridge_phone: h.bridge,
        next_phone: TARGET,
        owner_tier: null,
        bridge_tier: h.tier ?? null,
        bridge_labels: [h.label, h.label],
      })),
    } as never);
  }

  it('puts the cousin first, then the buddy, then the bare name', async () => {
    rowsFor(PLAIN, BUDDY, COUSIN);
    const links = await linkColours(
      '171',
      [PLAIN, BUDDY, COUSIN].map((h) => ({ bridge: h.bridge, next: TARGET })),
    );
    const ordered = byLinkWeight(
      [PLAIN, BUDDY, COUSIN],
      (h) => links.get(linkKey(h.bridge, TARGET))?.weight ?? 0,
    );
    expect(ordered).toEqual([COUSIN, BUDDY, PLAIN]);
  });

  it('says it as „holds them close", never as the word the member saved', async () => {
    rowsFor(COUSIN, PLAIN);
    const links = await linkColours(
      '171',
      [COUSIN, PLAIN].map((h) => ({ bridge: h.bridge, next: TARGET })),
    );
    const why = colourWhy(links.get(linkKey(COUSIN.bridge, TARGET)) ?? NO_LINK_COLOURS, 'ნიკა');
    expect(why).toBe('ნიკა holds them close');
    expect(why).not.toContain('ბიძაშვილი');
    expect(colourWhy(links.get(linkKey(PLAIN.bridge, TARGET)) ?? NO_LINK_COLOURS, 'ია')).toBeNull();
  });

  it('lets the bridge’s own colour win over a label', async () => {
    rowsFor({ ...COUSIN, tier: 'yellow' });
    const links = await linkColours('171', [{ bridge: COUSIN.bridge, next: TARGET }]);
    expect(links.get(linkKey(COUSIN.bridge, TARGET))).toMatchObject({ bridgeHoldsClose: false });
  });

  it('reads the labels in the same one statement, with a bound on them', async () => {
    rowsFor(COUSIN);
    await linkColours('171', [{ bridge: COUSIN.bridge, next: TARGET }]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain(
      'JOIN "UserAlias" ua ON ua."contactId" = up."userId" AND ua.phone = p.next_phone',
    );
    expect(String(sql)).toContain(
      'JOIN "UserTags" ut ON ut."contactId" = up."userId" AND ut.phone = p.next_phone',
    );
    expect(params?.[4]).toBe(20);
  });
});
