import type { RosterMember } from '../roster.service';
import { exportPhoneHash } from './exportHash';
import type { CsvValue } from './csv';
import {
  ALIAS_BACKFILL_AT,
  type AccountRow,
  type MemberActivity,
  type OwnerContactValue,
  type PhonebookRow,
} from './axelData';
import { phoneDigits } from '../phone';

/**
 * Parts A and D of the Axel export: one row per roster member, and one row of
 * counts over each member's phonebook. Pure — the reads are in axelData.ts.
 */
export type AccountState = 'netai_user' | 'ally_account' | 'none';

const WARM_TIERS = new Set(['green', 'blue']);
const WARM_LEGACY = new Set(['allies', 'loyal']);
export const LEGACY_COLOURS = ['allies', 'loyal', 'connections', 'contacts'] as const;
export const TIERS = ['green', 'blue', 'yellow', 'red'] as const;

export interface MemberInputs {
  readonly roster: readonly RosterMember[];
  readonly accounts: ReadonlyMap<number, AccountRow>;
  readonly activity: ReadonlyMap<number, MemberActivity>;
  readonly phonebooks: readonly PhonebookRow[];
  readonly tags: readonly OwnerContactValue[];
  readonly scores: readonly OwnerContactValue[];
  readonly tiers: readonly OwnerContactValue[];
  readonly legacy: readonly OwnerContactValue[];
  readonly statedClose: readonly OwnerContactValue[];
  readonly digitsWithFacts: ReadonlySet<string>;
  readonly accountsByDigits: ReadonlyMap<string, { user_id: number; netai_user: boolean }>;
}

const iso = (d: Date | null | undefined): string => (d ? new Date(d).toISOString() : '');

export function accountState(account: AccountRow | undefined): AccountState {
  if (account === undefined || account.deleted_at !== null) return 'none';
  return account.netai_user ? 'netai_user' : 'ally_account';
}

/** owner → contact digits → values, for one per-owner table. */
export function byOwner(rows: readonly OwnerContactValue[]): Map<number, Map<string, string[]>> {
  const out = new Map<number, Map<string, string[]>>();
  for (const r of rows) {
    const contacts = out.get(r.owner_id) ?? new Map<string, string[]>();
    contacts.set(r.contact_digits, [...(contacts.get(r.contact_digits) ?? []), r.value]);
    out.set(r.owner_id, contacts);
  }
  return out;
}

/** Roster members in a stable order (by hash), each with its roster key. */
export function keyedRoster(roster: readonly RosterMember[]): { key: number; m: RosterMember }[] {
  return [...roster]
    .map((m) => ({ m, hash: exportPhoneHash(m.phone) }))
    .sort((a, b) => a.hash.localeCompare(b.hash))
    .map(({ m }, i) => ({ key: i + 1, m }));
}

function phonebookSummary(rows: readonly PhonebookRow[]): Record<string, CsvValue> {
  const contacts = new Set(rows.map((r) => r.contact_digits));
  const realDates = rows
    .map((r) => r.saved_at)
    .filter((d): d is Date => d !== null && new Date(d).toISOString() !== ALIAS_BACKFILL_AT)
    .map((d) => new Date(d).getTime());
  return {
    phonebook_shared: contacts.size > 0,
    phonebook_contacts: contacts.size,
    phonebook_first_dated_save:
      realDates.length > 0 ? new Date(Math.min(...realDates)).toISOString() : '',
  };
}

export function memberRow(
  key: number,
  m: RosterMember,
  inputs: MemberInputs,
  own: readonly PhonebookRow[],
): Record<string, CsvValue> {
  const account = m.user_id === null ? undefined : inputs.accounts.get(m.user_id);
  const act = m.user_id === null ? undefined : inputs.activity.get(m.user_id);
  return {
    roster_key: key,
    member_hash: exportPhoneHash(m.phone),
    user_id: m.user_id ?? '',
    account_found: account !== undefined,
    account_found_by: account !== undefined ? 'phone_number' : '',
    account_state: accountState(account),
    registered_at: iso(account?.created_at),
    last_active_at: iso(account?.last_active),
    subscription_status: account?.subscription_status ?? '',
    ...phonebookSummary(own),
    is_axel_member: true,
    ask_opted_out: act?.ask_opted_out ?? '',
    blocks_set: act?.blocks_set ?? '',
    asks_sent_24h: act?.asks_sent_24h ?? '',
    asks_received_24h: act?.asks_received_24h ?? '',
    asks_sent_total: act?.asks_sent_total ?? '',
    asks_received_total: act?.asks_received_total ?? '',
    open_goals: act?.open_goals ?? '',
    needs_noted: act?.needs_noted ?? '',
    profile_answers: act?.profile_answers ?? '',
    own_job_position: account?.job_position ?? '',
    own_employer: account?.employer ?? '',
    own_city: account?.city ?? '',
    facts_on_own_number: inputs.digitsWithFacts.has(phoneDigits(m.phone)),
  };
}

function countWhere(contacts: ReadonlySet<string>, test: (d: string) => boolean): number {
  let n = 0;
  for (const d of contacts) if (test(d)) n += 1;
  return n;
}

function colourCounts(
  contacts: ReadonlySet<string>,
  values: Map<string, string[]> | undefined,
  names: readonly string[],
  prefix: string,
): Record<string, CsvValue> {
  const out: Record<string, CsvValue> = {};
  for (const name of names) {
    out[`${prefix}_${name}`] = countWhere(contacts, (d) => (values?.get(d) ?? []).includes(name));
  }
  return out;
}

export interface OwnerIndex {
  readonly tags: Map<number, Map<string, string[]>>;
  readonly scores: Map<number, Map<string, string[]>>;
  readonly tiers: Map<number, Map<string, string[]>>;
  readonly legacy: Map<number, Map<string, string[]>>;
  readonly statedClose: Map<number, Map<string, string[]>>;
}

export function ownerIndex(inputs: MemberInputs): OwnerIndex {
  return {
    tags: byOwner(inputs.tags),
    scores: byOwner(inputs.scores),
    tiers: byOwner(inputs.tiers),
    legacy: byOwner(inputs.legacy),
    statedClose: byOwner(inputs.statedClose),
  };
}

/** The confirmed warm tie (chorusCap.confirmedWarmTieSql): green/blue tier, allies/loyal, or stated close. */
export function isWarm(owner: number, digits: string, idx: OwnerIndex): boolean {
  const tiers = idx.tiers.get(owner)?.get(digits) ?? [];
  const legacy = idx.legacy.get(owner)?.get(digits) ?? [];
  return (
    tiers.some((t) => WARM_TIERS.has(t)) ||
    legacy.some((c) => WARM_LEGACY.has(c)) ||
    (idx.statedClose.get(owner)?.has(digits) ?? false)
  );
}

export function aggregateRow(
  key: number,
  m: RosterMember,
  inputs: MemberInputs,
  own: readonly PhonebookRow[],
  idx: OwnerIndex,
  axelDigits: ReadonlySet<string>,
): Record<string, CsvValue> {
  const owner = m.user_id ?? -1;
  const contacts = new Set(own.map((r) => r.contact_digits));
  const accountOf = (d: string): { netai_user: boolean } | undefined =>
    inputs.accountsByDigits.get(d);
  return {
    roster_key: key,
    member_hash: exportPhoneHash(m.phone),
    contacts_total: contacts.size,
    contacts_tagged: countWhere(contacts, (d) => idx.tags.get(owner)?.has(d) ?? false),
    contacts_with_facts: countWhere(contacts, (d) => inputs.digitsWithFacts.has(d)),
    contacts_with_relationship_score: countWhere(
      contacts,
      (d) => idx.scores.get(owner)?.has(d) ?? false,
    ),
    contacts_warm: countWhere(contacts, (d) => isWarm(owner, d, idx)),
    ...colourCounts(contacts, idx.tiers.get(owner), TIERS, 'tier'),
    ...colourCounts(contacts, idx.legacy.get(owner), LEGACY_COLOURS, 'legacy'),
    contacts_netai_users: countWhere(contacts, (d) => accountOf(d)?.netai_user === true),
    contacts_old_ally_accounts: countWhere(contacts, (d) => accountOf(d)?.netai_user === false),
    contacts_no_account: countWhere(contacts, (d) => accountOf(d) === undefined),
    contacts_axel_members: countWhere(contacts, (d) => axelDigits.has(d)),
  };
}

export const MEMBER_COLUMNS = [
  'roster_key',
  'member_hash',
  'user_id',
  'account_found',
  'account_found_by',
  'account_state',
  'registered_at',
  'last_active_at',
  'subscription_status',
  'phonebook_shared',
  'phonebook_contacts',
  'phonebook_first_dated_save',
  'is_axel_member',
  'ask_opted_out',
  'blocks_set',
  'asks_sent_24h',
  'asks_received_24h',
  'asks_sent_total',
  'asks_received_total',
  'open_goals',
  'needs_noted',
  'profile_answers',
  'own_job_position',
  'own_employer',
  'own_city',
  'facts_on_own_number',
] as const;

export const AGGREGATE_COLUMNS = [
  'roster_key',
  'member_hash',
  'contacts_total',
  'contacts_tagged',
  'contacts_with_facts',
  'contacts_with_relationship_score',
  'contacts_warm',
  ...TIERS.map((t) => `tier_${t}`),
  ...LEGACY_COLOURS.map((c) => `legacy_${c}`),
  'contacts_netai_users',
  'contacts_old_ally_accounts',
  'contacts_no_account',
  'contacts_axel_members',
] as const;
