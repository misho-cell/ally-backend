import { csvRecords } from '../axelLoad/axelBasePlan';
import { nameKey } from '../tools/transliterate';

/**
 * #7758 (the founder's word via the tester; Misho's yes, 29 Oct): „same
 * community" means CURRENT members only. A community's own list says who is
 * current and who is former; the roster carries a current member as
 * `member_of` and a former one as an „(former member)" affiliation, which the
 * community routes do not read (ownerHolders.ownerCommunityPhones). Pure: the
 * list's rows in, each person's key or name and status out.
 */
export enum MembershipStatus {
  Current = 'current',
  Former = 'former',
}

export interface MembershipRow {
  readonly personKey: string;
  readonly nameKey: string;
  readonly status: MembershipStatus;
}

const STATUSES: ReadonlyMap<string, MembershipStatus> = new Map([
  ['current', MembershipStatus.Current],
  ['c', MembershipStatus.Current],
  ['former', MembershipStatus.Former],
  ['f', MembershipStatus.Former],
]);

/** Pure: the rows for one community; another community's rows and unreadable ones are counted. */
export function membershipRows(
  csv: string,
  community: string,
): { rows: MembershipRow[]; skipped: Record<string, number> } {
  const rows: MembershipRow[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const wanted = community.trim().toLowerCase();
  for (const r of csvRecords(csv)) {
    const status = STATUSES.get((r.status ?? r.current_former ?? '').trim().toLowerCase());
    const personKey = (r.person_key ?? '').trim();
    const name = nameKey(r.name ?? r.person_name ?? '');
    if ((r.community ?? '').trim().toLowerCase() !== wanted) skip('other_community');
    else if (status === undefined) skip('no_status');
    else if (personKey === '' && name === '') skip('no_person');
    else rows.push({ personKey, nameKey: name, status });
  }
  return { rows, skipped };
}
