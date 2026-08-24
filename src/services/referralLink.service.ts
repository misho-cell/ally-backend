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
 * anyone has registered. A code that doesn't resolve is silently ignored
 * (an expired link or a typo must not be a 500 on someone's phone).
 */
export async function recordLinkOpened(code: string): Promise<void> {
  const owner = await findUserByReferralCode(code);
  if (!owner) return;
  await query(
    `INSERT INTO referral_link_events (user_id, event) VALUES ($1, 'opened')`,
    [owner.userId],
    LINK_TIMEOUT_MS,
  );
}

export interface ReferralFunnel {
  sent: number;
  opened: number;
  registered: number;
}

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
  };
}
