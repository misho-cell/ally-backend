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
   * `count` COUNTS PEOPLE, and that is the seat's correction of my first
   * version an hour after it shipped. Folding after the cap returned 49 rows
   * under `count: 107` with a note still saying „only 50 are here" — a count
   * of rows wearing the name of a count of people, which is the exact fault
   * the `count` comment in that file was written about.
   */
  it('counts people, not rows: a folded pair is one', async () => {
    mockMembers.mockResolvedValue([member(1, true), member(2, false)] as never);
    mockCollapse.mockImplementation(async (rows) => ({ rows: [rows[0]], collapsed: 1 }));

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(1);
    expect(out.shown).toBe(1);
  });

  it('folds BEFORE the cap, and the Netai ordering happens before the fold', async () => {
    // 51 people, the only Netai user last in the source order. The fold must
    // see them FIRST, because the fold keeps the first row of each person —
    // that ordering is what makes folding early safe.
    const many = [...Array(50).keys()].map((i) => member(i + 1, false));
    mockMembers.mockResolvedValue([...many, member(99, true)] as never);

    await searchRoster(USER, 'Axel');

    const passed = mockCollapse.mock.calls[0][0] as { phone: string; is_member: boolean }[];
    expect(passed).toHaveLength(51);
    expect(passed[0].is_member).toBe(true);
  });

  /**
   * The three numbers have to agree or one of them is lying. This is the
   * assertion that would have caught what the seat caught.
   */
  it('the count, the rows and the sentence all say the same thing', async () => {
    const many = [...Array(60).keys()].map((i) => member(i + 1, false));
    mockMembers.mockResolvedValue(many as never);
    // One pair folds away: 60 people become 59.
    mockCollapse.mockImplementation(async (rows) => ({ rows: rows.slice(1), collapsed: 1 }));

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(59);
    expect(out.shown).toBe(50);
    expect(out.results).toHaveLength(50);
    expect(out.note).toContain('59 people');
    expect(out.note).toContain('only 50 are');
  });

  it('says nothing about being incomplete when the fold makes it complete', async () => {
    // 51 people, one of whom is a second number: 50 remain, which fits.
    const many = [...Array(51).keys()].map((i) => member(i + 1, false));
    mockMembers.mockResolvedValue(many as never);
    mockCollapse.mockImplementation(async (rows) => ({ rows: rows.slice(1), collapsed: 1 }));

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(50);
    expect(out.shown).toBe(50);
    expect(out.note).toBeUndefined();
  });
});
