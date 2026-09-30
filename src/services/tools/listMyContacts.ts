import { query } from '../../db/postgres/client';
import { accountStateFor, AccountState, fetchAccountStates, isMemberPhone } from './membership';

/**
 * The seat's 864, item 7: „ask all six of my contacts at once" — and Netai
 * could not list the owner's own contacts. Plan v1 said „who I will ask:
 * nobody yet" and asked the owner to type the six names, then spent eight
 * search_contact_by_name calls finding them. Every search tool needs a word
 * to search for; none could answer „who is in my phonebook".
 *
 * The owner's OWN saved contacts only — their phonebook is theirs to see —
 * members first, because an ask can reach a member and nobody else. Capped,
 * with the true total, so a phonebook of a thousand is never read as ten.
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** How many distinct numbers are read before sorting; the total is counted separately. */
const SCAN_CAP = 2000;
const LIST_TIMEOUT_MS = 8_000;
const HAS_A_LETTER = /\p{L}/u;

export interface MyContact {
  readonly name: string | null;
  /** Set when the saved label has no letter in it (row 283) — say it as a label. */
  readonly saved_as?: string;
  readonly phone: string;
  readonly is_member: boolean;
  readonly account_state: AccountState;
}

export interface MyContactsList {
  readonly total: number;
  readonly members_total: number;
  readonly shown: number;
  readonly contacts: readonly MyContact[];
}

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function shapeName(label: string | null): Pick<MyContact, 'name' | 'saved_as'> {
  const trimmed = (label ?? '').trim();
  if (trimmed === '') return { name: null };
  return HAS_A_LETTER.test(trimmed) ? { name: trimmed } : { name: null, saved_as: trimmed };
}

export async function listMyContacts(
  userId: string,
  options: { readonly limit?: unknown; readonly membersOnly?: boolean } = {},
): Promise<MyContactsList> {
  const [rows, totalRow] = await Promise.all([
    query<{ phone: string; alias: string | null }>(
      `SELECT DISTINCT ON (phone) phone, alias
         FROM "UserAlias"
        WHERE "contactId" = $1 AND phone IS NOT NULL
        ORDER BY phone, LENGTH(COALESCE(alias, '')) DESC
        LIMIT $2`,
      [userId, SCAN_CAP],
      LIST_TIMEOUT_MS,
    ),
    query<{ total: string }>(
      `SELECT COUNT(DISTINCT phone) AS total FROM "UserAlias"
        WHERE "contactId" = $1 AND phone IS NOT NULL`,
      [userId],
      LIST_TIMEOUT_MS,
    ),
  ]);
  const states = await fetchAccountStates(rows.rows.map((r) => r.phone));
  const all: MyContact[] = rows.rows.map((r) => ({
    ...shapeName(r.alias),
    phone: r.phone,
    is_member: isMemberPhone(states, r.phone),
    account_state: accountStateFor(states, r.phone),
  }));
  const members = all.filter((c) => c.is_member);
  const byName = (a: MyContact, b: MyContact): number =>
    (a.name ?? a.saved_as ?? '').localeCompare(b.name ?? b.saved_as ?? '');
  const ordered = options.membersOnly
    ? [...members].sort(byName)
    : [...members.sort(byName), ...all.filter((c) => !c.is_member).sort(byName)];
  const contacts = ordered.slice(0, clampLimit(options.limit));
  return {
    total: Number(totalRow.rows[0]?.total ?? 0),
    members_total: members.length,
    shown: contacts.length,
    contacts,
  };
}
