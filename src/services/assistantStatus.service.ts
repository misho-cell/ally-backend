import { query } from '../db/postgres/client';

/**
 * D699 (frontend 9 Oct, 19:30Z): the real „online" dot — green only while the
 * assistant actually answers, „Netai არ პასუხობს …-დან" while it does not,
 * and NOTHING while we do not know. A dot the client guessed would be green
 * through an outage, so the server says which of the three it is.
 *
 * The evidence is the heartbeat's own (heartbeat.cron.ts): `usage_events` is
 * written on every successful Anthropic call, the probe's included, and an
 * open `provider_refusing` incident is the probe hearing a refusal. While the
 * provider answers, a success is never older than the probe's silence
 * threshold plus one check interval (25 + 10 minutes); past that the heartbeat
 * itself has stopped looking, and „answering" would be a guess.
 */
const QUERY_TIMEOUT_MS = 4_000;

/** 25 min of silence before a probe + a 10 min check interval + slack for the probe itself. */
export const FRESH_EVIDENCE_MS = 45 * 60_000;

const PROVIDER_REFUSING = 'provider_refusing';

export enum AssistantState {
  Answering = 'answering',
  NotAnswering = 'not_answering',
  Unknown = 'unknown',
}

export interface AssistantStatus {
  readonly state: AssistantState;
  /** When the refusal began; null unless not_answering. */
  readonly since: string | null;
  /** The newest evidence behind the state: the last answer, or the refusal's start. */
  readonly checked_at: string | null;
}

export interface StatusEvidence {
  readonly lastAnswer: Date | null;
  readonly refusingSince: Date | null;
}

/** The three states from the two facts, at `now`. Pure. */
export function assistantStateFrom(evidence: StatusEvidence, now: Date): AssistantStatus {
  const { lastAnswer, refusingSince } = evidence;
  const answeredSinceRefusal =
    lastAnswer !== null && (refusingSince === null || lastAnswer > refusingSince);
  if (refusingSince !== null && !answeredSinceRefusal) {
    const since = refusingSince.toISOString();
    return { state: AssistantState.NotAnswering, since, checked_at: since };
  }
  const checkedAt = lastAnswer === null ? null : lastAnswer.toISOString();
  if (lastAnswer !== null && now.getTime() - lastAnswer.getTime() <= FRESH_EVIDENCE_MS) {
    return { state: AssistantState.Answering, since: null, checked_at: checkedAt };
  }
  return { state: AssistantState.Unknown, since: null, checked_at: checkedAt };
}

async function statusEvidence(): Promise<StatusEvidence> {
  const result = await query<{ last_answer: Date | null; refusing_since: Date | null }>(
    `SELECT (SELECT MAX(created_at) FROM usage_events WHERE provider = 'anthropic') AS last_answer,
            (SELECT started_at FROM outage_incidents
              WHERE cause = $1 AND cleared_at IS NULL
              ORDER BY started_at DESC
              LIMIT 1) AS refusing_since`,
    [PROVIDER_REFUSING],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    lastAnswer: row?.last_answer ? new Date(row.last_answer) : null,
    refusingSince: row?.refusing_since ? new Date(row.refusing_since) : null,
  };
}

export async function assistantStatus(now: Date = new Date()): Promise<AssistantStatus> {
  return assistantStateFrom(await statusEvidence(), now);
}
