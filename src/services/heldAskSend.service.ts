import { query } from '../db/postgres/client';
import { HeldAsk } from './heldAsks.service';
import { createAsk } from './taskAsks.service';

/**
 * Board #391: a question an approved plan was going to send, held only by the
 * recipient's 24-hour limit, is sent by the SERVER when the window reopens.
 * Telling the run to send it (the tester's 983) still left the send to the
 * model's judgement, and a run that hesitates asks the owner for a second yes
 * — the very thing D119 forbids.
 *
 * Every question goes through createAsk, so it meets the same permission,
 * plan, opt-out and limit walls the run's own send meets: the server sends
 * nothing the run could not have sent. The run is told afterwards what went.
 */
const QUERY_TIMEOUT_MS = 5_000;
const NO_PHONE_REASON = 'no_phone';

export interface HeldAskOutcome {
  readonly contact_name: string;
  readonly question: string;
  readonly sent: boolean;
  /** Why it did not go; absent when it went. */
  readonly reason?: string;
}

export interface HeldAskOwner {
  readonly ownerId: string;
  readonly taskId: number;
  readonly threadId: number | undefined;
}

/** A number of the person's own, for a row held before the plan's phone id was kept. */
async function phoneOfUser(userId: number): Promise<string | null> {
  const result = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1 AND phone IS NOT NULL ORDER BY id LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.phone ?? null;
}

async function sendOne(owner: HeldAskOwner, held: HeldAsk): Promise<HeldAskOutcome> {
  const base = { contact_name: held.contact_name, question: held.question };
  const phone = held.contact_phone ?? (await phoneOfUser(held.to_user_id));
  if (phone === null) return { ...base, sent: false, reason: NO_PHONE_REASON };
  const outcome = await createAsk(
    owner.ownerId,
    owner.taskId,
    phone,
    held.question,
    undefined,
    owner.threadId,
  );
  return outcome.sent
    ? { ...base, sent: true }
    : { ...base, sent: false, reason: outcome.reason ?? 'refused' };
}

/** Sends each released question once, in order; a failure on one never stops the rest. */
export async function sendReleasedHeldAsks(
  owner: HeldAskOwner,
  held: readonly HeldAsk[],
): Promise<HeldAskOutcome[]> {
  const outcomes: HeldAskOutcome[] = [];
  for (const h of held) {
    try {
      outcomes.push(await sendOne(owner, h));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[held-ask] task ${owner.taskId}: held question ${h.id} not sent:`,
        (err as Error).message,
      );
      outcomes.push({
        contact_name: h.contact_name,
        question: h.question,
        sent: false,
        reason: 'error',
      });
    }
  }
  return outcomes;
}

/**
 * What the wake run is told. In Georgian like the engine's other events; the
 * run answers in the owner's language whatever this is written in. No phone
 * id ever reaches it (D149).
 */
export function heldAsksSentNote(outcomes: readonly HeldAskOutcome[]): string {
  const sent = outcomes.filter((o) => o.sent);
  const notSent = outcomes.filter((o) => !o.sent);
  const parts: string[] = [];
  if (sent.length > 0) {
    const lines = sent.map((o) => `• ${o.contact_name}: „${o.question}"`).join('\n');
    parts.push(
      'მიმღების 24-საათიანი ზღვარი გაიხსნა და სერვერმა ეს დაკავებული კითხვები უკვე გააგზავნა:\n' +
        `${lines}\n` +
        'ხელახლა არ გაგზავნო. გეგმა დამტკიცებულია — ეს თვითონ არის თანხმობა (D119), ამიტომ ' +
        'მფლობელს არაფერს ეკითხები. ერთი ხაზით უთხარი, ვის მიეწერა.',
    );
  }
  if (notSent.length > 0) {
    const lines = notSent.map((o) => `• ${o.contact_name} — ${o.reason ?? 'refused'}`).join('\n');
    parts.push(
      'ეს დაკავებული კითხვები ზღვრის გახსნის შემდეგაც ვერ გაიგზავნა:\n' +
        `${lines}\n` +
        'ზღვარზე და „ალბათ"-ზე არ ილაპარაკო; თუ მიზეზი ისევ ზღვარია, სერვერი თვითონ ' +
        'გააგზავნის, როცა გაიხსნება.',
    );
  }
  return parts.join('\n\n');
}

/**
 * The tester's 1128 (#391, goal conversation 32203): the reopening was checked
 * twice, ten minutes apart, the limit still held both times, and each check
 * woke the owner with a long „nothing new" about the limit and a „writing to
 * him" step. createAsk has already held the question again and moved the
 * goal's wake to the new reopening, so there is nothing to tell anybody.
 */
export function isStillHeldByTheLimit(outcome: HeldAskOutcome): boolean {
  return !outcome.sent && outcome.reason === STILL_HELD_REASON;
}

const STILL_HELD_REASON = 'recipient_daily_limit_reached';
