jest.mock('../../roster.service', () => ({
  __esModule: true,
  rosterMembers: jest.fn(),
  isOnRoster: jest.fn(),
  filterRoster: jest.fn(),
}));
jest.mock('../mergedIdentities', () => ({
  __esModule: true,
  collapseMergedPhones: jest.fn(),
}));

import { rosterMembers, isOnRoster, filterRoster } from '../../roster.service';
import { collapseMergedPhones } from '../mergedIdentities';
import { searchRoster } from '../searchRoster';

const mockMembers = rosterMembers as jest.MockedFunction<typeof rosterMembers>;
const mockOnRoster = isOnRoster as jest.MockedFunction<typeof isOnRoster>;
const mockFilter = filterRoster as jest.MockedFunction<typeof filterRoster>;
const mockCollapse = collapseMergedPhones as jest.MockedFunction<typeof collapseMergedPhones>;

/**
 * Ticket 20 row 88 — one person, one row, on the last search that lacked it.
 *
 * The seat saw one man as THREE rows on the founder's Axel roster, with the
 * count reading 107 for about a hundred people. search_by_tag,
 * search_contact_by_name and search_second_degree have collapsed merged
 * numbers since Ticket 16 Task 23; this search never did.
 *
 * Note what these tests do NOT claim. The three rows the seat saw are three
 * numbers nobody has reviewed, so no collapse could have joined them — that is
 * the identity queue's backlog, not this tool's bug. What is held here is that
 * a pair the founder HAS approved comes back once.
 */
const USER = '501';

function member(i: number, onNetai: boolean): unknown {
  return {
    phone: `+99555500${String(i).padStart(4, '0')}`,
    name: `Person ${i}`,
    group: 'Axel',
    on_netai: onNetai,
    user_id: onNetai ? 900000 + i : null,
    all_aliases: null,
    account_name: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnRoster.mockResolvedValue(true);
  mockFilter.mockImplementation((members) => [...members]);
  mockCollapse.mockImplementation(async (rows) => ({ rows, collapsed: 0 }));
});

describe('search_roster collapses a person the founder marked as one', () => {
  it('sends the rows through the collapse at all', async () => {
    mockMembers.mockResolvedValue([member(1, true), member(2, false)] as never);

    await searchRoster(USER, 'Axel');

    expect(mockCollapse).toHaveBeenCalledTimes(1);
    const passed = mockCollapse.mock.calls[0][0];
    expect(passed.map((r) => (r as { phone: string }).phone)).toEqual([
      '+995555000001',
      '+995555000002',
    ]);
  });

  it('returns the collapsed rows, and `shown` counts what is really there', async () => {
    mockMembers.mockResolvedValue([member(1, true), member(2, false), member(3, false)] as never);
    mockCollapse.mockImplementation(async (rows) => ({
      rows: [{ ...rows[0], also_known_numbers: 1 }, rows[2]],
      collapsed: 1,
    }));

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.results).toHaveLength(2);
    expect(out.shown).toBe(2);
    expect(out.results[0].also_known_numbers).toBe(1);
  });

  /**
   * `count` is everybody who matched BEFORE the cap and before the collapse.
   * It answers "how big is this group", which the collapse does not change —
   * and conflating the two is how `count: 50` came to mean a ceiling.
   */
  it('leaves `count` alone: it answers a different question from `shown`', async () => {
    mockMembers.mockResolvedValue([member(1, true), member(2, false)] as never);
    mockCollapse.mockImplementation(async (rows) => ({ rows: [rows[0]], collapsed: 1 }));

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(2);
    expect(out.shown).toBe(1);
  });

  it('collapses AFTER the cap, so a reachable member is never the one dropped', async () => {
    // 51 people, the Netai user last in the source order: the cap must have
    // already pulled them to the front by the time the collapse sees the list.
    const many = [...Array(50).keys()].map((i) => member(i + 1, false));
    mockMembers.mockResolvedValue([...many, member(99, true)] as never);

    await searchRoster(USER, 'Axel');

    const passed = mockCollapse.mock.calls[0][0] as { phone: string; is_member: boolean }[];
    expect(passed).toHaveLength(50);
    expect(passed[0].is_member).toBe(true);
  });
});
