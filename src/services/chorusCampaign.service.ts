import { query } from '../db/postgres/client';
import {
  buildTargetList,
  bestPersonLabels,
  ownPeopleDigits,
  TargetScoreEntry,
} from './targetScoring.service';
import { queueFollowUp } from './pendingUpdates.service';
import { createThread, saveThreadMessage } from './threads.service';
import { setThreadStatus } from './threadStatus.service';
import { emitThreadCreated } from './sse.service';
import { sendPushNotification } from './notification.service';
import { phoneDigits } from './phone';

const CAMPAIGN_QUERY_TIMEOUT_MS = 8_000;
// The typed pending_updates item a due ask ALSO becomes (T9's one list).
const CHORUS_ASK_KIND = 'chorus_ask';

// D50 (ticket 7 task 14): the technique tag is THREE values per growth ask —
// WHEN to ask (1-4), HOW to phrase (5-8), the REASON given (9-10). NULL =
// unknown, allowed but counted.
export interface TechniqueTag {
  when: number | null;
  how: number | null;
  reason: number | null;
}

const TECHNIQUE_RANGES: Record<keyof TechniqueTag, readonly [number, number]> = {
  when: [1, 4],
  how: [5, 8],
  reason: [9, 10],
};

/**
 * One group's value: an integer inside its range, 0 for an explicit "none"
 * (ticket 8 task 5: known, and known to be absent — a scheduled ask has no
 * conversational moment, a message without reason text gave no reason), or
 * null for genuinely unknown. Out-of-range → null, never approximated.
 */
export function parseTechniqueValue(group: keyof TechniqueTag, value: unknown): number | null {
  const n = Number(value);
  const [min, max] = TECHNIQUE_RANGES[group];
  return Number.isInteger(n) && (n === 0 || (n >= min && n <= max)) ? n : null;
}

// Chorus stamps its own values on every ask it sends (D50) — config, not
// deploy, so the founder flips them when the fixed message changes. WHEN is a
// schedule with no conversational moment (0, explicit none) and REASON is
// whatever the env declares (9 since 29 Aug; 0 = none if the text loses it).
//
// HOW is no longer read from here (ticket 9 task 22): it comes from the
// variant actually sent, so the stamp cannot drift from the words. The env
// default stays for the follow-up payload's shape and for anyone reading the
// config expecting all three.
const CHORUS_TECHNIQUE: TechniqueTag = {
  when: parseTechniqueValue('when', process.env.CHORUS_TECHNIQUE_WHEN ?? 0),
  how: parseTechniqueValue('how', process.env.CHORUS_TECHNIQUE_HOW ?? 5),
  reason: parseTechniqueValue('reason', process.env.CHORUS_TECHNIQUE_REASON ?? 0),
};

// Ticket 6, engine T8 ("Chorus"): fully automatic invite campaigns targeting
// T7's weekly non-user list. Per target: chosen inviter-users, each walking
// pending -> asked -> agreed/declined -> told -> joined. No manual mode —
// every step here is meant to run off a cron tick (chorusCampaign.cron.ts),
// never a human clicking a button.

// One campaign per target within this window (spec: "90-day cooldown").
const COOLDOWN_DAYS = 90;
/**
 * And at most one invite ask per INVITER in this window (ticket 9 task 13.2,
 * the founder's „one at a time"). Six arrived inside one minute because six
 * campaigns each scheduled him without knowing about the others. A different
 * number is a config change, not a deploy.
 */
const INVITE_ASK_COOLDOWN_DAYS = Number(process.env.INVITE_ASK_COOLDOWN_DAYS ?? 7);
// "start 6-10" — the low/high ends of a fresh campaign's inviter count.
const STARTING_DIAL_MIN = 6;
const STARTING_DIAL_MAX = 10;
const STARTING_DIAL_DEFAULT = Number(process.env.CHORUS_STARTING_DIAL ?? 8);
// The explicit ceiling the dial may auto-step toward while campaigns fail.
const DIAL_CEILING = 15;
const DIAL_STEP = Number(process.env.CHORUS_DIAL_STEP ?? 1);
// How many of the most recently CLOSED campaigns set the trend the dial
// reacts to — few enough to move quickly, many enough not to swing on one.
const TREND_WINDOW = 10;
// A closed-campaign failure rate above this steps the dial UP (try harder);
// at or below it, DOWN (conserve ask budget).
const FAILURE_RATE_STEP_UP_THRESHOLD = 0.5;

// Staggered scheduling, in days after the campaign opens — "day-spacing is a
// config variable, start 1-4-7-10". A dial beyond this array's length keeps
// repeating the last interval (day 10, 13, 16…) rather than inventing a new
// curve.
const DAY_SPACING_DAYS = (process.env.CHORUS_DAY_SPACING_DAYS ?? '1,4,7,10')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

function scheduledOffsetDays(inviterIndex: number): number {
  if (inviterIndex < DAY_SPACING_DAYS.length) return DAY_SPACING_DAYS[inviterIndex];
  const last = DAY_SPACING_DAYS[DAY_SPACING_DAYS.length - 1] ?? 1;
  const step =
    DAY_SPACING_DAYS.length >= 2 ? last - DAY_SPACING_DAYS[DAY_SPACING_DAYS.length - 2] : last;
  return last + step * (inviterIndex - DAY_SPACING_DAYS.length + 1);
}

/** The dial's current value: the trend across recently CLOSED campaigns, clamped to spec's own bounds. */
export async function currentGlobalDial(): Promise<number> {
  const recent = await query<{ status: string }>(
    `SELECT status FROM invite_campaigns
     WHERE status != 'open' ORDER BY closed_at DESC NULLS LAST LIMIT $1`,
    [TREND_WINDOW],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  if (recent.rows.length === 0) {
    return Math.min(STARTING_DIAL_MAX, Math.max(STARTING_DIAL_MIN, STARTING_DIAL_DEFAULT));
  }
  const failed = recent.rows.filter((r) => r.status !== 'closed_joined').length;
  const failureRate = failed / recent.rows.length;
  const lastDialResult = await query<{ ask_count_dial: number }>(
    `SELECT ask_count_dial FROM invite_campaigns ORDER BY opened_at DESC LIMIT 1`,
    [],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const lastDial = lastDialResult.rows[0]?.ask_count_dial ?? STARTING_DIAL_DEFAULT;
  const stepped =
    failureRate > FAILURE_RATE_STEP_UP_THRESHOLD ? lastDial + DIAL_STEP : lastDial - DIAL_STEP;
  return Math.min(DIAL_CEILING, Math.max(STARTING_DIAL_MIN, stepped));
}

/** Targets with ANY campaign (any status) opened within the cooldown window. */
async function cooldownBlockedTargets(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const result = await query<{ target_phone: string }>(
    // A campaign that never asked anybody must not burn the target's cooldown.
    // 46 of 93 campaigns closed as `closed_no_inviters` the second they
    // opened, and every one of those people was then locked out for the whole
    // cooldown without a single message having been sent.
    `SELECT DISTINCT c.target_phone FROM invite_campaigns c
     WHERE c.target_phone = ANY($1)
       AND c.opened_at > NOW() - make_interval(days => $2)
       AND EXISTS (SELECT 1 FROM invite_campaign_participants p WHERE p.campaign_id = c.id)`,
    [phones, COOLDOWN_DAYS],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.target_phone));
}

interface InviterCandidate {
  userId: number;
  strength: number | null;
}

/**
 * Registered members who have these targets saved (Netai or old-Ally), active
 * subscribers, not opted out of asks — keyed by target phone.
 *
 * Asked for the whole list at once. Per target it was one round trip of about
 * a second, which was invisible while it only ran for the few targets that got
 * as far as an INSERT, and became the tick's whole budget the moment
 * eligibility started being checked for every target before opening anything.
 */
async function inviterCandidatesForPhones(
  phones: readonly string[],
): Promise<Map<string, InviterCandidate[]>> {
  const out = new Map<string, InviterCandidate[]>();
  if (phones.length === 0) return out;
  const result = await query<{ phone: string; user_id: number; strength: number | null }>(
    `SELECT x.phone, x.uid AS user_id, crs.strength_score AS strength
     FROM (
       SELECT phone, "contactId" AS uid FROM "UserAlias" WHERE phone = ANY($1)
       UNION
       SELECT ucp.phone, uc."originUserId" AS uid
       FROM "UserConnectionPhone" ucp JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = ANY($1)
     ) x
     JOIN "User" u ON u.id = x.uid AND u.subscription_status = 'active'
     LEFT JOIN contact_relationship_scores crs
       ON crs.user_id = x.uid AND crs.contact_phone = x.phone
     WHERE NOT EXISTS (SELECT 1 FROM ask_optouts ao WHERE ao.user_id = x.uid)
     ORDER BY x.phone, crs.strength_score DESC NULLS LAST`,
    [phones],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  for (const row of result.rows) {
    const list = out.get(row.phone) ?? [];
    list.push({ userId: row.user_id, strength: row.strength });
    out.set(row.phone, list);
  }
  return out;
}

async function scheduleParticipants(
  campaignId: number,
  candidatesForTarget: readonly InviterCandidate[],
  dial: number,
): Promise<number> {
  const candidates = candidatesForTarget.slice(0, dial);
  let scheduled = 0;
  for (let i = 0; i < candidates.length; i++) {
    const offsetDays = scheduledOffsetDays(i);
    await query(
      `INSERT INTO invite_campaign_participants (campaign_id, inviter_user_id, state, scheduled_ask_at)
       VALUES ($1, $2, 'pending', NOW() + make_interval(days => $3))
       ON CONFLICT (campaign_id, inviter_user_id) DO NOTHING`,
      [campaignId, candidates[i].userId, offsetDays],
      CAMPAIGN_QUERY_TIMEOUT_MS,
    );
    scheduled++;
  }
  return scheduled;
}

/**
 * Opens a campaign for every target on T7's current list that isn't already
 * open or in cooldown, and schedules its inviters. Meant to run off a cron
 * tick — every step here is server-initiated, never a human action.
 */
export async function openDueCampaigns(
  sinceDays: number,
): Promise<{ opened: number; skipped_no_inviter: number }> {
  const targets: TargetScoreEntry[] = await buildTargetList(sinceDays);
  if (targets.length === 0) return { opened: 0, skipped_no_inviter: 0 };

  const blocked = await cooldownBlockedTargets(targets.map((t) => t.phone));
  const inviters = await inviterCandidatesForPhones(targets.map((t) => t.phone));
  const dial = await currentGlobalDial();
  let opened = 0;
  // Reported, not swallowed: "we listed 22 people and could ask nobody about
  // 14 of them" is the single most useful number this function produces.
  let skippedNoInviter = 0;

  for (const target of targets) {
    if (blocked.has(target.phone)) continue;
    // Ask BEFORE opening. Opening first and closing a second later produced 46
    // dead rows and read, to anyone looking at the table, like the engine
    // trying and failing rather than never having had anyone to ask.
    const candidates = inviters.get(target.phone) ?? [];
    if (candidates.length === 0) {
      skippedNoInviter++;
      continue;
    }
    const inserted = await query<{ id: number }>(
      `INSERT INTO invite_campaigns (target_phone, target_label, city, status, ask_count_dial)
       VALUES ($1, $2, $3, 'open', $4)
       ON CONFLICT (target_phone) WHERE status = 'open' DO NOTHING
       RETURNING id`,
      [target.phone, target.label, target.city, dial],
      CAMPAIGN_QUERY_TIMEOUT_MS,
    );
    const campaignId = inserted.rows[0]?.id;
    if (campaignId === undefined) continue;
    const scheduled = await scheduleParticipants(campaignId, candidates, dial);
    // Nobody eligible to ask = the campaign is over the moment it opens —
    // 44 of the 49 standing campaigns were exactly this, open forever with
    // zero participants (ticket 8 task 6).
    if (scheduled === 0) {
      await query(
        `UPDATE invite_campaigns SET status = 'closed_no_inviters', closed_at = NOW(),
           closed_reason = 'no eligible inviter (active subscriber holding this contact)'
         WHERE id = $1 AND status = 'open'`,
        [campaignId],
        CAMPAIGN_QUERY_TIMEOUT_MS,
      );
      continue;
    }
    opened++;
  }
  return { opened, skipped_no_inviter: skippedNoInviter };
}

// The founder's call (29 Aug, via Misho, closing D50's open half): the ask
// GIVES a reason — technique 9, "we grow together". The technique stamp must
// always match what the text actually does.
//
// Ticket 9 task 22 — why there are four of these now. All 27 asks ever sent
// carry when=0, how=5, reason=9 or 0. The columns are full; what is missing is
// VARIATION. A conversion table over a constant can never converge — it was
// measuring one phrasing against itself and calling the other two thirds
// empty.
//
// So HOW varies across its four values, each with the text that value NAMES,
// and the stamp follows the text by construction rather than by an env var
// somebody has to remember to change. WHEN stays 0 honestly: Chorus sends on a
// schedule, so there is no conversational moment to record, and inventing one
// would fabricate the very number the table exists to measure. REASON stays 9
// on all four — varying two dimensions at once over 27 rows would leave every
// cell too thin to read.
const CAMPAIGN_REPLY_PROTOCOL =
  'უპასუხე ამ თრედში: „კი" (თანახმა ვარ), „არა" (ამჯერად არა), ან, თუ უკვე ' +
  'შესთავაზე, „უთხარი" (უთხარი და ველოდები).';

/** technique_how → the message that phrasing actually is. */
const CAMPAIGN_ASK_VARIANTS: Readonly<Record<number, (label: string) => string>> = {
  // 5 — name the person.
  5: (label) =>
    `${label}-ს იცნობ და Netai-ზე ჯერ არ არის. რაც მეტი ახლობელი ადამიანია ქსელში, ` +
    `მით უკეთ მუშაობს ის ყველასთვის — ერთად ვიზრდებით. თუ გინდა, შეგიძლია მოიწვიო — ` +
    `უბრალოდ ${CAMPAIGN_REPLY_PROTOCOL}`,
  // 6 — the advice ask: their judgment first, the invitation second.
  6: (label) =>
    `შენი აზრი მაინტერესებს: ${label} Netai-სთვის გამოსადეგი ადამიანი იქნებოდა? ` +
    `რაც მეტი ახლობელი ადამიანია ქსელში, მით უკეთ მუშაობს ის ყველასთვის — ერთად ` +
    `ვიზრდებით. ${CAMPAIGN_REPLY_PROTOCOL}`,
  // 7 — make refusing free: say the "no" out loud, first.
  7: (label) =>
    `${label} Netai-ზე ჯერ არ არის. თუ არ გინდა ან დრო არ გაქვს, სრულიად ნორმალურია — ` +
    `„არა" საკმარისი პასუხია და აღარ გკითხავ. თუ გინდა კი — რაც მეტი ახლობელია ` +
    `ქსელში, მით უკეთ მუშაობს ყველასთვის, ერთად ვიზრდებით. ${CAMPAIGN_REPLY_PROTOCOL}`,
  // 8 — text them now: one message, this minute.
  8: (label) =>
    `${label}-ს ერთი შეტყობინება თუ მისწერე ახლა, ის Netai-ზე იქნება. რაც მეტი ` +
    `ახლობელი ადამიანია ქსელში, მით უკეთ მუშაობს ის ყველასთვის — ერთად ვიზრდებით. ` +
    CAMPAIGN_REPLY_PROTOCOL,
};

const CAMPAIGN_HOW_VALUES = [5, 6, 7, 8];

/**
 * Which phrasing this ask uses. Deterministic on the participant id rather
 * than random: the split stays even, the same row always reproduces the same
 * message, and a test never has to fight a coin toss.
 */
export function techniqueHowFor(participantId: number): number {
  return CAMPAIGN_HOW_VALUES[participantId % CAMPAIGN_HOW_VALUES.length] as number;
}

const CAMPAIGN_ASK_MESSAGE = (label: string, how: number): string =>
  (CAMPAIGN_ASK_VARIANTS[how] ?? CAMPAIGN_ASK_VARIANTS[5])?.(label) ?? '';

/** Sends every due (state='pending', scheduled_ask_at elapsed) campaign ask — a cron tick's own worklist. */
export async function sendDueCampaignAsks(limit: number): Promise<number> {
  const due = await query<{
    id: number;
    inviter_user_id: number;
    target_label: string | null;
    target_phone: string;
  }>(
    `SELECT p.id, p.inviter_user_id, c.target_label, c.target_phone
     FROM invite_campaign_participants p
     JOIN invite_campaigns c ON c.id = p.campaign_id
     WHERE p.state = 'pending' AND p.scheduled_ask_at <= NOW() AND c.status = 'open'
       AND NOT EXISTS (SELECT 1 FROM ask_optouts ao WHERE ao.user_id = p.inviter_user_id)
       -- At most one invite ask per person per week (ticket 9 task 13.2). On
       -- 1 September the founder got six pushes inside one minute: six
       -- campaigns, each scheduling him independently, none of them aware of
       -- the others. The dial spaces asks WITHIN a campaign; nothing spaced
       -- them ACROSS campaigns, and the person on the receiving end
       -- experiences the sum.
       AND NOT EXISTS (
         SELECT 1 FROM invite_campaign_participants recent
         WHERE recent.inviter_user_id = p.inviter_user_id
           AND recent.asked_at > NOW() - ($2 || ' days')::INTERVAL
       )
     ORDER BY p.scheduled_ask_at ASC
     LIMIT $1`,
    [limit, INVITE_ASK_COOLDOWN_DAYS],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );

  // The campaign stored a label when it opened; the ask goes out days later
  // and must say the name the network knows NOW (ticket 9 task 13.6). „Kato"
  // and „Maxin.ai Ceo" are the same two numbers the list already resolves to
  // „Ekaterine Bezhanishvili" and „Nika Kucia Finance".
  const freshLabels = await bestPersonLabels(due.rows.map((r) => r.target_phone)).catch(
    (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[chorus] label refresh failed, using stored labels:', (err as Error).message);
      return new Map<string, string>();
    },
  );

  // One tick can hold several rows for the same person — the SQL guard cannot
  // see rows it is about to write. The sweep keeps its own list.
  const askedThisTick = new Set<number>();
  let sent = 0;
  for (const row of due.rows) {
    if (askedThisTick.has(row.inviter_user_id)) continue;
    askedThisTick.add(row.inviter_user_id);
    const label = freshLabels.get(row.target_phone) ?? row.target_label?.trim() ?? 'ეს კონტაქტი';
    const thread = await createThread(
      String(row.inviter_user_id),
      'campaign_invite',
      `Netai-ზე მოწვევა: ${label}`,
      undefined,
      { isTask: true, status: 'needs_you', statusLine: 'პასუხს ელოდება' },
    );
    const how = techniqueHowFor(row.id);
    await saveThreadMessage(
      thread.id,
      row.inviter_user_id,
      'assistant',
      CAMPAIGN_ASK_MESSAGE(label, how),
    );
    await query(
      `UPDATE invite_campaign_participants
       SET state = 'asked', asked_at = NOW(), thread_id = $2, state_updated_at = NOW(),
           technique_when = $3, technique_how = $4, technique_reason = $5
       WHERE id = $1`,
      // `how` comes from the variant actually sent, never from the env — the
      // stamp cannot drift from the text if it is read off the same value.
      [row.id, thread.id, CHORUS_TECHNIQUE.when, how, CHORUS_TECHNIQUE.reason],
      CAMPAIGN_QUERY_TIMEOUT_MS,
    );
    // T9 (ticket 7 task 13): the ask also enters the ONE pending_updates list
    // (kind 'chorus_ask', released immediately), so any conversation the
    // inviter opens sees it — the dedicated thread alone is not the surface.
    // Best-effort: the ask itself already stands in its thread.
    await queueFollowUp(
      String(row.inviter_user_id),
      null,
      CHORUS_ASK_KIND,
      {
        who: label,
        why: 'an invite-campaign ask is waiting for their answer',
        thread_id: thread.id,
        technique_tag: { ...CHORUS_TECHNIQUE, how },
        instruction:
          `A Netai invite ask about ${label} is waiting in its own thread. If it fits the ` +
          'conversation, remind the user once, lightly, that it is there — their answer ' +
          '(„კი" / „არა" / „უთხარი") is recorded in that thread, never here.',
      },
      0,
    ).catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[chorus] pending-update queue failed:', (err as Error).message),
    );
    emitThreadCreated(String(row.inviter_user_id), {
      id: thread.id,
      type: thread.type,
      title: thread.title,
      is_task: thread.is_task,
      status: thread.status,
      status_line: thread.status_line,
    });
    void sendPushNotification(String(row.inviter_user_id), {
      title: 'Netai',
      body: `${label}-ს იცნობ? მოიწვიე Netai-ზე.`,
      url: `/chat/${thread.id}`,
    }).catch(() => undefined);
    sent++;
  }
  return sent;
}

const NEXT_STATE: Record<string, Record<string, string>> = {
  asked: { agreed: 'agreed', declined: 'declined' },
  agreed: { told: 'told' },
};

export interface CampaignResponseOutcome {
  recorded: boolean;
  error?: string;
}

/**
 * The inviter's own free-text reply, classified by the model reading its own
 * conversation (same philosophy as record_search_outcome) — the server only
 * enforces that the transition is a legal one for the participant's CURRENT
 * state, keyed off the ambient thread (a campaign_invite thread belongs to
 * exactly one participant).
 *
 * D50: the assistant reports the three technique values here — it read the
 * conversation the ask actually happened in, so a value it reports overrides
 * Chorus's stamped default; a group it leaves out keeps the stamp.
 */
export async function recordCampaignResponse(
  threadId: number,
  userId: string,
  response: 'agreed' | 'declined' | 'told',
  technique?: Partial<TechniqueTag>,
): Promise<CampaignResponseOutcome> {
  const participant = await query<{ id: number; state: string; campaign_id: number }>(
    `SELECT id, state, campaign_id FROM invite_campaign_participants
     WHERE thread_id = $1 AND inviter_user_id = $2::int LIMIT 1`,
    [threadId, userId],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const row = participant.rows[0];
  if (!row) return { recorded: false, error: 'This thread has no live campaign ask.' };
  const nextState = NEXT_STATE[row.state]?.[response];
  if (!nextState) {
    return { recorded: false, error: `Cannot record "${response}" from state "${row.state}".` };
  }
  await query(
    `UPDATE invite_campaign_participants
     SET state = $2, state_updated_at = NOW(),
         technique_when = COALESCE($3, technique_when),
         technique_how = COALESCE($4, technique_how),
         technique_reason = COALESCE($5, technique_reason)
     WHERE id = $1`,
    [
      row.id,
      nextState,
      parseTechniqueValue('when', technique?.when),
      parseTechniqueValue('how', technique?.how),
      parseTechniqueValue('reason', technique?.reason),
    ],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  if (nextState === 'declined') await closeCampaignIfExhausted(row.campaign_id);
  return { recorded: true };
}

/** Closes a campaign once every participant has reached a terminal non-join state. */
async function closeCampaignIfExhausted(campaignId: number): Promise<void> {
  const remaining = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM invite_campaign_participants
     WHERE campaign_id = $1 AND state IN ('pending', 'asked', 'agreed', 'told')`,
    [campaignId],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  if (Number(remaining.rows[0]?.count ?? 0) > 0) return;
  await query(
    `UPDATE invite_campaigns SET status = 'closed_declined_all', closed_at = NOW(),
       closed_reason = 'every participant declined or timed out'
     WHERE id = $1 AND status = 'open'`,
    [campaignId],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
}

// A reply this old without resolving is treated as a silent decline — a
// campaign whose every participant went quiet must still close, not stay
// open indefinitely waiting on a reply that will never come.
const NO_REPLY_TIMEOUT_DAYS = Number(process.env.CHORUS_NO_REPLY_TIMEOUT_DAYS ?? 21);

// Nothing bounded a campaign's lifetime (ticket 8 task 6: 49 open, 0 ever
// closed). Past this age it closes as expired whatever state its asks are in.
const CAMPAIGN_MAX_AGE_DAYS = Number(process.env.CHORUS_CAMPAIGN_MAX_AGE_DAYS ?? 45);

/** Times out asked-but-silent participants, then closes any campaign that leaves fully exhausted. */
export async function sweepStaleParticipants(): Promise<{ timedOut: number; closed: number }> {
  const stale = await query<{ campaign_id: number }>(
    `UPDATE invite_campaign_participants
     SET state = 'declined', state_updated_at = NOW()
     WHERE state = 'asked' AND asked_at < NOW() - make_interval(days => $1)
     RETURNING campaign_id`,
    [NO_REPLY_TIMEOUT_DAYS],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const uniqueCampaigns = new Set(stale.rows.map((r) => r.campaign_id));
  for (const campaignId of uniqueCampaigns) await closeCampaignIfExhausted(campaignId);

  // Terminal-state guarantees: an empty campaign (no eligible inviter) and an
  // over-age campaign both close here, daily — a campaign can always END.
  const closedEmpty = await query(
    `UPDATE invite_campaigns c
     SET status = 'closed_no_inviters', closed_at = NOW(),
         closed_reason = 'no eligible inviter (active subscriber holding this contact)'
     WHERE c.status = 'open'
       AND NOT EXISTS (SELECT 1 FROM invite_campaign_participants p WHERE p.campaign_id = c.id)`,
    [],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const closedExpired = await query(
    `UPDATE invite_campaigns
     SET status = 'closed_expired', closed_at = NOW(),
         closed_reason = 'open past ' || $1 || ' days'
     WHERE status = 'open' AND opened_at < NOW() - make_interval(days => $1)`,
    [CAMPAIGN_MAX_AGE_DAYS],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  return {
    timedOut: stale.rows.length,
    closed: (closedEmpty.rowCount ?? 0) + (closedExpired.rowCount ?? 0),
  };
}

/**
 * Open ONE campaign by hand, for verification only (ticket 9 task 13.7).
 *
 * The invite thread's new behaviour cannot be proved from the outside without
 * a live invite thread, and waiting for Chorus to choose a pair means waiting
 * for a real person to be asked about a real person. This opens the pair
 * itself — and refuses unless BOTH sides are our own test accounts (the
 * REVIEW_PHONE list auth already owns), so the lever can never put a real
 * person's name in front of a real user.
 */
export async function seedTestCampaign(
  targetPhone: string,
  inviterUserId: number,
  label: string,
): Promise<{ opened: boolean; campaign_id?: number; error?: string }> {
  const ours = ownPeopleDigits();
  if (!ours.has(phoneDigits(targetPhone))) {
    return { opened: false, error: 'The target must be one of our own test numbers.' };
  }
  const inviterPhone = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1::int LIMIT 1`,
    [inviterUserId],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const digits = phoneDigits(inviterPhone.rows[0]?.phone ?? '');
  if (!digits || !ours.has(digits)) {
    return { opened: false, error: 'The inviter must be one of our own test accounts.' };
  }
  const campaign = await query<{ id: number }>(
    `INSERT INTO invite_campaigns (target_phone, target_label, city, status, ask_count_dial)
     VALUES ($1, $2, NULL, 'open', 1)
     ON CONFLICT (target_phone) WHERE status = 'open' DO NOTHING
     RETURNING id`,
    [targetPhone, label],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const campaignId = campaign.rows[0]?.id;
  if (campaignId === undefined) {
    return { opened: false, error: 'A campaign for this target is already open.' };
  }
  await query(
    `INSERT INTO invite_campaign_participants (campaign_id, inviter_user_id, state, scheduled_ask_at)
     VALUES ($1, $2, 'pending', NOW())`,
    [campaignId, inviterUserId],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  return { opened: true, campaign_id: campaignId };
}

export interface StaleCampaignRow {
  readonly id: number;
  readonly target_label: string | null;
  readonly asked: number;
}

export interface CloseStaleOutcome {
  readonly dry_run: boolean;
  readonly open_before: number;
  readonly still_chosen: number;
  readonly closed: StaleCampaignRow[];
}

/**
 * Close every open campaign whose target TODAY'S list no longer chooses
 * (ticket 9 task 13.6, the founder's go-ahead of 4 September).
 *
 * The gates run on every open — the list is rebuilt from scratch each pass —
 * but they cannot reach backwards, and a campaign opened before them keeps
 * asking the next inviter on day 4, 7 and 10. So the rule here is exactly the
 * live rule, applied to what is already standing: if buildTargetList would not
 * pick this phone now, the campaign should not be running now.
 *
 * The campaign's own badge follows: a `campaign_invite` thread whose campaign
 * has stopped asking must stop saying it waits for the user (the same rule as
 * ticket 9 task 20 b). Nothing is deleted — the rows, the participants and the
 * threads stay readable, and if the target ever returns to the list a fresh
 * campaign opens for it.
 */
export async function closeStaleCampaigns(
  sinceDays: number,
  dryRun: boolean,
): Promise<CloseStaleOutcome> {
  const chosen = new Set((await buildTargetList(sinceDays)).map((t) => t.phone));
  const open = await query<{
    id: number;
    target_phone: string;
    target_label: string | null;
    asked: string;
  }>(
    `SELECT c.id, c.target_phone, c.target_label,
            COUNT(p.id) FILTER (WHERE p.state = 'asked') AS asked
     FROM invite_campaigns c
     LEFT JOIN invite_campaign_participants p ON p.campaign_id = c.id
     WHERE c.status = 'open'
     GROUP BY c.id
     ORDER BY c.id`,
    [],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const stale = open.rows.filter((c) => !chosen.has(c.target_phone));
  const closed: StaleCampaignRow[] = stale.map((c) => ({
    id: c.id,
    target_label: c.target_label,
    asked: Number(c.asked),
  }));
  if (dryRun || stale.length === 0) {
    return {
      dry_run: dryRun,
      open_before: open.rows.length,
      still_chosen: open.rows.length - stale.length,
      closed,
    };
  }

  const ids = stale.map((c) => c.id);
  await query(
    `UPDATE invite_campaigns
     SET status = 'closed_stale_target', closed_at = NOW(),
         closed_reason = 'the target list no longer chooses this target'
     WHERE id = ANY($1::int[]) AND status = 'open'`,
    [ids],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  // Their asks stop waiting for an answer. Read the threads first so each
  // owner is told on their own devices, rather than finding out silently.
  const threads = await query<{ thread_id: number; inviter_user_id: number }>(
    `SELECT thread_id, inviter_user_id FROM invite_campaign_participants
     WHERE campaign_id = ANY($1::int[]) AND thread_id IS NOT NULL AND state = 'asked'`,
    [ids],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  for (const row of threads.rows) {
    await setThreadStatus(String(row.inviter_user_id), row.thread_id, 'done', {
      statusLine: null,
      isTask: true,
    });
  }
  return {
    dry_run: false,
    open_before: open.rows.length,
    still_chosen: open.rows.length - stale.length,
    closed,
  };
}

/**
 * Attribution via T3: called right after registration. If the new account's
 * inviter matches an open campaign's participant for a target whose phone
 * matches the new account's own phone, that IS the campaign converting.
 */
export async function attributeCampaignJoin(
  newUserPhone: string,
  inviterUserId: number | null,
): Promise<void> {
  if (inviterUserId === null) return;
  const digits = phoneDigits(newUserPhone);
  if (!digits) return;
  const match = await query<{ participant_id: number; campaign_id: number }>(
    `SELECT p.id AS participant_id, p.campaign_id
     FROM invite_campaign_participants p
     JOIN invite_campaigns c ON c.id = p.campaign_id
     WHERE c.status = 'open' AND p.inviter_user_id = $1
       AND regexp_replace(c.target_phone, '\\D', '', 'g') = $2
       AND p.state IN ('asked', 'agreed', 'told')
     LIMIT 1`,
    [inviterUserId, digits],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  const row = match.rows[0];
  if (!row) return;
  await query(
    `UPDATE invite_campaign_participants SET state = 'joined', state_updated_at = NOW() WHERE id = $1`,
    [row.participant_id],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  await query(
    `UPDATE invite_campaigns SET status = 'closed_joined', closed_at = NOW(),
       closed_reason = 'target registered via this inviter''s referral link'
     WHERE id = $1`,
    [row.campaign_id],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
}
