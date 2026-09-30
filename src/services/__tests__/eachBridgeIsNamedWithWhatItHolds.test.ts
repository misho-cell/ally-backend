jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { bridgesSummary } from '../tools/searchSecondDegree';

/**
 * Rows 285/286: eight second-circle lawyers found, and the plan said only
 * „through the founder" — no names, no other bridges, no reason. The result
 * now says which bridge holds how many of them.
 */
describe('the second circle says which bridge knows how many of the people found', () => {
  const T44 = { name: 'Netai Test 44', phone: '+995500000044' };
  const T2 = { name: 'Netai Test 2', phone: '+995500000002' };

  it('counts each bridge once per person, most first', () => {
    const out = bridgesSummary([
      { via_contacts: [T44, T2] },
      { via_contacts: [T44] },
      { via_contacts: [T44, T44] },
    ]);
    expect(out).toEqual([
      { name: 'Netai Test 44', phone: T44.phone, knows: 3 },
      { name: 'Netai Test 2', phone: T2.phone, knows: 1 },
    ]);
  });

  it('is empty when nobody was found', () => {
    expect(bridgesSummary([])).toEqual([]);
  });

  it('keeps at most ten bridges', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      via_contacts: [{ name: `B${i}`, phone: `+9955000001${String(i).padStart(2, '0')}` }],
    }));
    expect(bridgesSummary(rows)).toHaveLength(10);
  });
});
