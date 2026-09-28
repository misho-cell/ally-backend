import { query } from '../db/postgres/client';

/**
 * ⚠️ THE SERVER KNEW FOR FIVE HOURS AND HAD NO WAY TO SAY SO.
 *
 * 28 September, 02:34:01: the provider began refusing every request. Thirty-four
 * goals across seven people died — five of them real people, the founder's own
 * account among them — and every one of those goals had its next wake pushed a
 * full day, so raising the limit would not even bring them back.
 *
 * `outage.sh` saw it. The heartbeat saw it, and named the provider's own
 * sentence, within a minute. Neither could tell a person. The tester's seat
 * found out at 02:56 only because it happened to be awake at two in the
 * morning; the founder found out over breakfast.
 *
 * That is the 22 September lesson relearned in a new place. On that day an
 * outage ran from 12:04 and was found at 12:55 from a screenshot — fifty
 * minutes, and the evidence had been in the database the whole time. What was
 * missing then was a question nobody asked. What was missing this time is a
 * mouth.
 *
 * ════════ WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT ════════
 *
 * It is the MEMORY and the LIFECYCLE of an outage: a cause opens once, is told
 * once, clears once, and is told once more. It is not the detector, and it is
 * not the sender. Those are separate on purpose — a detector that also decides
 * whether to shout is a detector nobody can test.
 *
 * ⚠️ AND THE MEMORY IS IN THE DATABASE BECAUSE A DEPLOY EMPTIES EVERYTHING
 * ELSE. The night this exists because of had thirteen deploys in it. An alarm
 * remembering in a variable would have shouted thirty-four times or forgotten
 * it had shouted at all, and both of those teach people to ignore it.
 */

/** The four the founder named. Text in the table; a union here. */
export type OutageCause = 'provider_refusing' | 'api_down' | 'login_codes' | 'database';

export interface OpenIncident {
  readonly id: number;
  readonly cause: OutageCause;
  readonly detail: string;
  readonly people_affected: number;
  readonly started_at: string;
  readonly alerted_at: string | null;
}

const ALARM_TIMEOUT_MS = 8_000;

/**
 * Open an incident for a cause, or leave the open one alone.
 *
 * ⚠️ THE „OR LEAVE IT ALONE" IS THE WHOLE PROMISE. „One message per problem,
 * however many failures sit behind it" is true only if a second incident can
 * never be opened while the first is open — and it is the partial unique index
 * that makes that true, not this function. During a deploy two containers
 * overlap and both will call this in the same second; `ON CONFLICT DO NOTHING`
 * lets the loser lose quietly instead of racing.
 *
 * Returns the open incident either way, so the caller always knows whether
 * anybody has been told yet.
 */
export async function openIncident(
  cause: OutageCause,
  detail: string,
  peopleAffected: number,
): Promise<OpenIncident | null> {
  await query(
    `INSERT INTO outage_incidents (cause, detail, people_affected)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [cause, detail.slice(0, 500), Math.max(0, Math.floor(peopleAffected))],
    ALARM_TIMEOUT_MS,
  );
  const open = await query<OpenIncident>(
    `SELECT id, cause, detail, people_affected, started_at::text, alerted_at::text
       FROM outage_incidents
      WHERE cause = $1 AND cleared_at IS NULL
      LIMIT 1`,
    [cause],
    ALARM_TIMEOUT_MS,
  );
  return open.rows[0] ?? null;
}

/**
 * Claim the right to send the first alert for an incident — atomically.
 *
 * ⚠️ TWO CONTAINERS, ONE MESSAGE. A deploy leaves the old process and the new
 * one running together for a few seconds, and an outage is most likely to be
 * noticed in exactly that window. Reading `alerted_at` and then sending would
 * let both read NULL and both send. The UPDATE carries its own condition and
 * `RETURNING` names the winner; the loser gets false and says nothing.
 *
 * Same shape as `claimSweep`, for the same reason and against the same fault.
 */
export async function claimFirstAlert(incidentId: number): Promise<boolean> {
  const won = await query<{ id: number }>(
    `UPDATE outage_incidents
        SET alerted_at = NOW()
      WHERE id = $1 AND alerted_at IS NULL
      RETURNING id`,
    [incidentId],
    ALARM_TIMEOUT_MS,
  );
  return won.rows.length > 0;
}

/**
 * Close every open incident whose cause is no longer true, and hand back the
 * ones that nobody has been told about yet — so the „it is back" message goes
 * out exactly once, and only to people who were told it broke.
 *
 * ⚠️ NEVER TELLING SOMEBODY IT IS FIXED WHEN THEY WERE NEVER TOLD IT BROKE.
 * An incident that opened and cleared between two sweeps — a blip — would
 * otherwise produce a cheerful „the assistant is answering again" to four
 * people who saw nothing wrong. `alerted_at IS NOT NULL` is what stops that,
 * and it is the difference between an alarm people trust and one they mute.
 */
export async function clearResolved(stillBroken: readonly OutageCause[]): Promise<OpenIncident[]> {
  const cleared = await query<OpenIncident>(
    `UPDATE outage_incidents
        SET cleared_at = NOW()
      WHERE cleared_at IS NULL
        AND NOT (cause = ANY($1::text[]))
      RETURNING id, cause, detail, people_affected, started_at::text, alerted_at::text`,
    [[...stillBroken]],
    ALARM_TIMEOUT_MS,
  );
  return cleared.rows.filter((row) => row.alerted_at !== null);
}

/** Mark that the „it is back" message has gone, so it cannot go twice. */
export async function markRecoveryTold(incidentId: number): Promise<void> {
  await query(
    `UPDATE outage_incidents
        SET recovery_alerted_at = NOW()
      WHERE id = $1 AND recovery_alerted_at IS NULL`,
    [incidentId],
    ALARM_TIMEOUT_MS,
  );
}

/** Everything currently open, for the startup sweep and for reading by hand. */
export async function openIncidents(): Promise<OpenIncident[]> {
  const rows = await query<OpenIncident>(
    `SELECT id, cause, detail, people_affected, started_at::text, alerted_at::text
       FROM outage_incidents
      WHERE cleared_at IS NULL
      ORDER BY started_at`,
    [],
    ALARM_TIMEOUT_MS,
  );
  return rows.rows;
}

/**
 * The words a person reads. In English, because that is the language the
 * founder writes to us in, and plain because somebody will read it on a lock
 * screen at two in the morning.
 *
 * His three requirements, in his order: what broke, since when, how many
 * people — and then the one thing that fixes it and who can do it. The last
 * line is the one that matters: an alarm that does not say what to do is a
 * worry, not a message.
 */
const WHO_FIXES: Record<OutageCause, string> = {
  provider_refusing: 'raise the Anthropic spend limit — Tornike or Lika',
  api_down: 'check the deploy and the container logs — Misho',
  login_codes: 'check the Twilio account and balance — Tornike or Lika',
  database: 'check the database on Railway — Misho',
};

const WHAT_BROKE: Record<OutageCause, string> = {
  provider_refusing: 'The assistant cannot answer anybody: the AI provider is refusing',
  api_down: 'The Netai API is down or restarting in a loop',
  login_codes: 'Login codes are not being delivered',
  database: 'The database is unreachable',
};

export function alarmText(incident: OpenIncident, now: Date): string {
  const since = new Date(incident.started_at);
  const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
  const howLong = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  const people =
    incident.people_affected > 0
      ? `${incident.people_affected} people affected`
      : 'nobody affected yet';
  return (
    `⚠️ Netai: ${WHAT_BROKE[incident.cause]}. ` +
    `Since ${since.toISOString().slice(11, 16)} UTC (${howLong}). ${people}. ` +
    `Detail: ${incident.detail}. ` +
    `To fix: ${WHO_FIXES[incident.cause]}.`
  );
}

export function recoveryText(incident: OpenIncident, now: Date): string {
  const since = new Date(incident.started_at);
  const minutes = Math.max(1, Math.round((now.getTime() - since.getTime()) / 60_000));
  const howLong = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  return `✅ Netai: ${WHAT_BROKE[incident.cause]} — this is now fixed. It lasted ${howLong}.`;
}
