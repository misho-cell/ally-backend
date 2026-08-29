import { query } from '../db/postgres/client';
import { queueFollowUp, PendingUpdate } from './pendingUpdates.service';

const DEBRIEF_QUERY_TIMEOUT_MS = 8_000;

// Ticket 7 Task 13 (engine T9): "How did it go? — after any introduction."
// The founder's ruling D49 sets the clock: 3 days after an introduction or a
// relayed ask reaches sent/accepted with no outcome recorded, and after an
// 'accepted' search outcome. Once per introduction — debrief_arms' primary
// key enforces that server-side, the same never-twice shape as
// thanks_loop_offers. Delivery is pending_updates (the T9 surface): the item
// releases on a fixed date via queueFollowUp, and at release time
// filterStaleDebriefs applies the "with no outcome recorded" half — a
// subject that moved on by itself is consumed silently, never asked about.
export const DEBRIEF_KIND = 'debrief';
const DEBRIEF_DELAY_DAYS = Number(process.env.DEBRIEF_DELAY_DAYS ?? 3);

type DebriefArmKind = 'intro_request' | 'task_ask' | 'search';

/** True only for the FIRST arm of this subject — the once-per-introduction guard. */
async function armOnce(kind: DebriefArmKind, refId: number, userId: string): Promise<boolean> {
  const inserted = await query<{ ref_id: number }>(
    `INSERT INTO debrief_arms (kind, ref_id, user_id)
     VALUES ($1, $2, $3::int)
     ON CONFLICT (kind, ref_id) DO NOTHING
     RETURNING ref_id`,
    [kind, refId, userId],
    DEBRIEF_QUERY_TIMEOUT_MS,
  );
  return inserted.rows.length > 0;
}

/**
 * An introduction request was ACCEPTED — three days later the requester's own
 * assistant asks how it actually went. Best-effort by contract: callers must
 * never let a failed arm break the accept itself.
 */
export async function armIntroDebrief(
  requesterUserId: string,
  introRequestId: number,
  targetName: string,
): Promise<void> {
  if (!(await armOnce('intro_request', introRequestId, requesterUserId))) return;
  await queueFollowUp(
    requesterUserId,
    null,
    DEBRIEF_KIND,
    {
      about: 'introduction',
      intro_request_id: introRequestId,
      who: targetName,
      why: `the introduction to ${targetName} was accepted ${DEBRIEF_DELAY_DAYS} days ago and no outcome is recorded`,
      technique_tag: null,
      instruction:
        `Ask the user, naturally and once, how the introduction to ${targetName} went — did they ` +
        'actually connect, and was it useful? Save anything learned about that person with ' +
        'save_contact_fact (source="debrief"). Then record the result with record_debrief_outcome ' +
        `(subject="introduction", ref_id=${introRequestId}, worked=true/false). If they have not ` +
        `met yet, call record_debrief_outcome (subject="introduction", ref_id=${introRequestId}, ` +
        'not_yet=true) and drop the topic — the question quietly returns once, then stops.',
    },
    DEBRIEF_DELAY_DAYS,
  );
}

/**
 * A relayed ask went out (status 'sent'). If it is still unanswered three
 * days later, the ASKER hears about it honestly instead of assuming the
 * recipient saw and ignored it. Answered/cancelled asks are dropped at
 * release time by filterStaleDebriefs.
 */
export async function armAskDebrief(
  askerUserId: string,
  askId: number,
  taskId: number,
  toName: string,
): Promise<void> {
  if (!(await armOnce('task_ask', askId, askerUserId))) return;
  await queueFollowUp(
    askerUserId,
    taskId,
    DEBRIEF_KIND,
    {
      about: 'relayed_ask',
      ask_id: askId,
      who: toName,
      why: `the question sent to ${toName} has had no answer for ${DEBRIEF_DELAY_DAYS} days`,
      technique_tag: null,
      instruction:
        `The question sent to ${toName} has had no answer for ${DEBRIEF_DELAY_DAYS} days. Tell ` +
        'the user honestly and ask how they want to proceed — keep waiting, or try someone else. ' +
        'If the matter got resolved outside the app, save what was learned with save_contact_fact ' +
        '(source="debrief") and record record_debrief_outcome (subject="relayed_ask", ' +
        `ref_id=${askId}, worked=true/false). If they simply want to keep waiting, call it with ` +
        'not_yet=true — the question quietly returns once, then stops.',
    },
    DEBRIEF_DELAY_DAYS,
  );
}

/**
 * A search outcome reached 'accepted' — the user took a name. Three days
 * later the assistant asks what actually happened, so the ladder (D39) moves
 * on real information, never on a returned name.
 */
export async function armSearchDebrief(userId: string, searchId: number): Promise<void> {
  if (!(await armOnce('search', searchId, userId))) return;
  const search = await query<{ query: string }>(
    `SELECT query FROM search_activity WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [searchId, userId],
    DEBRIEF_QUERY_TIMEOUT_MS,
  );
  const topic = search.rows[0]?.query ?? '';
  await queueFollowUp(
    userId,
    null,
    DEBRIEF_KIND,
    {
      about: 'search',
      search_id: searchId,
      who: null,
      why: `a search result${topic ? ` for "${topic}"` : ''} was accepted ${DEBRIEF_DELAY_DAYS} days ago and nothing further is recorded`,
      technique_tag: null,
      instruction:
        `The user accepted a name${topic ? ` for "${topic}"` : ''} ${DEBRIEF_DELAY_DAYS} days ago ` +
        'and nothing further is recorded. Ask, naturally and once, how it went. Save anything ' +
        'learned with save_contact_fact (source="debrief") and advance the ladder with ' +
        `record_search_outcome (search_id=${searchId}): "sent" if they reached out, "replied" if ` +
        'an answer came back, "followed_up" with worked=true/false if they know the result. If ' +
        `nothing has happened yet, call record_debrief_outcome (subject="search", ` +
        `ref_id=${searchId}, not_yet=true) and drop the topic — the question quietly returns ` +
        'once, then stops.',
    },
    DEBRIEF_DELAY_DAYS,
  );
}

/**
 * D49's other half — "with no outcome recorded" — applied at RELEASE time,
 * where it can actually be known: a debrief item whose subject moved on by
 * itself (the ask got answered, the search ladder advanced, the debrief rung
 * was already recorded) is dropped from the returned list. The row is already
 * 'seen', so a dropped item is consumed silently, never re-asked. A failed
 * check keeps the item — asking once too often beats losing the question.
 */
export async function filterStaleDebriefs(
  userId: string,
  updates: PendingUpdate[],
): Promise<PendingUpdate[]> {
  const kept: PendingUpdate[] = [];
  for (const update of updates) {
    if (update.kind !== DEBRIEF_KIND) {
      kept.push(update);
      continue;
    }
    try {
      if (await debriefStillDue(userId, update.payload)) kept.push(update);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[debrief] staleness check failed, keeping item:', (err as Error).message);
      kept.push(update);
    }
  }
  return kept;
}

async function debriefStillDue(userId: string, payload: Record<string, unknown>): Promise<boolean> {
  const about = payload['about'];
  if (about === 'relayed_ask') {
    const ask = await query<{ status: string }>(
      `SELECT status FROM task_asks WHERE id = $1 AND from_user_id = $2::int LIMIT 1`,
      [Number(payload['ask_id']), userId],
      DEBRIEF_QUERY_TIMEOUT_MS,
    );
    return ask.rows[0]?.status === 'sent';
  }
  if (about === 'search') {
    const search = await query<{ outcome: string | null; outcome_worked: boolean | null }>(
      `SELECT outcome, outcome_worked FROM search_activity WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [Number(payload['search_id']), userId],
      DEBRIEF_QUERY_TIMEOUT_MS,
    );
    const row = search.rows[0];
    return row !== undefined && row.outcome === 'accepted' && row.outcome_worked === null;
  }
  if (about === 'introduction') {
    return !(await hasDebriefRung('intro_request', Number(payload['intro_request_id'])));
  }
  return true;
}

async function hasDebriefRung(subjectType: string, refId: number): Promise<boolean> {
  const existing = await query<{ id: number }>(
    `SELECT id FROM outcome_events
     WHERE subject_type = $1 AND subject_id = $2 AND outcome IN ('worked', 'did_not_work')
     LIMIT 1`,
    [subjectType, String(refId)],
    DEBRIEF_QUERY_TIMEOUT_MS,
  );
  return existing.rows.length > 0;
}

export type DebriefOutcomeSubject = 'introduction' | 'relayed_ask' | 'search';

export interface DebriefOutcomeResult {
  recorded: boolean;
  /** A rung already stood for this subject — treated as success (idempotent). */
  already?: boolean;
  /** not_yet only: whether the question was re-queued (false = already used its one re-ask). */
  rearmed?: boolean;
  note?: string;
  error?: string;
}

const SUBJECT_TO_KIND: Record<DebriefOutcomeSubject, DebriefArmKind> = {
  introduction: 'intro_request',
  relayed_ask: 'task_ask',
  search: 'search',
};

/** The caller must own the subject — a ref_id is never trusted alone. */
async function ownsDebriefSubject(
  userId: string,
  subject: DebriefOutcomeSubject,
  refId: number,
): Promise<boolean> {
  const owned =
    subject === 'introduction'
      ? await query<{ id: number }>(
          `SELECT id FROM introduction_requests WHERE id = $1 AND requester_user_id = $2::int LIMIT 1`,
          [refId, userId],
          DEBRIEF_QUERY_TIMEOUT_MS,
        )
      : subject === 'relayed_ask'
        ? await query<{ id: number }>(
            `SELECT id FROM task_asks WHERE id = $1 AND from_user_id = $2::int LIMIT 1`,
            [refId, userId],
            DEBRIEF_QUERY_TIMEOUT_MS,
          )
        : await query<{ id: number }>(
            `SELECT id FROM search_activity WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [refId, userId],
            DEBRIEF_QUERY_TIMEOUT_MS,
          );
  return owned.rows.length > 0;
}

// The founder's yes (29 Aug) on the re-arm: "we have not met yet" re-queues
// the SAME question once, on the same clock, then stops for good.
// rearmed_at IS NULL is the one-shot guard.
async function rearmDebriefOnce(
  userId: string,
  subject: DebriefOutcomeSubject,
  refId: number,
): Promise<boolean> {
  const kind = SUBJECT_TO_KIND[subject];
  const claimed = await query<{ ref_id: number }>(
    `UPDATE debrief_arms SET rearmed_at = NOW()
     WHERE kind = $1 AND ref_id = $2 AND user_id = $3::int AND rearmed_at IS NULL
     RETURNING ref_id`,
    [kind, refId, userId],
    DEBRIEF_QUERY_TIMEOUT_MS,
  );
  if (claimed.rows.length === 0) return false;

  const { who, taskId } = await rearmContext(userId, subject, refId);
  const refField =
    subject === 'introduction'
      ? 'intro_request_id'
      : subject === 'relayed_ask'
        ? 'ask_id'
        : 'search_id';
  const about =
    subject === 'introduction'
      ? 'introduction'
      : subject === 'relayed_ask'
        ? 'relayed_ask'
        : 'search';
  await queueFollowUp(
    userId,
    taskId,
    DEBRIEF_KIND,
    {
      about,
      [refField]: refId,
      who,
      why: `the user said "not yet" last time — this is the ONE follow-up, ${DEBRIEF_DELAY_DAYS} days later`,
      technique_tag: null,
      instruction:
        `Second and LAST debrief${who ? ` about ${who}` : ''}: the user previously said it had ` +
        'not happened yet. Ask once, lightly. Record the result the same way as before ' +
        '(save_contact_fact source="debrief"; record_search_outcome for searches, ' +
        'record_debrief_outcome otherwise). If still nothing, drop it for good — never ask again.',
    },
    DEBRIEF_DELAY_DAYS,
  );
  return true;
}

/** The little context a re-asked question needs to sound human. Best-effort. */
async function rearmContext(
  userId: string,
  subject: DebriefOutcomeSubject,
  refId: number,
): Promise<{ who: string | null; taskId: number | null }> {
  try {
    if (subject === 'introduction') {
      const r = await query<{ target_name: string }>(
        `SELECT target_name FROM introduction_requests WHERE id = $1 LIMIT 1`,
        [refId],
        DEBRIEF_QUERY_TIMEOUT_MS,
      );
      return { who: r.rows[0]?.target_name ?? null, taskId: null };
    }
    if (subject === 'relayed_ask') {
      const r = await query<{ task_id: number; name: string | null }>(
        `SELECT ta.task_id, u.name FROM task_asks ta
         LEFT JOIN "User" u ON u.id = ta.to_user_id
         WHERE ta.id = $1 LIMIT 1`,
        [refId],
        DEBRIEF_QUERY_TIMEOUT_MS,
      );
      return { who: r.rows[0]?.name ?? null, taskId: r.rows[0]?.task_id ?? null };
    }
    const r = await query<{ query: string }>(
      `SELECT query FROM search_activity WHERE id = $1 LIMIT 1`,
      [refId],
      DEBRIEF_QUERY_TIMEOUT_MS,
    );
    return { who: r.rows[0]?.query ?? null, taskId: null };
  } catch {
    return { who: null, taskId: null };
  }
}

/**
 * The debrief answer's rung for non-search subjects (searches use their own
 * ladder via record_search_outcome). Scoped to the caller's own subject — a
 * ref_id is never trusted alone, the same rule as every reference in this
 * codebase. One rung per subject: worked and did_not_work never coexist.
 * notYet writes NO rung: it spends the subject's single re-ask instead —
 * subject "search" is accepted ONLY on this path.
 */
export async function recordDebriefOutcome(
  userId: string,
  subject: DebriefOutcomeSubject,
  refId: number,
  worked: boolean,
  notYet = false,
): Promise<DebriefOutcomeResult> {
  if (!Number.isFinite(refId) || refId <= 0) {
    return { recorded: false, error: 'Pass the ref_id from the debrief item itself.' };
  }
  if (!(await ownsDebriefSubject(userId, subject, refId))) {
    return { recorded: false, error: 'No such introduction, ask or search of yours.' };
  }

  if (notYet) {
    const rearmed = await rearmDebriefOnce(userId, subject, refId);
    return {
      recorded: true,
      rearmed,
      note: rearmed
        ? `Noted — the question will quietly return once, in ${DEBRIEF_DELAY_DAYS} days.`
        : 'Noted — this was already the follow-up ask; the topic is closed for good now.',
    };
  }

  if (subject === 'search') {
    return {
      recorded: false,
      error:
        'A search outcome goes through record_search_outcome — this tool only takes not_yet for searches.',
    };
  }

  const subjectType = SUBJECT_TO_KIND[subject];
  if (await hasDebriefRung(subjectType, refId)) {
    return { recorded: true, already: true };
  }
  await query(
    `INSERT INTO outcome_events (user_id, subject_type, subject_id, outcome)
     VALUES ($1::int, $2, $3, $4)
     ON CONFLICT (subject_type, subject_id, outcome) DO NOTHING`,
    [userId, subjectType, String(refId), worked ? 'worked' : 'did_not_work'],
    DEBRIEF_QUERY_TIMEOUT_MS,
  );
  return { recorded: true };
}
