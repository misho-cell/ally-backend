import { PoolClient } from 'pg';
import { query, withTransaction } from '../db/postgres/client';
import { getSession } from '../db/neo4j/client';
import { phoneDigits } from './phone';
import { buildCompositeKey } from './neo4j.keys';

// The graph key is built from the account's RAW phone rows (sorted, joined) —
// it must be captured before those rows are deleted.
function compositeKeyFor(rawPhones: readonly string[]): string | null {
  return rawPhones.length > 0 ? buildCompositeKey(rawPhones) : null;
}

// The right to erasure, in code (ticket 4, item 0). The live Privacy Policy
// already promises users an in-app deletion route and promises non-users a
// permanent opt-out; both were specified and designed and existed nowhere but
// on paper. The cascade below is the Bible's, with three deliberate carve-outs
// that are named in the API response rather than hidden:
//
//  1. FINANCIAL RECORDS (token_transactions, usage_events, referral_transactions)
//     are retained. They carry no personal data — only the numeric id, which
//     stops resolving to a person the moment the account row is scrubbed. That
//     severance IS the anonymisation, and the records are needed for tax and
//     commission compliance.
//  2. OTHER PEOPLE'S RECORDS are kept but scrubbed of this person's words: an
//     ask someone else sent stays as their own task history, with the answer
//     text removed.
//  3. INCOMING graph edges — other users who have this person in THEIR
//     phonebook — are not touched by an account deletion, because they are
//     those users' own contact data. What protects the person instead is the
//     phone-level opt-out written below, which outlives the account and blocks
//     every future ask to that number.

const ERASURE_TIMEOUT_MS = 30_000;

// Tables holding data this account OWNS: every row goes. Ordered so that
// nothing here depends on anything below it.
const OWNED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'conversations', column: 'user_id' },
  { table: 'run_prompt_stamps', column: 'user_id' },
  { table: 'pending_updates', column: 'user_id' },
  { table: 'task_asks', column: 'from_user_id' },
  { table: 'tasks', column: 'user_id' },
  { table: 'threads', column: 'user_id' },
  { table: 'user_notes', column: 'user_id' },
  { table: 'user_private_context', column: 'user_id' },
  { table: 'user_profile_kv', column: 'user_id' },
  { table: 'contact_insights', column: 'user_id' },
  { table: 'contact_exclusions', column: 'user_id' },
  { table: 'contact_relationship_scores', column: 'user_id' },
  { table: 'contact_facts', column: 'submitted_by_user_id' },
  { table: 'contact_enrichment', column: 'user_id' },
  { table: 'weak_tie_signals', column: 'user_id' },
  { table: 'search_activity', column: 'user_id' },
  { table: 'user_avatars', column: 'user_id' },
  { table: 'ai_notification_log', column: 'user_id' },
  { table: 'ai_notification_settings', column: 'user_id' },
  { table: 'push_subscriptions', column: 'user_id' },
  { table: 'device_fingerprints', column: 'user_id' },
  { table: 'oauth_tokens', column: 'user_id' },
  { table: 'product_events', column: 'user_id' },
  { table: 'introduction_requests', column: 'requester_user_id' },
  // The contact graph this account contributed — their phonebook.
  { table: '"UserAlias"', column: '"contactId"' },
  { table: '"UserTags"', column: '"contactId"' },
  { table: '"UserBlock"', column: '"blockerId"' },
  { table: '"ContactDeceased"', column: '"userId"' },
  // The phone rows last: they are how the account is found.
  { table: '"UserPhone"', column: '"userId"' },
];

// Human labels for the summary, so the frontend never has to render a raw
// table/column name as a section title (task 22(i): the bare word "records"
// — our own response wrapper key, not a translation — has printed on
// /profile/data since 14 August). Every OWNED_TABLES entry gets one.
export const OWNED_TABLE_LABELS_KA: Readonly<Record<string, string>> = {
  conversations: 'საუბრები',
  run_prompt_stamps: 'გაშვების ჩანაწერები',
  pending_updates: 'მოლოდინში მყოფი პასუხები',
  task_asks: 'გაგზავნილი კითხვები',
  tasks: 'მიზნები',
  threads: 'თემები',
  user_notes: 'ჩანაწერები',
  user_private_context: 'პირადი კონტექსტი',
  user_profile_kv: 'პროფილის მონაცემები',
  contact_insights: 'კონტაქტების ანალიზი',
  contact_exclusions: 'გამონაკლისები',
  contact_relationship_scores: 'ურთიერთობის შეფასებები',
  contact_facts: 'შენახული ფაქტები',
  contact_enrichment: 'გამდიდრებული მონაცემები',
  weak_tie_signals: 'სუსტი კავშირების სიგნალები',
  search_activity: 'ძებნის ისტორია',
  user_avatars: 'პროფილის ფოტო',
  ai_notification_log: 'შეტყობინებების ისტორია',
  ai_notification_settings: 'შეტყობინებების პარამეტრები',
  push_subscriptions: 'push გამოწერები',
  device_fingerprints: 'მოწყობილობები',
  oauth_tokens: 'დაკავშირებული ანგარიშები',
  product_events: 'აქტივობის ჟურნალი',
  introduction_requests: 'გაცნობის მოთხოვნები',
  UserAlias: 'კონტაქტების წიგნაკი',
  UserTags: 'კონტაქტების ტეგები',
  UserBlock: 'დაბლოკილები',
  ContactDeceased: 'გარდაცვლილად მონიშნული კონტაქტები',
  UserPhone: 'ტელეფონის ნომრები',
};

// Personal columns on "User" scrubbed when present. The row itself survives so
// other people's foreign keys stay valid — with nothing personal left in it.
const USER_COLUMNS_TO_SCRUB = [
  'name',
  'email',
  'password',
  'employer',
  'jobPosition',
  'city',
  'photo',
  'photoUrl',
  'bio',
  'birthday',
  'gender',
];

export interface ErasureReport {
  userId: number;
  rowsDeleted: Record<string, number>;
  phoneOptOuts: number;
  graphEdgesRemoved: number;
  retained: string[];
  dryRun: boolean;
}

const RETAINED_NOTES = [
  'financial records (token, usage and referral ledgers) — retained for tax and commission compliance, severed from your identity',
  'questions other people sent you — retained as their own records, with your answers erased',
  'your number — retained ONLY in the do-not-contact list, so nobody can add or contact it again',
];

/** Which of the listed tables actually exist here (prod and test schemas differ). */
async function existingTables(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ table_name: string }>(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
  );
  return new Set(result.rows.map((r) => r.table_name));
}

async function existingUserColumns(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'User'`,
  );
  const present = new Set(result.rows.map((r) => r.column_name));
  return USER_COLUMNS_TO_SCRUB.filter((c) => present.has(c));
}

/** Bare table name for the existence check ("UserAlias" → UserAlias). */
function bareName(table: string): string {
  return table.replace(/"/g, '');
}

/**
 * Everything this account holds, by category — the summary screen's data and
 * the honest preview shown before a deletion is confirmed.
 */
export async function getMyDataSummary(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  // All counts CONCURRENTLY: run one-by-one they took 14.4s on the founder's
  // account while the privacy page sat empty (ticket 6 verify, N12.3).
  // Untyped $1 on purpose: the id columns drift between INTEGER and TEXT in
  // prod (tasks.user_id, contact_facts.submitted_by_user_id) — a ::int cast
  // made those comparisons throw, the catch swallowed it, and the tables
  // silently vanished from the summary.
  await Promise.all(
    OWNED_TABLES.map(async ({ table, column }) => {
      try {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = $1`,
          [userId],
          ERASURE_TIMEOUT_MS,
        );
        const n = Number(result.rows[0]?.count ?? 0);
        if (n > 0) counts[bareName(table)] = n;
      } catch {
        // A table that does not exist in this environment simply has no data.
      }
    }),
  );
  return counts;
}

// An export bigger than this per table is delivered truncated and says so —
// honesty over an unbounded response body.
const EXPORT_ROW_CAP = 20_000;

/**
 * The data-export the published Privacy Policy promises (ticket 6 build list
 * item 6 — the endpoint did not exist behind the legal commitment). Everything
 * the account owns, table by table, as JSON: the scrubbed profile row plus
 * every OWNED_TABLES row, capped and flagged when truncated.
 */
export async function exportMyData(userId: string): Promise<Record<string, unknown>> {
  // Profile columns drift between environments ("bio" does not exist in prod)
  // — export whatever personal columns actually exist, never the password.
  const wanted = [
    'id',
    'name',
    'email',
    'employer',
    'jobPosition',
    'city',
    'bio',
    'gender',
    'birthday',
    'subscription_tier',
    'subscription_status',
    'createdAt',
  ];
  const present = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'User'`,
    [],
    ERASURE_TIMEOUT_MS,
  );
  const presentSet = new Set(present.rows.map((r) => r.column_name));
  const cols = wanted.filter((c) => presentSet.has(c)).map((c) => `"${c}"`);
  const profile = await query<Record<string, unknown>>(
    `SELECT ${cols.join(', ')} FROM "User" WHERE id = $1 LIMIT 1`,
    [userId],
    ERASURE_TIMEOUT_MS,
  );
  const data: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    profile: profile.rows[0] ?? null,
  };
  await Promise.all(
    OWNED_TABLES.map(async ({ table, column }) => {
      try {
        const result = await query<Record<string, unknown>>(
          `SELECT * FROM ${table} WHERE ${column} = $1 LIMIT ${EXPORT_ROW_CAP + 1}`,
          [userId],
          ERASURE_TIMEOUT_MS,
        );
        if (result.rows.length === 0) return;
        data[bareName(table)] = {
          rows: result.rows.slice(0, EXPORT_ROW_CAP),
          truncated: result.rows.length > EXPORT_ROW_CAP,
        };
      } catch {
        // A table that does not exist in this environment simply has no data.
      }
    }),
  );
  return data;
}

/**
 * Erase the account. Everything Postgres-side happens in ONE transaction: a
 * half-deleted account is worse than none, because the person is told they are
 * gone and they are not. Neo4j and the opt-out write follow, and are logged
 * rather than rolled back — the account row is already scrubbed by then, so a
 * graph hiccup must not resurrect it.
 *
 * `dryRun` returns exactly what WOULD go, changing nothing.
 */
export async function deleteMyAccount(userId: string, dryRun = false): Promise<ErasureReport> {
  const phones = await query<{ phone: string }>(
    'SELECT phone FROM "UserPhone" WHERE "userId" = $1',
    [userId],
    ERASURE_TIMEOUT_MS,
  );
  const digits = [...new Set(phones.rows.map((r) => phoneDigits(r.phone)).filter(Boolean))];
  const graphKey = compositeKeyFor(phones.rows.map((r) => r.phone));

  if (dryRun) {
    return {
      userId: Number(userId),
      rowsDeleted: await getMyDataSummary(userId),
      phoneOptOuts: digits.length,
      graphEdgesRemoved: 0,
      retained: RETAINED_NOTES,
      dryRun: true,
    };
  }

  const rowsDeleted = await withTransaction(async (client) => {
    const tables = await existingTables(client);
    const counts: Record<string, number> = {};

    // Other people's records: keep the row, erase this person's words.
    if (tables.has('task_asks')) {
      const scrubbed = await client.query(
        `UPDATE task_asks
         SET answer = NULL,
             status = CASE WHEN status = 'sent' THEN 'cancelled' ELSE status END
         WHERE to_user_id = $1`,
        [userId],
      );
      counts['task_asks (answers erased)'] = scrubbed.rowCount ?? 0;
    }
    if (tables.has('introduction_requests')) {
      const scrubbed = await client.query(
        'UPDATE introduction_requests SET mediator_response = NULL WHERE mediator_user_id = $1',
        [userId],
      );
      counts['introduction_requests (responses erased)'] = scrubbed.rowCount ?? 0;
    }

    // Untyped $1 everywhere in this cascade: the id columns drift between
    // INTEGER and TEXT across prod tables (tasks.user_id,
    // contact_facts.submitted_by_user_id) — a ::int cast throws on the TEXT
    // ones and aborts the whole erasure transaction.
    for (const { table, column } of OWNED_TABLES) {
      if (!tables.has(bareName(table))) continue;
      const result = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
      if ((result.rowCount ?? 0) > 0) counts[bareName(table)] = result.rowCount ?? 0;
    }

    // The person, gone: every personal column emptied, the row kept so other
    // people's references stay valid, and deletedAt set — which every query in
    // the codebase already treats as "this account does not exist".
    const userColumns = await existingUserColumns(client);
    const assignments = userColumns.map((c) => `"${c}" = NULL`).join(', ');
    await client.query(
      `UPDATE "User" SET ${assignments ? assignments + ', ' : ''}"deletedAt" = NOW() WHERE id = $1`,
      [userId],
    );

    // The do-not-contact record outlives the account (see migration 056).
    for (const d of digits) {
      await client.query(
        `INSERT INTO phone_optouts (phone_digits, reason) VALUES ($1, 'account_deleted')
         ON CONFLICT (phone_digits) DO NOTHING`,
        [d],
      );
    }
    await client.query('DELETE FROM ask_optouts WHERE user_id = $1', [userId]);
    await client.query('INSERT INTO erasure_log (user_id, rows_deleted) VALUES ($1, $2)', [
      userId,
      JSON.stringify(counts),
    ]);
    return counts;
  });

  const graphEdgesRemoved = await removeGraphContributions(graphKey);

  return {
    userId: Number(userId),
    rowsDeleted,
    phoneOptOuts: digits.length,
    graphEdgesRemoved,
    retained: RETAINED_NOTES,
    dryRun: false,
  };
}

/**
 * The graph half: delete the CONTACT edges this person CONTRIBUTED (their own
 * phonebook) and their node if nothing else references it. Edges pointing AT
 * them from other people's phonebooks are those users' own data and are left
 * alone — the phone-level opt-out is what protects the person there. Failure
 * is logged, never thrown: the account is already erased in Postgres.
 */
async function removeGraphContributions(graphKey: string | null): Promise<number> {
  if (!graphKey) return 0;
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (u:AllyNode {phoneKey: $graphKey})-[r:CONTACT]->()
       DELETE r
       RETURN count(r) AS removed`,
      { graphKey },
    );
    const removed = Number(result.records[0]?.get('removed') ?? 0);
    await session.run(`MATCH (u:AllyNode {phoneKey: $graphKey}) WHERE NOT (u)--() DELETE u`, {
      graphKey,
    });
    return removed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[erasure] graph cleanup failed (account already erased):',
      (err as Error).message,
    );
    return 0;
  } finally {
    await session.close();
  }
}

/** Is this number on the permanent do-not-contact list? */
export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const digits = phoneDigits(phone);
  if (!digits) return false;
  const result = await query<{ phone_digits: string }>(
    'SELECT phone_digits FROM phone_optouts WHERE phone_digits = $1 LIMIT 1',
    [digits],
    ERASURE_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}
