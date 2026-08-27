import { query } from '../db/postgres/client';
import { getOrCreateReferralCode, findUserByReferralCode } from './referralCode.service';

// Engine T3 (ticket 6, 20 Aug spec): a personal invite LINK, unlimited, no
// caps — distinct from engine T11's invite_contact, which is a pre-filled
// message for ONE named contact. This is a bare link the assistant can
// attach to any message; the user picks who to send it to via their own
// phone's native share sheet, no pre-filled text.
const LINK_TIMEOUT_MS = 8_000;
const APP_URL = 'https://www.netai.guru';

export interface InviteLink {
  link?: string;
  code?: string;
  error?: string;
}

const INVITE_LINK_READY_FLAG = 'invite_link_ready';

/**
 * The user's own shareable link. Reuses the same code invite_contact mints.
 * Gated on app_flags.invite_link_ready — checked HERE rather than at either
 * tool registration, because chat.service.ts's case and the MCP handler
 * both call this same function, so one check covers both surfaces. Needed
 * live-caught (24 Aug): this tool shipped enabled before /join existed, and
 * an attempt to disable it via enabled_tools turned out to be a no-op — that
 * table isn't consulted by the always-on tool list this was registered in,
 * or by the MCP connector at all (every registerTool call there is
 * unconditional, regardless of enabled_tools).
 */
export async function getInviteLink(userId: string): Promise<InviteLink> {
  const flag = await query<{ enabled: boolean }>(
    `SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1`,
    [INVITE_LINK_READY_FLAG],
    LINK_TIMEOUT_MS,
  );
  if (flag.rows[0]?.enabled !== true) {
    return {
      error:
        'The invite link is not ready to share yet — tell the user this feature is coming ' +
        'soon rather than presenting a link.',
    };
  }
  const code = await getOrCreateReferralCode(userId);
  // Ticket 7 task 6 item 3: handing the user their link is 'issued', not
  // 'sent' — one tool call used to move the funnel with nothing shared.
  // 'sent' is written only by recordLinkShared, off the real share action.
  await query(
    `INSERT INTO referral_link_events (user_id, event) VALUES ($1, 'issued')`,
    [userId],
    LINK_TIMEOUT_MS,
  );
  return { link: `${APP_URL}/join?ref=${code}`, code };
}

/**
 * The REAL 'sent': the app calls this when the user actually takes the share
 * action (the share-sheet opens / the copy button on the share box) — the
 * closest observable event to "attached to a message" a backend can have.
 */
export async function recordLinkShared(userId: string): Promise<void> {
  await query(
    `INSERT INTO referral_link_events (user_id, event) VALUES ($1, 'sent')`,
    [userId],
    LINK_TIMEOUT_MS,
  );
}

/**
 * The landing page calls this the moment it renders with ?ref=CODE — before
 * anyone has registered. A code that doesn't resolve NEVER writes a row —
 * an expired link or a typo must not be a 500 on someone's phone, but it
 * must not count as a real open either. Live-caught: an invented code
 * ("ZZZZFAKE9") got {"recorded":true} back, which is a lie even though the
 * database itself was already correct (no row was ever written for it) —
 * the response just never reflected that. Returns whether it actually
 * recorded, so the route can stop saying "true" regardless.
 */
export async function recordLinkOpened(code: string): Promise<boolean> {
  const owner = await findUserByReferralCode(code);
  if (!owner) return false;
  await query(
    `INSERT INTO referral_link_events (user_id, event) VALUES ($1, 'opened')`,
    [owner.userId],
    LINK_TIMEOUT_MS,
  );
  return true;
}

export interface ReferralFunnel {
  // The assistant handed the user their link (the get_invite_link call).
  issued: number;
  // The user actually took the share action (share sheet / copy) — task 6
  // item 3's real 'sent'.
  sent: number;
  opened: number;
  registered: number;
  note: string;
}

// Live-caught: {"sent":2,"opened":2,"registered":797} read as one funnel,
// but "registered" and "sent"/"opened" count two different populations.
// referral_link_events only exists since T3 shipped tonight; a code
// resolving at registration (User.inviterReferralUserId) has worked since
// before T3 existed, via the older phone-based attribution path
// (inviteGate.service.ts) — so "registered" is every account ever
// attributed to this user, all-time, while "sent"/"opened" only started
// counting tonight. There is no stored link between a specific sent/opened
// pair and which registration it led to, so the three numbers can't be
// reconciled into a real conversion rate yet — the note says so rather
// than implying one.
const FUNNEL_NOTE =
  "'registered' counts every account ever attributed to this user (all-time, any attribution " +
  "path — the phone-based one predates this table); 'issued'/'sent'/'opened' only exist since " +
  "this feature shipped, and rows written before 27 Aug were re-labelled 'issued' (they were " +
  'tool calls, not shares). Not yet a directly comparable conversion funnel.';

/** The three-step funnel for one user, or the whole product when omitted. */
export async function getReferralFunnel(userId?: string): Promise<ReferralFunnel> {
  const eventCounts = await query<{ event: string; count: string }>(
    userId
      ? `SELECT event, COUNT(*) AS count FROM referral_link_events WHERE user_id = $1 GROUP BY event`
      : `SELECT event, COUNT(*) AS count FROM referral_link_events GROUP BY event`,
    userId ? [userId] : [],
    LINK_TIMEOUT_MS,
  );
  const registered = await query<{ count: string }>(
    userId
      ? `SELECT COUNT(*) AS count FROM "User" WHERE "inviterReferralUserId" = $1::int`
      : `SELECT COUNT(*) AS count FROM "User" WHERE "inviterReferralUserId" IS NOT NULL`,
    userId ? [userId] : [],
    LINK_TIMEOUT_MS,
  );
  const byEvent = new Map(eventCounts.rows.map((r) => [r.event, Number(r.count)]));
  return {
    issued: byEvent.get('issued') ?? 0,
    sent: byEvent.get('sent') ?? 0,
    opened: byEvent.get('opened') ?? 0,
    registered: Number(registered.rows[0]?.count ?? 0),
    note: FUNNEL_NOTE,
  };
}
