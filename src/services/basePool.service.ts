import { backgroundQuery, query } from '../db/postgres/client';

/**
 * Ticket 19: the pool is the whole base, not our phonebooks.
 *
 * The entry rule was „at least two Netai users have this number saved", which
 * is our own phonebooks looking at themselves. The 62,000 accounts that
 * registered with old Ally and never opened Netai are ours already — we hold
 * the account and the number — and one who happened to be in nobody's phone
 * could not be seen at all. The founder's answer (13 Sep): they are targets,
 * build it.
 *
 * THE SHAPE, AND WHY. The live list build already costs about two minutes on a
 * thousand candidates, on a route that dies at sixty seconds; sixty-two
 * thousand in the same shape is hours. So the base is walked SLOWLY in the
 * background, a few hundred accounts at a time, and the live build only reads
 * the top of what the walk left behind. Nothing here runs inside a request.
 *
 * WHOSE CONNECTIONS IT USES. Its own: how big their phonebook is, when they
 * registered, whether they ever opened Netai. That is the whole point — a
 * person enters on what is true about THEM, not on who happens to carry them.
 */

/** Accounts examined per tick. Small on purpose: this is a night job, not a race. */
const WALK_BATCH = Number(process.env.BASE_POOL_BATCH ?? 400);

/**
 * The founder's floor (D214, 13 Sep): „the 156 accounts with phonebooks under
 * 200 stay out — the 200 rule holds." His reason has never been technical — a
 * phonebook that small reads as somebody very young who is probably not working
 * yet — so it is his number, written here as his.
 */
const MIN_OWN_CONTACTS = Number(process.env.BASE_POOL_MIN_CONTACTS ?? 200);

/**
 * Above this a phonebook is a business list somebody imported, not a person's
 * phone. The same cap the rest of the engine uses, so one definition of „human
 * sized" and not two that can drift.
 */
const MAX_OWN_CONTACTS = Number(process.env.SOCIAL_PROOF_MAX_OWNER_CONTACTS ?? 15000);

/** How many of these the live build may take. The cut is the build's cost, not the base's size. */
const READ_LIMIT = Number(process.env.BASE_POOL_READ_LIMIT ?? 300);

const WALK_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 8_000;

const NETAI_LIVE_STATUSES = ['active', 'trialing', 'past_due'];

export interface BasePoolRow {
  phone: string;
  label: string;
}

export interface WalkResult {
  /** Accounts looked at this tick — 0 means the walk has reached the end. */
  readonly examined: number;
  /** Of those, how many qualified and were written. */
  readonly written: number;
  /** Where the next tick resumes. */
  readonly cursor: number;
  /** True when the walk wrapped back to the start. */
  readonly wrapped: boolean;
}

/**
 * One tick of the walk: the next batch of accounts by id, their own signals,
 * written down.
 *
 * On the BACKGROUND pool (two connections of its own) so it can never take a
 * connection a person's own search is waiting for — the 30 July outage was
 * exactly a heavy job saturating the shared pool.
 *
 * Resumable and idempotent: it starts where it stopped, and re-walking an
 * account rewrites its row rather than duplicating it. When it reaches the end
 * it wraps to zero, so the base is re-measured continuously rather than
 * measured once and trusted forever.
 */
export async function walkBaseOnce(): Promise<WalkResult> {
  const cursorRow = await backgroundQuery<{ last_user_id: number }>(
    'SELECT last_user_id FROM base_pool_cursor WHERE id = TRUE',
    [],
    WALK_TIMEOUT_MS,
  );
  const from = cursorRow.rows[0]?.last_user_id ?? 0;

  const walked = await backgroundQuery<{
    id: number;
    phone: string | null;
    own_contacts: string;
    registered_at: string | null;
    opened: boolean;
    label: string | null;
  }>(
    `WITH batch AS (
       SELECT u.id, u."createdAt" AS registered_at,
              NULLIF(TRIM(u.name), '') AS label,
              (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
               OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
               OR u.subscription_status = ANY($3::text[])) AS opened
       FROM "User" u
       WHERE u.id > $1 AND u."deletedAt" IS NULL
       ORDER BY u.id
       LIMIT $2
     )
     SELECT b.id, b.registered_at, b.opened, b.label,
            (SELECT up.phone FROM "UserPhone" up WHERE up."userId" = b.id LIMIT 1) AS phone,
            -- Counted to the cap, never past it: „at least this many".
            (SELECT COUNT(*) FROM (
               SELECT 1 FROM "UserAlias" a WHERE a."contactId" = b.id LIMIT $4::int
             ) capped)::text AS own_contacts
     FROM batch b
     ORDER BY b.id`,
    [from, WALK_BATCH, NETAI_LIVE_STATUSES, MAX_OWN_CONTACTS],
    WALK_TIMEOUT_MS,
  );

  const examined = walked.rows.length;
  if (examined === 0) {
    // The end of the base. Start again from the top next tick, so a phonebook
    // that grew since the last pass is seen rather than frozen.
    await backgroundQuery(
      'UPDATE base_pool_cursor SET last_user_id = 0, updated_at = NOW() WHERE id = TRUE',
      [],
      WALK_TIMEOUT_MS,
    );
    return { examined: 0, written: 0, cursor: 0, wrapped: true };
  }

  const keep = walked.rows.filter(
    (r) => r.phone !== null && Number(r.own_contacts) >= MIN_OWN_CONTACTS,
  );
  if (keep.length > 0) {
    await backgroundQuery(
      `INSERT INTO base_pool_candidates
         (phone, user_id, own_contacts, registered_at, opened_netai, refreshed_at)
       SELECT x.phone, x.user_id, x.own_contacts, x.registered_at, x.opened, NOW()
       FROM jsonb_to_recordset($1::jsonb)
            AS x(phone text, user_id int, own_contacts int,
                 registered_at timestamptz, opened boolean)
       ON CONFLICT (phone) DO UPDATE
         SET user_id       = EXCLUDED.user_id,
             own_contacts  = EXCLUDED.own_contacts,
             registered_at = EXCLUDED.registered_at,
             opened_netai  = EXCLUDED.opened_netai,
             refreshed_at  = NOW()`,
      [
        JSON.stringify(
          keep.map((r) => ({
            phone: r.phone,
            user_id: r.id,
            own_contacts: Number(r.own_contacts),
            registered_at: r.registered_at,
            opened: r.opened,
          })),
        ),
      ],
      WALK_TIMEOUT_MS,
    );
  }

  const cursor = walked.rows[walked.rows.length - 1].id;
  await backgroundQuery(
    'UPDATE base_pool_cursor SET last_user_id = $1, updated_at = NOW() WHERE id = TRUE',
    [cursor],
    WALK_TIMEOUT_MS,
  );
  return { examined, written: keep.length, cursor, wrapped: false };
}

/**
 * The candidates the walk has found — the ones nobody has looked at yet first.
 *
 * WHY NOT SIMPLY „BIGGEST PHONEBOOK FIRST", WHICH IS WHAT THIS DID. Measured on
 * 15 September, once the walk had crossed the whole base:
 *
 *   reachable candidates                 10,002
 *   of them, human-sized (200-1,000)      8,407
 *   the 300th by phonebook size            2,453 contacts
 *   base people who ever reached a list       36
 *
 * Ordering by size alone and cutting at 300 meant the read returned everybody
 * above 2,453 contacts — and the SAME three hundred on every build, for ever.
 * The other 9,700, which is 97% of what the walk found and almost all of the
 * human-sized ones, could never appear no matter how long the system ran. That
 * is not a ranking, it is a closed door, and it defeats the point the founder
 * asked for: „the 62,000 are targets."
 *
 * The top of that order was also the wrong end. Fifty-six of those people carry
 * more than 5,000 numbers and nine sit exactly at the 15,000 cap — a phonebook
 * that size is an imported business list, which is precisely what the rest of
 * the engine caps as not-human-sized.
 *
 * So the first key is whether anyone has ever been listed, and only then size.
 * Never-listed people come first, biggest phonebook among them; after that the
 * ones listed longest ago. It rotates by construction, never empties, and does
 * not change WHO is eligible — only the order in which they are offered, which
 * was my arbitrary choice in the first place and never anybody's decision.
 *
 * The join is cheap and that was measured too: the whole score history is 2,965
 * rows over 99 distinct phones.
 *
 * A plain indexed read — this is what makes the whole arrangement affordable:
 * the live build never measures the base, it only reads what the night already
 * measured. An account that has since opened Netai is filtered here rather than
 * deleted, so the walk does not rediscover it every pass.
 *
 * THE STORED FLAG IS NOT ENOUGH, AND THIS IS THE REASON. `opened_netai` is a
 * photograph taken the last time the walk passed this account, and the walk
 * crosses the whole base over days. Somebody who opens Netai this morning stays
 * written down as „never opened" until it comes back round to them — and in
 * that window the engine would list a Netai USER as a target and invite them to
 * the product they are already using. That is the one mistake the product must
 * not make about its own people: a member gets activated, never pitched.
 *
 * So the flag stays as the cheap indexed pre-filter, and the same question is
 * asked again here, live, against the three things that mean somebody arrived:
 * a conversation, a search, a paid subscription. Three indexed EXISTS over a
 * few hundred rows cost almost nothing next to being wrong about a person.
 */
export async function basePool(): Promise<BasePoolRow[]> {
  const result = await query<{ phone: string; label: string | null }>(
    `SELECT phone, label FROM (
       SELECT c.phone, u.name AS label
       FROM base_pool_candidates c
       LEFT JOIN "User" u ON u.id = c.user_id AND u."deletedAt" IS NULL
       WHERE c.opened_netai = FALSE
         AND (u.subscription_status IS NULL OR u.subscription_status <> ALL($2::text[]))
         AND NOT EXISTS (SELECT 1 FROM threads t WHERE t.user_id = c.user_id)
         AND NOT EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = c.user_id::text)
       ORDER BY (SELECT MAX(h.built_at) FROM target_score_history h WHERE h.phone = c.phone)
                  ASC NULLS FIRST,
                c.own_contacts DESC
       LIMIT $1
     ) top`,
    [READ_LIMIT, NETAI_LIVE_STATUSES],
    READ_TIMEOUT_MS,
  );
  // The label is display material and the crowd's name for them is better, so
  // an empty one is left empty rather than guessed — analyzeAliases fills it.
  return result.rows.map((r) => ({ phone: r.phone, label: r.label ?? '' }));
}

/** How far the walk has got, for the admin read and the morning report. */
export async function baseWalkStatus(): Promise<{
  candidates: number;
  reachable: number;
  cursor: number;
  last_walk: string | null;
}> {
  const result = await query<{
    candidates: string;
    reachable: string;
    cursor: number;
    last_walk: Date | string | null;
  }>(
    `SELECT (SELECT COUNT(*) FROM base_pool_candidates)::text                        AS candidates,
            (SELECT COUNT(*) FROM base_pool_candidates WHERE opened_netai = FALSE)::text
                                                                                    AS reachable,
            (SELECT last_user_id FROM base_pool_cursor WHERE id = TRUE)             AS cursor,
            (SELECT MAX(refreshed_at) FROM base_pool_candidates)                    AS last_walk`,
    [],
    READ_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    candidates: Number(row?.candidates ?? 0),
    reachable: Number(row?.reachable ?? 0),
    cursor: Number(row?.cursor ?? 0),
    // Real ISO 8601, not Postgres's own text. Its form („2026-09-12
    // 21:57:08.551099+00" — a space where the T belongs, six-digit
    // microseconds) is not something Safari will parse, so the same timestamp
    // that reads correctly on a Mac becomes „Invalid Date" on an iPhone. The
    // frontend found this and worked around it; a workaround on their side is
    // not a fix, because the next reader hits it again.
    last_walk:
      row?.last_walk === null || row?.last_walk === undefined
        ? null
        : new Date(row.last_walk).toISOString(),
  };
}
