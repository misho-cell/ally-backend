import { query } from '../../db/postgres/client';
import { phoneDigits } from '../phone';
import { readInputs } from './axelExport.service';
import { readAccountsByDigits, readPhonebooks, readTiers } from './axelData';
import { exportPhoneHash } from './exportHash';
import { byOwner, isWarm, keyedRoster, MemberInputs, ownerIndex } from './memberFiles';

/**
 * The CELA list (Tornike, 19 Oct; Misho's word): numbers from outside the base,
 * matched against it the way the Axel export reads it — the same hash, the
 * same roster keys, the same „warm" — and returned with no number in them.
 * Read only.
 */
const READ_TIMEOUT_MS = 20_000;
const TORNIKE_USER_ID = 501;
const LIST_SEPARATOR = ';';
const LABEL_SEPARATOR = ' | ';

export interface OutsideNumber {
  readonly ref: string;
  readonly phone: string;
}

export interface OutsideMatch {
  readonly our_row_id: string;
  readonly contact_hash: string;
  readonly account_state: 'netai_user' | 'ally_account' | 'none';
  readonly user_id: number | '';
  readonly saved_by_count: number;
  readonly saved_by_axel_members: string;
  readonly labels: string;
  readonly tornike_label: string;
  readonly tornike_tier: string;
  readonly warm_members: string;
  readonly note: string;
}

async function phonebooksHolding(digits: readonly string[]): Promise<Map<string, number>> {
  const result = await query<{ digits: string; owners: number }>(
    `SELECT regexp_replace(phone, '\\D', '', 'g') AS digits, COUNT(DISTINCT "contactId")::int AS owners
       FROM "UserAlias"
      WHERE regexp_replace(phone, '\\D', '', 'g') = ANY($1::text[])
      GROUP BY 1`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.digits, r.owners]));
}

async function accountsOnNumber(digits: readonly string[]): Promise<Map<string, number>> {
  const result = await query<{ digits: string; accounts: number }>(
    `SELECT regexp_replace(up.phone, '\\D', '', 'g') AS digits, COUNT(DISTINCT u.id)::int AS accounts
       FROM "UserPhone" up JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE regexp_replace(up.phone, '\\D', '', 'g') = ANY($1::text[])
      GROUP BY 1`,
    [digits],
    READ_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.digits, r.accounts]));
}

function joined(values: readonly (string | number)[], separator: string): string {
  return [...new Set(values.map(String))].join(separator);
}

function axelSide(
  d: string,
  members: MemberInputs,
  keyByUser: ReadonlyMap<number, number>,
): { readonly keys: string; readonly labels: string; readonly warm: string } {
  const rows = members.phonebooks.filter((r) => r.contact_digits === d);
  const idx = ownerIndex(members);
  const owners = [...new Set(rows.map((r) => r.owner_id))];
  const keyOf = (owner: number): number | string => keyByUser.get(owner) ?? `user ${owner}`;
  return {
    keys: joined(owners.map(keyOf), LIST_SEPARATOR),
    labels: joined(
      rows.map((r) => r.label?.trim() ?? '').filter((l) => l !== ''),
      LABEL_SEPARATOR,
    ),
    warm: joined(owners.filter((o) => isWarm(o, d, idx)).map(keyOf), LIST_SEPARATOR),
  };
}

export async function matchOutsideNumbers(
  numbers: readonly OutsideNumber[],
): Promise<OutsideMatch[]> {
  const digits = [...new Set(numbers.map((n) => phoneDigits(n.phone)).filter((d) => d !== ''))];
  const [members, accounts, holders, accountCounts, tornikeBook, tornikeTiers] = await Promise.all([
    readInputs(),
    readAccountsByDigits(digits),
    phonebooksHolding(digits),
    accountsOnNumber(digits),
    readPhonebooks([TORNIKE_USER_ID]),
    readTiers([TORNIKE_USER_ID]),
  ]);
  const keyByUser = new Map(
    keyedRoster(members.roster)
      .filter(({ m }) => m.user_id !== null)
      .map(({ key, m }) => [m.user_id as number, key]),
  );
  const tiers = byOwner(tornikeTiers).get(TORNIKE_USER_ID) ?? new Map<string, string[]>();
  return numbers.map((n) => {
    const d = phoneDigits(n.phone);
    const account = accounts.get(d);
    const axel = axelSide(d, members, keyByUser);
    const many = (accountCounts.get(d) ?? 0) > 1;
    return {
      our_row_id: n.ref,
      contact_hash: exportPhoneHash(d),
      account_state:
        account === undefined ? 'none' : account.netai_user ? 'netai_user' : 'ally_account',
      user_id: account?.user_id ?? '',
      saved_by_count: holders.get(d) ?? 0,
      saved_by_axel_members: axel.keys,
      labels: axel.labels,
      tornike_label: joined(
        tornikeBook.filter((r) => r.contact_digits === d).map((r) => r.label?.trim() ?? ''),
        LABEL_SEPARATOR,
      ),
      tornike_tier: joined(tiers.get(d) ?? [], LIST_SEPARATOR),
      warm_members: axel.warm,
      note: many ? `${accountCounts.get(d)} accounts on this number; the oldest is given` : '',
    };
  });
}
