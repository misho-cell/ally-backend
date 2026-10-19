import { query } from '../../db/postgres/client';
import { accountStateFor, AccountState, fetchAccountStates, isMemberPhone } from './membership';
import { isWarmTie, OwnerTie, OwnerTieReason, ownerTiesTo } from '../ownerTies';
import { phoneDigits } from '../phone';

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
/** A label list, not a profile: the owner's first few tags say what the person does. */
const MAX_OWN_TAGS = 5;

export interface MyContact {
  readonly name: string | null;
  /** Set when the saved label has no letter in it (row 283) — say it as a label. */
  readonly saved_as?: string;
  readonly phone: string;
  readonly is_member: boolean;
  readonly account_state: AccountState;
  /**
   * #5579 (the tester, 18 Oct): the owner's own tags on this number. Asked to
   * list contacts „with what they do", two of three runs said „unknown" for
   * five contacts that each carried a saved tag (იურისტი, ექიმი…), because this
   * list read only the saved name. The tag is what the owner knows them by.
   */
  readonly your_tags?: readonly string[];
  /** #5974 (68852): the owner's own closeness to them — said close, family, or close. */
  readonly your_tie?: OwnerTieReason;
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

/** The owner's own tags for the numbers shown, a few per number. */
async function ownTagsFor(
  userId: string,
  phones: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; tags: string[] | null }>(
    `SELECT phone, (array_agg(DISTINCT TRIM(tag) ORDER BY TRIM(tag)))[1:$3] AS tags
       FROM "UserTags"
      WHERE "contactId" = $1 AND phone = ANY($2::text[]) AND NULLIF(TRIM(tag), '') IS NOT NULL
      GROUP BY phone`,
    [userId, [...phones], MAX_OWN_TAGS],
    LIST_TIMEOUT_MS,
  );
  return new Map(result.rows.map((row) => [row.phone, row.tags ?? []]));
}

function withOwnTags(contact: MyContact, tags: ReadonlyMap<string, readonly string[]>): MyContact {
  const own = tags.get(contact.phone) ?? [];
  return own.length === 0 ? contact : { ...contact, your_tags: own };
}

/**
 * #5974 (the tester's 68852/68855, 0 of 9): three owners told Netai „X, Y and
 * Z are my closest friends" — saved, and the route to a target picked them
 * 3 of 3 — yet „who are my closest people?" listed every contact by name and
 * asked „who would you put first?". This list never read the owner's ties.
 * The people the owner is closest to now come first, closest first, each
 * marked with why; everyone else keeps the order they had.
 */
const TIE_RANK: Readonly<Partial<Record<OwnerTieReason, number>>> = {
  [OwnerTieReason.SaidClose]: 3,
  [OwnerTieReason.Family]: 2,
  [OwnerTieReason.Close]: 1,
};

export function warmTieOf(tie: OwnerTie | undefined): OwnerTieReason | null {
  return tie !== undefined && tie.reason !== null && isWarmTie(tie.reason) ? tie.reason : null;
}

/** The warmly tied first, closest first; the rest in the order given. */
export function closestFirst(
  contacts: readonly MyContact[],
  ties: ReadonlyMap<string, OwnerTie>,
): MyContact[] {
  const marked = contacts.map((contact, index) => {
    const tie = warmTieOf(ties.get(phoneDigits(contact.phone)));
    return { contact: tie === null ? contact : { ...contact, your_tie: tie }, tie, index };
  });
  const rank = (tie: OwnerTieReason | null): number => (tie === null ? 0 : (TIE_RANK[tie] ?? 0));
  return marked
    .sort((a, b) => rank(b.tie) - rank(a.tie) || a.index - b.index)
    .map(({ contact }) => contact);
}

/** The owner's ties to these numbers; none when they cannot be read. */
async function tiesOrNone(
  userId: string,
  phones: readonly string[],
): Promise<ReadonlyMap<string, OwnerTie>> {
  try {
    return await ownerTiesTo(userId, phones);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[list-my-contacts] ties not read:', (err as Error).message);
    return new Map();
  }
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
  const ties = await tiesOrNone(
    userId,
    all.map((c) => c.phone),
  );
  const ordered = closestFirst(
    options.membersOnly
      ? [...members].sort(byName)
      : [...members.sort(byName), ...all.filter((c) => !c.is_member).sort(byName)],
    ties,
  );
  const page = ordered.slice(0, clampLimit(options.limit));
  const tags = await ownTagsFor(
    userId,
    page.map((c) => c.phone),
  );
  const contacts = page.map((c) => withOwnTags(c, tags));
  return {
    total: Number(totalRow.rows[0]?.total ?? 0),
    members_total: members.length,
    shown: contacts.length,
    contacts,
  };
}
