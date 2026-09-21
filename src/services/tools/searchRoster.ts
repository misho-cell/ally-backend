import { filterRoster, isOnRoster, rosterMembers, RosterMember } from '../roster.service';
import { collapseMergedPhones } from './mergedIdentities';

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
  /**
   * How to REACH this person — row 234, and the reason it is two fields now.
   *
   * It used to be one scalar reading `ask_contact` for every member, and on
   * 21 September the seat read a live page: nine members of nine, all
   * `ask_contact`, hours after the descriptions had been rewritten to say that
   * an introduction never goes through `ask_contact`. Their point is the whole
   * lesson: **the response is read at the moment the model picks its next
   * call, so it wins over the description.** Fixing the sentence and leaving
   * the data is fixing the half nobody obeys.
   *
   * One scalar cannot be honest here, because the row does not know what the
   * user wants. To MEET this person is an introduction; to ASK them something
   * is a question. So the row states both facts and chooses neither.
   */
  route: 'request_introduction' | 'invite_contact';
  /** Present only for a member: the route if the user wants to ASK, not meet. */
  ask_route?: 'ask_contact';
  /** Set when other numbers of this same person folded into this row. */
  also_known_numbers?: number;
  /** The sentence that goes with that count, so it is not read as two people. */
  same_person_note?: string;
}

export type RosterSearchOutcome =
  | {
      found: true;
      group: string;
      /** EVERYBODY who matched, before the cap — not the number of rows below. */
      count: number;
      /** How many rows are actually here. Equal to `count` unless capped. */
      shown: number;
      /** Present only when rows were dropped, and it says so in words. */
      note?: string;
      results: RosterSearchRow[];
    }
  | {
      found: false;
      group: string;
      reason: 'not_on_roster' | 'no_match' | 'no_group' | 'roster_not_loaded';
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
  // Ticket 11 Task 12 (g): a network nobody is recorded as a member of is a
  // roster that has not been loaded — a different answer from „you are not on
  // it", and the one that says whether the founder's list has landed.
  const members = await rosterMembers(trimmed);
  if (members.length === 0) {
    return {
      found: false,
      group: trimmed,
      reason: 'roster_not_loaded',
      note:
        `No roster for „${trimmed}" is loaded — no public member_of facts name it. Until the ` +
        'list is loaded, membership opens no door here; the user’s own contacts are reachable as always.',
    };
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
  const everyone = filterRoster(members, nameQuery).filter(
    (m) => m.user_id === null || String(m.user_id) !== userId,
  );
  /**
   * NETAI USERS SURVIVE THE CAP. The seat's 365: the unfiltered Axel roster
   * returned fifty rows carrying three Netai users, and one name filter
   * surfaced two more the cap had dropped — George Simongulashvili and Giorgi
   * Abramishvili, both `is_member: true`.
   *
   * A Netai user is the only person on a roster who can be reached through
   * their own assistant. Dropping one does not cost a row in a list, it costs
   * the warm route, which is the entire reason this tool reaches past the
   * user's own contacts. So they are ordered first and the cap falls on the
   * people a cap can afford to fall on.
   */
  const netaiFirst = [
    ...everyone.filter((m) => m.on_netai),
    ...everyone.filter((m) => !m.on_netai),
  ];
  if (netaiFirst.length === 0) {
    return {
      found: false,
      group: trimmed,
      reason: 'no_match',
      note: 'Nobody on the roster matches.',
    };
  }
  /**
   * `count` WAS THE NUMBER OF ROWS AFTER THE CAP, and that is a ceiling
   * wearing the name of a total.
   *
   * The seat's 365 and 366, on the founder's own group: unfiltered Axel came
   * back `count: 50` with fifty rows and nothing saying more existed. Asked
   * again with `name: "a"` — a letter in nearly every name — it returned the
   * same fifty. Asked with `name: "Giorgi"` it returned sixteen, ten of whom
   * were not in the fifty. So the filter runs before the cap, the fifty are
   * not „the first fifty of the group", and an assistant reading `count: 50`
   * would tell the owner in good faith that Axel has fifty members.
   *
   * `get_network_stats` says 84 contacts on that account carry the tag `axel`.
   * Two numbers for one group, and the smaller one was the confident one.
   *
   * Now `count` is everybody who matched, `shown` is what is here, and a
   * truncated answer carries a sentence saying so — because a model cannot be
   * expected to infer a ceiling from a round number.
   *
   * AND SINCE 21 SEPTEMBER `count` COUNTS PEOPLE, NOT ROWS. The first version
   * of the fold below ran after the cap, so 49 rows came back under
   * `count: 107` and a note that still said „only 50 are here". The seat read
   * it within the hour. A count that says 107 for 49 rows is the same fault
   * this comment was written about, one layer along.
   */
  /**
   * ONE PERSON, ONE ROW — the last search that was still missing this.
   *
   * The seat, 21 September: on the founder's own Axel roster one man came back
   * as THREE rows — the same name, three contact refs, two `account_state:
   * none` and one `ally_account` — and the count read 107 for a list of about
   * a hundred people. `search_by_tag`, `search_contact_by_name` and
   * `search_second_degree` have all collapsed merged numbers since Ticket 16
   * Task 23; this one never did, and nobody noticed because the roster is the
   * search nobody runs.
   *
   * Measured on the live Axel roster the same evening: 108 rows, of which 9
   * carry a `person_identities` row and those 9 are 8 people — so this removes
   * one duplicate today and every pair the founder approves from now on.
   *
   * IT DOES NOT FIX THE ONE THE SEAT SAW, and saying so is the point. Those
   * three numbers are not merged; nobody has reviewed them. They are three
   * rows because the identity queue has 2,156 pairs waiting, not because this
   * search forgot to look. Collapsing here is right on its own terms and is
   * not that fix.
   *
   * BEFORE THE CAP, AND THE ORDER OF THOSE TWO IS THE WHOLE POINT. I ran it
   * after the cap first, reasoning that folding early could drop the reachable
   * row of a pair and keep the unreachable one. That danger is real and is
   * already answered one line above: the Netai-first ordering happens BEFORE
   * the fold, and the fold keeps the first row of each person, so the
   * reachable row is the one that survives. Folding after the cap bought
   * nothing and made the count a count of rows.
   */
  const folded = await collapseMergedPhones(netaiFirst.map(toRow));
  const shown = folded.rows.slice(0, RESULT_LIMIT);
  const people = folded.rows.length;
  const truncated = people > shown.length;
  return {
    found: true,
    group: trimmed,
    count: people,
    shown: shown.length,
    ...(truncated && {
      note:
        `${people} people on the ${trimmed} roster match and only ${shown.length} are ` +
        'here — this list is INCOMPLETE. Do not tell the user this is the whole group or quote ' +
        'the number of rows as a total. Narrow it with a `name` and ask again. Netai users are ' +
        'listed first, so the ones who can actually be asked are not the ones dropped.',
    }),
    results: shown,
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
    route: m.on_netai ? 'request_introduction' : 'invite_contact',
    ...(m.on_netai ? { ask_route: 'ask_contact' as const } : {}),
  };
}
