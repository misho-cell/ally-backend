import { query } from '../db/postgres/client';
import { normalizePhone, phoneDigits } from './phone';
import { isStaffUser, staffPhoneDigits } from './staff';

/**
 * The whole registered base as one file, one row per account (Ticket 10 Task 8;
 * Ticket 9 Task 1; Q-39).
 *
 * Every direct-side list so far ran on a 34,522-row sample exported by hand
 * on 30 August — about 1.4 % of the base, biased towards well-connected
 * people. The founder's rules need the two axes (known-to-many vs a real
 * networker), the exclusions (paying, staff, test, under 200 contacts,
 * registered-and-never-returned) and the fit signals (labels and public facts)
 * for EVERY account, so they can run without a database session.
 *
 * Streamed in batches: 62,000 rows with per-row subqueries over 8.4 million
 * alias rows would not finish. Each batch runs a handful of aggregate reads
 * keyed on the batch's ids and phones. No full phone number leaves: the last
 * four digits of one phone are the key for the founder's own review.
 */

const EXPORT_QUERY_TIMEOUT_MS = 60_000;
export const DEFAULT_BATCH = 500;
const MAX_BATCH = 2_000;
const LABEL_SAMPLE = 3;
const FIT_FACT_TYPES = ['occupation', 'role', 'employer', 'industry', 'link', 'headline'];
const NETAI_LIVE_STATUSES = ['active', 'trialing', 'past_due'];
const GEORGIA_CC = '995';
const GEORGIA_FULL_DIGITS = 12;

export const BASE_EXPORT_COLUMNS = [
  'account_id',
  'registered_at',
  'phone_last4',
  'phones',
  'contacts_imported',
  'old_ally_logins',
  'old_ally_last_login',
  'old_ally_paid',
  'old_ally_paid_at',
  'netai_threads',
  'netai_messages',
  'netai_searches',
  'netai_first_activity',
  'netai_last_activity',
  'subscription_tier',
  'subscription_status',
  'period_ends_at',
  'account_state',
  'netai_subscriber',
  'colour_sorted',
  'colour_counts',
  'reach_phonebooks',
  'distinct_labels',
  'label_sample',
  'job_title',
  'employer',
  'industry',
  'linkedin',
  'city',
  'country',
  'invite_cohort',
  'staff_or_test',
] as const;

export type BaseExportRow = Record<(typeof BASE_EXPORT_COLUMNS)[number], string>;

interface AccountRow {
  id: number;
  createdAt: string;
  lastLoginAt: string | null;
  boughtPremiumMapAt: string | null;
  cancelledPremiumMapAt: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
  current_period_ends_at: string | null;
  city: string | null;
  jobPosition: string | null;
  employer: string | null;
  linkedin: string | null;
  linkedinCountry: string | null;
  invite_cohort: string | null;
}

function iso(v: string | Date | null | undefined): string {
  if (v === null || v === undefined) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Every stored spelling of a number, so `phone = ANY(...)` stays index-friendly. */
function phoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone.trim()]);
  const digits = phoneDigits(phone);
  if (digits) {
    variants.add(normalizePhone(phone));
    variants.add(digits);
    if (digits.startsWith(GEORGIA_CC) && digits.length === GEORGIA_FULL_DIGITS) {
      const local = digits.slice(GEORGIA_CC.length);
      variants.add(local);
      variants.add(`0${local}`);
    }
  }
  variants.delete('');
  return [...variants];
}

async function idsAfter(lastId: number, limit: number): Promise<number[]> {
  const result = await query<{ id: number }>(
    `SELECT id FROM "User" WHERE "deletedAt" IS NULL AND id > $1 ORDER BY id LIMIT $2`,
    [lastId, limit],
    EXPORT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => Number(r.id));
}

interface BatchFacts {
  accounts: Map<number, AccountRow>;
  phones: Map<number, string[]>;
  contacts: Map<number, number>;
  logins: Map<number, { count: number; last: string | null }>;
  threads: Map<number, { count: number; first: string | null; last: string | null }>;
  messages: Map<number, number>;
  searches: Map<number, number>;
  colours: Map<number, string>;
  reach: Map<string, { reach: number; labels: number; sample: string[] }>;
  facts: Map<string, Map<string, string>>;
}

async function readBatch(ids: number[]): Promise<BatchFacts> {
  const [accounts, phones, contacts, logins, threads, messages, searches, colours] =
    await Promise.all([
      query<AccountRow>(
        `SELECT id, "createdAt", "lastLoginAt", "boughtPremiumMapAt", "cancelledPremiumMapAt",
                subscription_tier, subscription_status, current_period_ends_at,
                city, "jobPosition", employer, linkedin, "linkedinCountry", invite_cohort
         FROM "User" WHERE id = ANY($1)`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ userId: number; phones: string[] }>(
        `SELECT "userId", array_agg(phone ORDER BY id) AS phones
         FROM "UserPhone" WHERE "userId" = ANY($1) GROUP BY "userId"`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ contactId: number; n: string }>(
        `SELECT "contactId", COUNT(*) AS n FROM "UserAlias"
         WHERE "contactId" = ANY($1) GROUP BY "contactId"`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ userId: number; n: string; last: string | null }>(
        `SELECT "userId", COUNT(*) AS n, MAX("loginDate") AS last
         FROM "UserDailyLogin" WHERE "userId" = ANY($1) GROUP BY "userId"`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ user_id: number; n: string; first: string | null; last: string | null }>(
        `SELECT user_id, COUNT(*) AS n, MIN(created_at) AS first, MAX(updated_at) AS last
         FROM threads WHERE user_id = ANY($1) GROUP BY user_id`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ user_id: number; n: string }>(
        `SELECT user_id, COUNT(*) AS n FROM conversations
         WHERE user_id = ANY($1) AND role = 'user' GROUP BY user_id`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ user_id: string; n: string }>(
        `SELECT user_id, COUNT(*) AS n FROM search_activity
         WHERE user_id = ANY($1::text[]) GROUP BY user_id`,
        [ids.map(String)],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
      query<{ user_id: number; counts: string }>(
        `SELECT user_id, string_agg(tier || ':' || n, ' ' ORDER BY tier) AS counts
         FROM (SELECT user_id, tier, COUNT(*) AS n FROM human_relationship_tiers
               WHERE user_id = ANY($1) GROUP BY user_id, tier) t
         GROUP BY user_id`,
        [ids],
        EXPORT_QUERY_TIMEOUT_MS,
      ),
    ]);

  const phoneMap = new Map(phones.rows.map((r) => [Number(r.userId), r.phones]));
  const allPhones = [...phoneMap.values()].flat();
  const variants = [...new Set(allPhones.flatMap(phoneVariants))];
  const normalized = [...new Set(allPhones.map(normalizePhone))];

  const [reach, facts] = await Promise.all([
    variants.length === 0
      ? Promise.resolve({
          rows: [] as { phone: string; reach: string; labels: string; sample: string[] }[],
        })
      : query<{ phone: string; reach: string; labels: string; sample: string[] }>(
          `SELECT ua.phone, COUNT(DISTINCT ua."contactId") AS reach,
                  COUNT(DISTINCT ua.alias) AS labels,
                  (array_agg(DISTINCT ua.alias))[1:$2] AS sample
           FROM "UserAlias" ua WHERE ua.phone = ANY($1) GROUP BY ua.phone`,
          [variants, LABEL_SAMPLE],
          EXPORT_QUERY_TIMEOUT_MS,
        ),
    normalized.length === 0
      ? Promise.resolve({
          rows: [] as { neo4j_contact_id: string; field_type: string; value: string }[],
        })
      : query<{ neo4j_contact_id: string; field_type: string; value: string }>(
          `SELECT neo4j_contact_id, field_type, COALESCE(canonical_value, value) AS value
           FROM contact_facts
           WHERE neo4j_contact_id = ANY($1) AND is_public AND retracted_at IS NULL
             AND field_type = ANY($2::text[])`,
          [normalized, FIT_FACT_TYPES],
          EXPORT_QUERY_TIMEOUT_MS,
        ),
  ]);

  // Reach is summed across a person's spellings by digits, so two rows for one
  // number do not double count and one number in two spellings does not halve.
  const reachByDigits = new Map<string, { reach: number; labels: number; sample: string[] }>();
  for (const r of reach.rows) {
    const key = phoneDigits(r.phone);
    const current = reachByDigits.get(key) ?? { reach: 0, labels: 0, sample: [] };
    reachByDigits.set(key, {
      reach: current.reach + Number(r.reach),
      labels: current.labels + Number(r.labels),
      sample: [...current.sample, ...(r.sample ?? [])].slice(0, LABEL_SAMPLE),
    });
  }
  const factsByDigits = new Map<string, Map<string, string>>();
  for (const f of facts.rows) {
    const key = phoneDigits(f.neo4j_contact_id);
    const bucket = factsByDigits.get(key) ?? new Map<string, string>();
    if (!bucket.has(f.field_type)) bucket.set(f.field_type, f.value);
    factsByDigits.set(key, bucket);
  }

  return {
    accounts: new Map(accounts.rows.map((r) => [Number(r.id), r])),
    phones: phoneMap,
    contacts: new Map(contacts.rows.map((r) => [Number(r.contactId), Number(r.n)])),
    logins: new Map(
      logins.rows.map((r) => [Number(r.userId), { count: Number(r.n), last: r.last }]),
    ),
    threads: new Map(
      threads.rows.map((r) => [
        Number(r.user_id),
        { count: Number(r.n), first: r.first, last: r.last },
      ]),
    ),
    messages: new Map(messages.rows.map((r) => [Number(r.user_id), Number(r.n)])),
    searches: new Map(searches.rows.map((r) => [Number(r.user_id), Number(r.n)])),
    colours: new Map(colours.rows.map((r) => [Number(r.user_id), r.counts])),
    reach: reachByDigits,
    facts: factsByDigits,
  };
}

/** One account as one row. Pure — everything it says was read for the batch. */
export function buildRow(id: number, b: BatchFacts): BaseExportRow | null {
  const a = b.accounts.get(id);
  if (!a) return null;
  const phones = b.phones.get(id) ?? [];
  const first = phones[0] ?? '';
  const digits = phones.map(phoneDigits);
  const reach = digits.map((d) => b.reach.get(d)).find((r) => r !== undefined);
  const facts = digits.map((d) => b.facts.get(d)).find((f) => f !== undefined);
  const threads = b.threads.get(id);
  const live =
    a.subscription_status !== null && NETAI_LIVE_STATUSES.includes(a.subscription_status);
  const netaiUser = (threads?.count ?? 0) > 0 || (b.searches.get(id) ?? 0) > 0 || live;
  const staff = isStaffUser(id) || digits.some((d) => staffPhoneDigits().has(d));
  const colours = b.colours.get(id) ?? '';
  return {
    account_id: String(id),
    registered_at: iso(a.createdAt),
    phone_last4: phoneDigits(first).slice(-4),
    phones: String(phones.length),
    contacts_imported: String(b.contacts.get(id) ?? 0),
    old_ally_logins: String(b.logins.get(id)?.count ?? 0),
    old_ally_last_login: iso(b.logins.get(id)?.last ?? a.lastLoginAt),
    old_ally_paid: a.boughtPremiumMapAt !== null && a.cancelledPremiumMapAt === null ? 'yes' : 'no',
    old_ally_paid_at: iso(a.boughtPremiumMapAt),
    netai_threads: String(threads?.count ?? 0),
    netai_messages: String(b.messages.get(id) ?? 0),
    netai_searches: String(b.searches.get(id) ?? 0),
    netai_first_activity: iso(threads?.first ?? null),
    netai_last_activity: iso(threads?.last ?? null),
    subscription_tier: a.subscription_tier ?? '',
    subscription_status: a.subscription_status ?? '',
    period_ends_at: iso(a.current_period_ends_at),
    account_state: netaiUser ? 'netai_user' : 'ally_account',
    netai_subscriber: live ? 'yes' : 'no',
    colour_sorted: colours === '' ? 'no' : 'yes',
    colour_counts: colours,
    reach_phonebooks: String(reach?.reach ?? 0),
    distinct_labels: String(reach?.labels ?? 0),
    label_sample: (reach?.sample ?? []).join(' | '),
    job_title: facts?.get('role') ?? facts?.get('occupation') ?? a.jobPosition ?? '',
    employer: facts?.get('employer') ?? a.employer ?? '',
    industry: facts?.get('industry') ?? '',
    linkedin: facts?.get('link') ?? a.linkedin ?? '',
    city: a.city ?? '',
    country: a.linkedinCountry ?? '',
    invite_cohort: a.invite_cohort ?? '',
    staff_or_test: staff ? 'yes' : 'no',
  };
}

export function csvLine(values: readonly string[]): string {
  return values.map((v) => `"${v.replace(/"/g, '""')}"`).join(',') + '\n';
}

export interface ExportOptions {
  batch?: number;
  /** Stop after this many accounts — a sample for a quick look. */
  maxAccounts?: number;
}

/**
 * Write the whole base as CSV through `write`, one batch at a time. Returns
 * how many rows were written. The header goes first, always, so an empty base
 * is still a well-formed file.
 */
export async function streamBaseExport(
  write: (chunk: string) => void,
  options: ExportOptions = {},
): Promise<number> {
  const batch = Math.min(MAX_BATCH, Math.max(1, Math.floor(options.batch ?? DEFAULT_BATCH)));
  const max = options.maxAccounts ?? Number.POSITIVE_INFINITY;
  write(csvLine(BASE_EXPORT_COLUMNS));
  let lastId = 0;
  let written = 0;
  while (written < max) {
    const ids = await idsAfter(lastId, Math.min(batch, max - written));
    if (ids.length === 0) break;
    const facts = await readBatch(ids);
    for (const id of ids) {
      const row = buildRow(id, facts);
      if (row === null) continue;
      write(csvLine(BASE_EXPORT_COLUMNS.map((c) => row[c])));
      written++;
    }
    lastId = ids[ids.length - 1] ?? lastId;
  }
  return written;
}
