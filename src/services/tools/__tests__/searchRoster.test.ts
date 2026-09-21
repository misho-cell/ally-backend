jest.mock('../../roster.service', () => ({
  __esModule: true,
  rosterMembers: jest.fn(),
  isOnRoster: jest.fn(),
  filterRoster: jest.fn(),
}));

import { rosterMembers, isOnRoster, filterRoster } from '../../roster.service';
import { searchRoster } from '../searchRoster';

const mockMembers = rosterMembers as jest.MockedFunction<typeof rosterMembers>;
const mockOnRoster = isOnRoster as jest.MockedFunction<typeof isOnRoster>;
const mockFilter = filterRoster as jest.MockedFunction<typeof filterRoster>;

const USER = '501';

/** A roster row, minimal: only the fields this tool reads. */
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

function roster(total: number, netaiAt: number[] = []): unknown[] {
  return Array.from({ length: total }, (_, i) => member(i, netaiAt.includes(i)));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnRoster.mockResolvedValue(true);
});

/**
 * The seat's 365 and 366, measured on the founder's own group.
 *
 * `search_roster` is the ONE tool that reaches past a person's own contacts —
 * a shared roster is the licence to approach a stranger's assistant. Asked for
 * Axel with no filter it answered `count: 50` with fifty rows and nothing
 * saying more existed. Asked again with `name: "a"`, a letter in nearly every
 * name on the list, it returned the same fifty. Asked with `name: "Giorgi"` it
 * returned sixteen, and TEN of those sixteen were not among the fifty.
 *
 * So the filter runs before the cap, the fifty are not „the first fifty of the
 * group", and a model reading `count: 50` tells the owner in good faith that
 * Axel has fifty members. `get_network_stats` says 84 contacts on that account
 * carry the tag — two numbers for one group, and the smaller was the confident
 * one.
 *
 * Two of the people the cap hid were Netai users.
 */
describe('the roster cap stops lying about the total', () => {
  it('counts everybody who matched, not the rows that survived the cap', async () => {
    const all = roster(60);
    mockMembers.mockResolvedValue(all as never);
    mockFilter.mockReturnValue(all as never);

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(60);
    expect(out.shown).toBe(50);
    expect(out.results).toHaveLength(50);
  });

  it('says in words that the list is incomplete, because a round number is not a signal', async () => {
    const all = roster(60);
    mockMembers.mockResolvedValue(all as never);
    mockFilter.mockReturnValue(all as never);

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.note).toContain('INCOMPLETE');
    expect(out.note).toContain('60');
  });

  it('adds no note when nothing was dropped', async () => {
    const all = roster(12);
    mockMembers.mockResolvedValue(all as never);
    mockFilter.mockReturnValue(all as never);

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.count).toBe(12);
    expect(out.shown).toBe(12);
    expect(out.note).toBeUndefined();
  });

  /**
   * The heart of it. A Netai user is the only person on a roster who can be
   * reached through their own assistant; dropping one does not cost a row in a
   * list, it costs the warm route — which is the whole reason this tool exists.
   * Two were hidden on the live Axel roster, found only by a name filter.
   */
  it('never drops a Netai user to make room for somebody unreachable', async () => {
    // The two members sit at the far end, well past the cap.
    const all = roster(60, [57, 59]);
    mockMembers.mockResolvedValue(all as never);
    mockFilter.mockReturnValue(all as never);

    const out = await searchRoster(USER, 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    const members = out.results.filter((r) => r.is_member);
    expect(members).toHaveLength(2);
    // And they lead, so a truncated read still sees them first.
    expect(out.results[0].is_member).toBe(true);
    expect(out.results[1].is_member).toBe(true);
    expect(out.results.every((r) => r.is_member || r.route === 'invite_contact')).toBe(true);
  });

  it('leaves the asker out of their own roster answer', async () => {
    const all = roster(3, [1]);
    mockMembers.mockResolvedValue(all as never);
    mockFilter.mockReturnValue(all as never);

    const out = await searchRoster('900001', 'Axel');

    expect(out.found).toBe(true);
    if (!out.found) return;
    expect(out.results.some((r) => r.phone === '+995555000001')).toBe(false);
  });
});

/**
 * Row 234 — the descriptions were fixed and the DATA was not.
 *
 * The seat read a live roster page on 21 September, hours after dd8f05c: nine
 * members of nine carrying `route: "ask_contact"`, while the tool's own
 * description said an introduction never goes through ask_contact. Their
 * sentence is the lesson and it is worth keeping in a test: **the response is
 * read at the moment the model picks its next call, so it wins over the
 * description.** Fixing the text and leaving the field fixes the half nobody
 * obeys — the same shape as the guard that lived in the chat tool while the
 * mediator pressed the app's button.
 */
describe('the row says what the description says', () => {
  it('sends a member to request_introduction, never to ask_contact alone', async () => {
    const out = await searchRoster(USER, 'Axel');
    if (!out.found) throw new Error('expected a roster');
    for (const row of out.results.filter((r) => r.is_member)) {
      expect(row.route).toBe('request_introduction');
    }
  });

  /**
   * And it does not lose the question case by choosing. One scalar cannot be
   * honest here: the row does not know whether the user wants to MEET this
   * person or to ASK them something, so it states both and chooses neither.
   */
  it('still offers ask_contact for a member, as a separate named field', async () => {
    const out = await searchRoster(USER, 'Axel');
    if (!out.found) throw new Error('expected a roster');
    for (const row of out.results.filter((r) => r.is_member)) {
      expect(row.ask_route).toBe('ask_contact');
    }
  });

  it('gives a non-member no ask route at all — nothing reaches them', async () => {
    const out = await searchRoster(USER, 'Axel');
    if (!out.found) throw new Error('expected a roster');
    for (const row of out.results.filter((r) => !r.is_member)) {
      expect(row.route).toBe('invite_contact');
      expect(row.ask_route).toBeUndefined();
    }
  });
});
