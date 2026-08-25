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
  link: string;
  code: string;
}

/** The user's own shareable link. Reuses the same code invite_contact mints. */
export async function getInviteLink(userId: string): Promise<InviteLink> {
  const code = await getOrCreateReferralCode(userId);
  await query(
    `INSERT INTO referral_link_events (user_id, event) VALUES ($1, 'sent')`,
    [userId],
    LINK_TIMEOUT_MS,
  );
  return { link: `${APP_URL}/join?ref=${code}`, code };
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
  "path — the phone-based one predates this table); 'sent'/'opened' only exist since this " +
  'feature shipped. Not yet a directly comparable conversion funnel.';

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
    sent: byEvent.get('sent') ?? 0,
    opened: byEvent.get('opened') ?? 0,
    registered: Number(registered.rows[0]?.count ?? 0),
    note: FUNNEL_NOTE,
  };
}
