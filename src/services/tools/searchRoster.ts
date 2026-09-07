import { filterRoster, isOnRoster, rosterMembers, RosterMember } from '../roster.service';

/**
 * Find a fellow member of a named network to write to (Ticket 10 Task 23,
 * D121) — the one search that reaches past the user's own phonebook.
 *
 * Only for somebody who is on the roster themselves: membership is the
 * licence to approach a member's assistant without acquaintance, and a
 * non-member gets nothing but the reason. Only members who have used Netai
 * are returned as reachable; an old-Ally account on the roster is shown as a
 * person to invite, never to ask (D103).
 */

const RESULT_LIMIT = 50;

export interface RosterSearchRow {
  phone: string;
  name: string | null;
  group: string;
  is_member: boolean;
  account_state: 'netai_user' | 'ally_account' | 'none';
  /** Shows the ask route only for a Netai user; the invite route otherwise. */
  route: 'ask_contact' | 'invite_contact';
}

export type RosterSearchOutcome =
  | { found: true; group: string; count: number; results: RosterSearchRow[] }
  | {
      found: false;
      group: string;
      reason: 'not_on_roster' | 'no_match' | 'no_group';
      note: string;
    };

export async function searchRoster(
  userId: string,
  group: string,
  nameQuery = '',
): Promise<RosterSearchOutcome> {
  const trimmed = group.trim();
  if (!trimmed) {
    return { found: false, group, reason: 'no_group', note: 'Name the network — e.g. "Axel".' };
  }
  if (!(await isOnRoster(userId, trimmed))) {
    return {
      found: false,
      group: trimmed,
      reason: 'not_on_roster',
      note:
        `The user is not on the ${trimmed} roster, so membership opens no door here. Their own ` +
        'contacts are reachable as always; anyone else through a mutual acquaintance.',
    };
  }
  const members = await rosterMembers(trimmed);
  const matched = filterRoster(members, nameQuery)
    .filter((m) => m.user_id === null || String(m.user_id) !== userId)
    .slice(0, RESULT_LIMIT);
  if (matched.length === 0) {
    return {
      found: false,
      group: trimmed,
      reason: 'no_match',
      note: 'Nobody on the roster matches.',
    };
  }
  return {
    found: true,
    group: trimmed,
    count: matched.length,
    results: matched.map(toRow),
  };
}

function toRow(m: RosterMember): RosterSearchRow {
  const state: RosterSearchRow['account_state'] =
    m.user_id === null ? 'none' : m.on_netai ? 'netai_user' : 'ally_account';
  return {
    phone: m.phone,
    name: m.name,
    group: m.group,
    is_member: m.on_netai,
    account_state: state,
    route: m.on_netai ? 'ask_contact' : 'invite_contact',
  };
}
