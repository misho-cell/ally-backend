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
 * How far back this is willing to look for the start of an outage. A bound
 * rather than a belief: a scan with no floor gets slower every day the table
 * grows, and no alarm needs to reach further back than two days.
 */
const LOOK_BACK_HOURS = 48;

/**
 * How many people this outage has actually reached, counted rather than
 * guessed: distinct owners who have had a failure written into their thread
 * since the provider last answered us.
 *
 * ⚠️ IT IS A COUNT OF PEOPLE, NOT OF FAILURES. On the night this was written
 * thirty-four goals died across seven people, and „34" in a message at three
 * in the morning reads as thirty-four humans. The number that decides whether
 * somebody gets out of bed is how many PEOPLE, and the two differ by a factor
 * of five here.
 *
 * ════════ ⚠️ AND IT COUNTS FROM THE PROVIDER, NOT FROM THE INCIDENT ════════
 *
 * The first version of this took the incident's `started_at` and counted
 * errors after it. That timestamp is not when the outage started — it is when
 * the PROBE NOTICED, and the probe notices at most ten minutes after it next
 * runs and at least one second before this count is taken. So the window was
 * always about a second wide and the answer was always zero.
 *
 * MEASURED: on 28 September the provider stopped at 02:34:00 and the alarm
 * opened at 09:10:40. It went out saying „nobody affected yet". By then
 * FIFTEEN PEOPLE had eighty-four failures written into their threads, four of
 * them from lines they had typed themselves. The number was not wrong by a
 * little; it was the only number in the message that decides whether somebody
 * gets out of bed, and it said nobody.
 *
 * The honest anchor is the last moment the provider actually answered us —
 * `usage_events` is written on success, so its newest Anthropic row IS that
 * moment, to the second (02:34:00.375, twelve seconds before the first
 * failure). Not the last time the product replied to somebody: the connector
 * kept answering through that outage on a different key, and anchoring there
 * would have said nine people instead of fifteen.
 */
async function peopleHitByThisOutage(): Promise<number> {
  try {
    const rows = await query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n
         FROM conversations
        WHERE role = 'assistant'
          AND kind = 'error'
          AND created_at > GREATEST(
                NOW() - make_interval(hours => $1::int),
                COALESCE((SELECT MAX(created_at) FROM usage_events
                           WHERE provider = 'anthropic'), to_timestamp(0)))`,
      [LOOK_BACK_HOURS],
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

  const people = await peopleHitByThisOutage();
  if (!(await claimFirstAlert(incident.id, people))) return;

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
