import { query } from '../db/postgres/client';
import { buildTargetList, TargetScoreEntry } from './targetScoring.service';
import { queueFollowUp } from './pendingUpdates.service';
import { createThread, saveThreadMessage } from './threads.service';
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

/** One group's value: an integer inside its range, or null for unknown. */
export function parseTechniqueValue(group: keyof TechniqueTag, value: unknown): number | null {
  const n = Number(value);
  const [min, max] = TECHNIQUE_RANGES[group];
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Chorus stamps its OWN three values on every ask it sends (D50) — config,
// not deploy, so the founder flips them when the fixed message changes. The
// defaults are what the current message truthfully does: it names the person
// (technique 5); it is sent on a schedule tied to no conversational moment
// (when = unknown) and gives no reason (reason = unknown).
const CHORUS_TECHNIQUE: TechniqueTag = {
  when: parseTechniqueValue('when', process.env.CHORUS_TECHNIQUE_WHEN),
  how: parseTechniqueValue('how', process.env.CHORUS_TECHNIQUE_HOW ?? 5),
  reason: parseTechniqueValue('reason', process.env.CHORUS_TECHNIQUE_REASON),
};

// Ticket 6, engine T8 ("Chorus"): fully automatic invite campaigns targeting
// T7's weekly non-user list. Per target: chosen inviter-users, each walking
// pending -> asked -> agreed/declined -> told -> joined. No manual mode —
// every step here is meant to run off a cron tick (chorusCampaign.cron.ts),
// never a human clicking a button.

// One campaign per target within this window (spec: "90-day cooldown").
const COOLDOWN_DAYS = 90;
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
    `SELECT DISTINCT target_phone FROM invite_campaigns
     WHERE target_phone = ANY($1) AND opened_at > NOW() - make_interval(days => $2)`,
    [phones, COOLDOWN_DAYS],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.target_phone));
}

interface InviterCandidate {
  userId: number;
  strength: number | null;
}

/** Registered members who have this target saved (Netai or old-Ally), active subscribers, not opted out of asks. */
async function inviterCandidates(targetPhone: string): Promise<InviterCandidate[]> {
  const result = await query<{ user_id: number; strength: number | null }>(
    `SELECT x.uid AS user_id, crs.strength_score AS strength
     FROM (
       SELECT "contactId" AS uid FROM "UserAlias" WHERE phone = $1
       UNION
       SELECT uc."originUserId" AS uid
       FROM "UserConnectionPhone" ucp JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = $1
     ) x
     JOIN "User" u ON u.id = x.uid AND u.subscription_status = 'active'
     LEFT JOIN contact_relationship_scores crs ON crs.user_id = x.uid AND crs.contact_phone = $1
     WHERE NOT EXISTS (SELECT 1 FROM ask_optouts ao WHERE ao.user_id = x.uid)
     ORDER BY crs.strength_score DESC NULLS LAST`,
    [targetPhone],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({ userId: r.user_id, strength: r.strength }));
}

async function scheduleParticipants(
  campaignId: number,
  targetPhone: string,
  dial: number,
): Promise<number> {
  const candidates = (await inviterCandidates(targetPhone)).slice(0, dial);
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
export async function openDueCampaigns(sinceDays: number): Promise<{ opened: number }> {
  const targets: TargetScoreEntry[] = await buildTargetList(sinceDays);
  if (targets.length === 0) return { opened: 0 };

  const blocked = await cooldownBlockedTargets(targets.map((t) => t.phone));
  const dial = await currentGlobalDial();
  let opened = 0;

  for (const target of targets) {
    if (blocked.has(target.phone)) continue;
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
    await scheduleParticipants(campaignId, target.phone, dial);
    opened++;
  }
  return { opened };
}

const CAMPAIGN_ASK_MESSAGE = (label: string): string =>
  `${label}-ს იცნობ და Netai-ზე ჯერ არ არის. თუ გინდა, შეგიძლია მოიწვიო — ` +
  'უბრალოდ უპასუხე ამ თრედში: „კი" (თანახმა ვარ), „არა" (ამჯერად არა), ან, თუ უკვე ' +
  'შესთავაზე, „უთხარი" (უთხარი და ველოდები).';

/** Sends every due (state='pending', scheduled_ask_at elapsed) campaign ask — a cron tick's own worklist. */
export async function sendDueCampaignAsks(limit: number): Promise<number> {
  const due = await query<{
    id: number;
    inviter_user_id: number;
    target_label: string | null;
  }>(
    `SELECT p.id, p.inviter_user_id, c.target_label
     FROM invite_campaign_participants p
     JOIN invite_campaigns c ON c.id = p.campaign_id
     WHERE p.state = 'pending' AND p.scheduled_ask_at <= NOW() AND c.status = 'open'
       AND NOT EXISTS (SELECT 1 FROM ask_optouts ao WHERE ao.user_id = p.inviter_user_id)
     ORDER BY p.scheduled_ask_at ASC
     LIMIT $1`,
    [limit],
    CAMPAIGN_QUERY_TIMEOUT_MS,
  );

  let sent = 0;
  for (const row of due.rows) {
    const label = row.target_label?.trim() || 'ეს კონტაქტი';
    const thread = await createThread(
      String(row.inviter_user_id),
      'campaign_invite',
      `Netai-ზე მოწვევა: ${label}`,
      undefined,
      { isTask: true, status: 'needs_you', statusLine: 'პასუხს ელოდება' },
    );
    await saveThreadMessage(
      thread.id,
      row.inviter_user_id,
      'assistant',
      CAMPAIGN_ASK_MESSAGE(label),
    );
    await query(
      `UPDATE invite_campaign_participants
       SET state = 'asked', asked_at = NOW(), thread_id = $2, state_updated_at = NOW(),
           technique_when = $3, technique_how = $4, technique_reason = $5
       WHERE id = $1`,
      [row.id, thread.id, CHORUS_TECHNIQUE.when, CHORUS_TECHNIQUE.how, CHORUS_TECHNIQUE.reason],
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
        technique_tag: CHORUS_TECHNIQUE,
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

/** Times out asked-but-silent participants, then closes any campaign that leaves fully exhausted. */
export async function sweepStaleParticipants(): Promise<{ timedOut: number }> {
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
  return { timedOut: stale.rows.length };
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
