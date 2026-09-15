import { query } from '../db/postgres/client';

/**
 * The tester's channel, inside our own admin panel.
 *
 * Tickets have been travelling as files that Misho copies by hand, both ways,
 * every time. The backend and frontend sessions now message each other
 * directly, but the tester is on a different Claude account and cross-account
 * session messaging is refused — deliberately, and not something to work
 * around. The admin panel is the one place both sides already stand.
 *
 * WHAT THIS IS NOT. It is not a chat between two private parties. One thread,
 * readable by anyone with the panel, so Misho stops being the wire and stays
 * the reader.
 */

const QUERY_TIMEOUT_MS = 8_000;

/** Long enough for a whole ticket; short enough that one paste cannot flood. */
const MAX_BODY_CHARS = 20_000;

/** How many messages one read returns. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Who a message is from, in the reader's terms.
 *
 * A closed set on purpose. I post through Misho's admin login, so with a free
 * text field every line I wrote would arrive under his name — and the one
 * thing this channel must never do is let a product say a person wrote what a
 * machine wrote.
 */
export enum HandoffAuthor {
  ClaudeBackend = 'claude_backend',
  ClaudeFrontend = 'claude_frontend',
  Tester = 'tester',
  Misho = 'misho',
}

const AUTHORS: ReadonlySet<string> = new Set(Object.values(HandoffAuthor));

export function isHandoffAuthor(value: unknown): value is HandoffAuthor {
  return typeof value === 'string' && AUTHORS.has(value);
}

export interface HandoffMessage {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly created_at: string;
  /**
   * The login the server actually saw, beside the author the message declares.
   *
   * Returned so the panel HAS the fact, not because it should be drawn. Today
   * everyone writes through one shared admin login, so this number is the same
   * on every row — noise, and noise is where the one row that matters would
   * hide. It becomes worth showing when each participant has a login of their
   * own; until then the frontend is right to leave it alone.
   *
   * It is deliberately NOT compared to `author` here. They are different
   * things — a role and an account id — so they „differ" on every row,
   * including every legitimate one: I write as claude_backend through Misho's
   * login, which is expected and unavoidable. A flag built on that comparison
   * would mark everything and mean nothing.
   */
  readonly posted_by: string | null;
}

export interface HandoffThread {
  readonly messages: HandoffMessage[];
  /** The newest id that exists, so a reader can say how far it has got. */
  readonly latest_id: number;
  /** Messages this reader has not seen, or null when no reader was named. */
  readonly unread: number | null;
  /** How far this reader had read, or null when no reader was named. */
  readonly last_seen_id: number | null;
}

interface MessageRow {
  id: number;
  author: string;
  body: string;
  posted_by: string | null;
  created_at: Date | string;
}

/**
 * The thread, oldest first.
 *
 * Oldest first because it is a conversation and that is the order a person
 * reads one in. `since_id` gives the cheap „anything new" read without
 * re-sending what the caller already has.
 */
export async function readHandoff(opts: {
  reader?: string;
  sinceId?: number;
  limit?: number;
}): Promise<HandoffThread> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const sinceId = Math.max(0, Math.floor(opts.sinceId ?? 0));
  const reader =
    typeof opts.reader === 'string' && opts.reader.trim() !== '' ? opts.reader.trim() : null;

  const [messages, latest, seen] = await Promise.all([
    query<MessageRow>(
      `SELECT id, author, body, posted_by, created_at
       FROM handoff_messages
       WHERE id > $1::int
       ORDER BY id ASC
       LIMIT $2::int`,
      [sinceId, limit],
      QUERY_TIMEOUT_MS,
    ),
    query<{ latest: number | null }>(
      `SELECT MAX(id) AS latest FROM handoff_messages`,
      [],
      QUERY_TIMEOUT_MS,
    ),
    // Where this reader had got to, and how much of what came after was
    // written by somebody ELSE.
    //
    // YOUR OWN MESSAGE IS NOT NEWS. Counted as plain arithmetic —
    // latest minus last seen — the badge lit up for the message you had just
    // written yourself. The very first run of the hourly check reported one
    // unread item and it was my own opening post. A counter that goes off for
    // your own writing teaches people to stop looking at it, and then it is
    // not there on the day it matters.
    reader === null
      ? Promise.resolve({ rows: [] as { last_seen_id: number; unread: string }[] })
      : query<{ last_seen_id: number; unread: string }>(
          `SELECT COALESCE(r.last_seen_id, 0) AS last_seen_id,
                  (SELECT COUNT(*) FROM handoff_messages m
                    WHERE m.id > COALESCE(r.last_seen_id, 0)
                      AND m.author <> $1::text)::text AS unread
           FROM (SELECT last_seen_id FROM handoff_reads WHERE reader = $1::text) r
           RIGHT JOIN (SELECT 1) one ON TRUE`,
          [reader],
          QUERY_TIMEOUT_MS,
        ),
  ]);

  const latestId = latest.rows[0]?.latest ?? 0;
  const lastSeenId = reader === null ? null : (seen.rows[0]?.last_seen_id ?? 0);
  const unread = reader === null ? null : Number(seen.rows[0]?.unread ?? 0);

  return {
    // ISO 8601 at the boundary: Postgres's own text form is not something
    // Safari parses, and this thread is read on phones.
    messages: messages.rows.map((row) => ({
      id: row.id,
      author: row.author,
      body: row.body,
      posted_by: row.posted_by,
      created_at: new Date(row.created_at).toISOString(),
    })),
    latest_id: latestId,
    unread,
    last_seen_id: lastSeenId,
  };
}

/**
 * Post one message.
 *
 * `postedBy` is the login the server actually saw, kept beside the author the
 * message declares. The two are usually different — I write as
 * `claude_backend` through Misho's admin session — and keeping both means a
 * wrong label is something you can see later rather than the last word.
 */
export async function postHandoff(
  author: HandoffAuthor,
  body: string,
  postedBy: string | null,
): Promise<HandoffMessage> {
  const text = body.trim();
  if (text === '') throw new Error('message is empty');
  const result = await query<MessageRow>(
    `INSERT INTO handoff_messages (author, body, posted_by)
     VALUES ($1, $2, $3)
     RETURNING id, author, body, posted_by, created_at`,
    [author, text.slice(0, MAX_BODY_CHARS), postedBy],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    posted_by: row.posted_by,
    created_at: new Date(row.created_at).toISOString(),
  };
}

/**
 * Record how far a reader has read.
 *
 * Never moves backwards: two tabs open on the same thread would otherwise let
 * the slower one un-read what the faster one has already seen, and messages
 * would reappear as new for ever.
 */
export async function markHandoffRead(reader: string, lastSeenId: number): Promise<number> {
  const name = reader.trim();
  if (name === '') throw new Error('reader is required');
  const result = await query<{ last_seen_id: number }>(
    `INSERT INTO handoff_reads (reader, last_seen_id, updated_at)
     VALUES ($1, $2::int, NOW())
     ON CONFLICT (reader) DO UPDATE
       SET last_seen_id = GREATEST(handoff_reads.last_seen_id, EXCLUDED.last_seen_id),
           updated_at   = NOW()
     RETURNING last_seen_id`,
    [name, Math.max(0, Math.floor(lastSeenId))],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0].last_seen_id;
}
