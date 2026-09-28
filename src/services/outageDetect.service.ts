import { query } from '../db/postgres/client';
import {
  alarmText,
  claimFirstAlert,
  clearResolved,
  markRecoveryTold,
  openIncident,
  recoveryText,
} from './outageAlarm.service';
import { sendOutageAlarm } from './outageAlarm.send';

/**
 * WHERE „THE PROVIDER IS REFUSING" BECOMES A MESSAGE TO FOUR PEOPLE.
 *
 * ⚠️ AND WHY THE HEARTBEAT IS THE DETECTOR RATHER THAN ANY COUNT.
 *
 * On 28 September the product answered nobody from 02:34:01, and the thing
 * that made it hard was not the size of the failure — it was that SILENCE AND
 * DEATH LOOK IDENTICAL from the outside. `outage.sh` has a verdict called
 * NOTHING PROVEN for exactly this: no errors and no calls could mean the
 * provider is down or could mean it is four in the morning and nobody is
 * using the product.
 *
 * Every detector built on counting — errors, missing rows, quiet windows — is
 * an inference from absence, and the whole lesson of that night is that an
 * inference from absence is not evidence. The heartbeat is different in kind:
 * it makes a REAL call and gets a REAL answer. „The provider said no" is a
 * fact, with the provider's own sentence attached.
 *
 * So the probe speaks and nothing else does. The other three causes the
 * founder named — the API down, login codes failing, the database
 * unreachable — are NOT detected here and are not pretended to be. Each needs
 * its own positive probe, and a detector that shrugs is worse than an absent
 * one because people believe it.
 */

/** Which of the four this file can honestly speak for. */
const PROVIDER = 'provider_refusing' as const;

/**
 * How many people this outage has actually reached, counted rather than
 * guessed: distinct owners who have had a failure written into their thread
 * since the provider went quiet.
 *
 * ⚠️ IT IS A COUNT OF PEOPLE, NOT OF FAILURES. On the night this was written
 * thirty-four goals died across seven people, and „34" in a message at three
 * in the morning reads as thirty-four humans. The number that decides whether
 * somebody gets out of bed is how many PEOPLE, and the two differ by a factor
 * of five here.
 */
async function peopleHitSince(since: string): Promise<number> {
  try {
    const rows = await query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n
         FROM conversations
        WHERE role = 'assistant' AND kind = 'error'
          AND created_at >= $1::timestamptz`,
      [since],
      8_000,
    );
    return Number(rows.rows[0]?.n ?? 0);
  } catch {
    // A count that cannot be read must not stop the alarm. „nobody affected
    // yet" is what the words say for 0, and being told late-but-wrong about
    // the size beats not being told at all.
    return 0;
  }
}

/**
 * The probe asked and the provider refused.
 *
 * Opens the incident if it is new, and speaks exactly once — the claim is
 * atomic, so two containers overlapping during a deploy still produce one
 * message.
 */
export async function noticeProviderRefusing(providerSentence: string): Promise<void> {
  const incident = await openIncident(PROVIDER, providerSentence, 0);
  if (incident === null || incident.alerted_at !== null) return;

  const people = await peopleHitSince(incident.started_at);
  if (!(await claimFirstAlert(incident.id))) return;

  const outcome = await sendOutageAlarm(
    alarmText({ ...incident, people_affected: people }, new Date()),
  );
  // eslint-disable-next-line no-console
  console.log(`[outage-alarm] provider_refusing, first alert: ${outcome}`);
}

/**
 * The probe asked and the provider answered.
 *
 * ⚠️ „IT IS BACK" GOES ONLY TO PEOPLE WHO WERE TOLD IT BROKE. A refusal that
 * opened and cleared between two probes — one bad minute — would otherwise
 * send four people a cheerful recovery for a problem they never saw, and that
 * is how an alarm earns being muted. `clearResolved` hands back only the
 * incidents that were actually announced.
 */
export async function noticeProviderAnswering(): Promise<void> {
  const announced = await clearResolved([]);
  for (const incident of announced) {
    if (incident.cause !== PROVIDER) continue;
    const outcome = await sendOutageAlarm(recoveryText(incident, new Date()));
    await markRecoveryTold(incident.id);
    // eslint-disable-next-line no-console
    console.log(`[outage-alarm] provider_refusing, recovery: ${outcome}`);
  }
}
