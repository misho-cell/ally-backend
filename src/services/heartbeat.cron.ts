import anthropic from '../config/anthropic';
import { query } from '../db/postgres/client';
import { recordClaudeUsage } from './costLedger.service';

/**
 * THE POSITIVE PROBE — silence becomes evidence instead of the absence of it.
 *
 * `outage.sh` has three verdicts and the third is NOTHING PROVEN: no errors
 * and no Anthropic call in the window. On 22 September an outage ran from
 * 12:04 and was found at 12:55 from a screenshot; the monitor was built that
 * evening and then `NIGHT_QUESTIONS.md` item D recorded what it still could not
 * see — at night, NOTHING PROVEN is the normal answer, so an outage starting at
 * midnight would be found by the first person awake. Nine hours.
 *
 * Last night the free half of that was closed: the crons already call the
 * provider every night, so `outage.sh` now measures how long the silence has
 * run and shouts past 240 minutes — because the longest normal silence in the
 * previous seven nights was 205. Nine hours became four.
 *
 * ════════ WHY THE LAST FOUR HOURS WAITED, AND WHY THEY SHOULD NOT HAVE ════════
 *
 * Item D says the fix „is a positive probe … and a probe costs money, which is
 * Misho's to authorise". That sentence stood for a day and **nobody had
 * multiplied it out**. One Haiku call is twelve input tokens and one output
 * token:
 *
 *     every 30 minutes through a nine-hour night   0.0003 USD per night
 *                                                  0.009  USD per month
 *
 * Under a cent a month. „It costs money" was true and useless — the decision
 * had been deferred on a number nobody had computed. Misho delegated this one
 * („შენით გადაწყვიტე"), and with the cost in front of me it is not a close
 * call.
 *
 * ════════ IT ONLY FIRES INTO SILENCE ════════
 *
 * The probe is pointless when the product is busy — a real call already proves
 * the provider answers, and is free. So this asks the ledger first and returns
 * without spending anything if anybody has called Anthropic recently. By day it
 * will essentially never fire. At night it fills the gaps the crons leave.
 *
 * ════════ AND IT MUST NEVER BE READ AS „THE PRODUCT ANSWERED" ════════
 *
 * `outage.sh`'s OK line means „N Anthropic calls went through", which it reads
 * as the product serving people. A heartbeat proves the PROVIDER answers and
 * nothing else — a product that is completely broken would still have one.
 * **Counting it there would build a new blindness in the act of closing an old
 * one**, so it is recorded under its own kind and the script excludes it from
 * that count while using it for the silence test.
 *
 * That is the whole reason this is a separate `kind` rather than a chat call
 * with a clever prompt.
 */

/** Cheapest model in the price table; this asks it for one token. */
const HEARTBEAT_MODEL = process.env.HEARTBEAT_MODEL?.trim() || 'claude-haiku-4-5-20251001';

/** How often to look. Looking is free; only the call costs anything. */
const CHECK_INTERVAL_MS = 10 * 60_000;

/**
 * Only probe when the provider has been quiet this long. Twenty-five minutes
 * sits under `outage.sh`'s twenty-minute window without firing on every gap
 * between two ordinary runs.
 */
const SILENCE_BEFORE_PROBE_MIN = 25;

/** A probe that hangs is not a probe. */
const PROBE_TIMEOUT_MS = 20_000;

async function minutesSinceLastAnthropicCall(): Promise<number | null> {
  try {
    const result = await query<{ quiet_min: number | null }>(
      `SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 60)::int AS quiet_min
         FROM usage_events
        WHERE provider = 'anthropic'`,
    );
    const quiet = result.rows[0]?.quiet_min;
    return quiet === null || quiet === undefined ? null : Number(quiet);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[heartbeat] could not read the ledger:', (err as Error).message);
    return null;
  }
}

/**
 * One call into the silence. Never throws: a failing heartbeat is itself the
 * signal, and it reaches the monitor as „still silent" rather than as a crash.
 */
export async function beatOnce(): Promise<'sent' | 'not_needed' | 'failed'> {
  const quiet = await minutesSinceLastAnthropicCall();
  // A ledger that will not answer is not a reason to spend: the monitor has
  // its own „CANNOT TELL" for that, and it is the honest verdict there too.
  if (quiet === null || quiet < SILENCE_BEFORE_PROBE_MIN) return 'not_needed';

  try {
    const response = await anthropic.messages.create(
      {
        model: HEARTBEAT_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      },
      { timeout: PROBE_TIMEOUT_MS },
    );
    void recordClaudeUsage({
      userId: null,
      // Its own kind, so nothing can mistake it for the product answering
      // somebody. `outage.sh` excludes it from the answered-calls count.
      kind: 'heartbeat',
      model: HEARTBEAT_MODEL,
      usage: response.usage,
    }).catch(() => {});
    // eslint-disable-next-line no-console
    console.log(`[heartbeat] provider answered after ${quiet} min of silence`);
    return 'sent';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[heartbeat] PROVIDER DID NOT ANSWER after ${quiet} min of silence: ${(err as Error).message}`,
    );
    return 'failed';
  }
}

export function startHeartbeat(): void {
  // eslint-disable-next-line no-console
  console.log(
    `[heartbeat] started — one ${HEARTBEAT_MODEL} call when the provider has been ` +
      `silent ${SILENCE_BEFORE_PROBE_MIN}+ min, checked every ${CHECK_INTERVAL_MS / 60_000} min`,
  );
  setInterval(() => {
    void beatOnce().catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[heartbeat] sweep failed:', (err as Error).message),
    );
  }, CHECK_INTERVAL_MS).unref();
}
