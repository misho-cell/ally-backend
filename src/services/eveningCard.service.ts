import { query } from '../db/postgres/client';
import { askChoices } from './askOpening';
import { EVENING_CARD_SNOOZE_MS, eveningCardPush, nextEveningCard } from './eveningCard';
import { sendPushNotification } from './notification.service';
import { pushTimeZone } from './pushQuietHours';
import { ASKER_AS_THE_READER_SAVED_THEM } from './savedNameSql';
import { userLanguage } from './threads.service';

/**
 * #1850: the evening card's reads and writes. See eveningCard.ts for the rule.
 *
 * A question over the person's two-a-day is held on their next card
 * (held_asks.evening_card_id). At 19:00 their time one sweep claims the card,
 * sends every held question through createAsk — the same walls as any send,
 * minus the daily cap and the per-question push — and rings the person ONCE.
 * Each item is then an ordinary ask with its own thread and its own
 * yes / no / later; the card lists them. The snooze moves the whole card two
 * hours on, and the sweep rings again then.
 */
const QUERY_TIMEOUT_MS = 8_000;
const CARDS_PER_SWEEP = 20;
const ITEMS_PER_CARD = 50;
export const EVENING_CARD_URL = '/evening-card';

export interface EveningCardSlot {
  readonly id: number;
  readonly dueAt: Date;
}

/** The person's zone: the device they used last that said one; Tbilisi otherwise. */
async function personZone(userId: number): Promise<string> {
  const result = await query<{ time_zone: string | null }>(
    `SELECT time_zone FROM push_subscriptions
      WHERE user_id = $1 AND time_zone IS NOT NULL
      ORDER BY last_seen_at DESC NULLS LAST, id DESC
      LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return pushTimeZone(result.rows[0]?.time_zone);
}

/** The card a question over the cap goes on: the person's next 19:00. */
export async function eveningCardFor(
  userId: number,
  now: Date = new Date(),
): Promise<EveningCardSlot> {
  const { dueAt, cardDate } = nextEveningCard(now, await personZone(userId));
  const result = await query<{ id: number; due_at: Date }>(
    `INSERT INTO evening_cards (user_id, card_date, due_at)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (user_id, card_date) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, due_at`,
    [userId, cardDate, dueAt],
    QUERY_TIMEOUT_MS,
  );
  return { id: Number(result.rows[0].id), dueAt: new Date(result.rows[0].due_at) };
}

export interface DueCard {
  readonly id: number;
  readonly user_id: number;
}

/** Claims the cards whose time has come; each is claimed by one sweep only. */
export async function claimDueEveningCards(): Promise<DueCard[]> {
  const result = await query<{ id: string | number; user_id: number }>(
    `UPDATE evening_cards SET sent_at = NOW()
      WHERE id IN (SELECT id FROM evening_cards
                    WHERE sent_at IS NULL AND due_at <= NOW()
                    ORDER BY due_at
                    LIMIT ${CARDS_PER_SWEEP}
                    FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id`,
    [],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({ id: Number(r.id), user_id: r.user_id }));
}

export interface CardHeldAsk {
  readonly id: number;
  readonly task_id: number;
  readonly to_user_id: number;
  readonly contact_phone: string | null;
  readonly question: string;
  readonly owner_id: string;
  readonly thread_id: number | null;
}

/** The questions held on this card, released so each goes once. */
export async function releaseCardHeldAsks(cardId: number): Promise<CardHeldAsk[]> {
  const result = await query<CardHeldAsk>(
    `UPDATE held_asks h SET released_at = NOW()
       FROM tasks t
      WHERE h.evening_card_id = $1 AND h.released_at IS NULL AND t.id = h.task_id
      RETURNING h.id, h.task_id, h.to_user_id, h.contact_phone, h.question,
                t.user_id::text AS owner_id, t.thread_id`,
    [cardId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** How many of the card's questions still wait for a tap. */
async function openItemCount(cardId: number): Promise<number> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM task_asks
      WHERE evening_card_id = $1 AND status = 'sent'
        AND offered_help_at IS NULL AND later_at IS NULL AND declined_at IS NULL`,
    [cardId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.n ?? 0;
}

/** The one push for the card; nothing when every item is already answered. */
export async function ringForCard(card: DueCard): Promise<number> {
  const open = await openItemCount(card.id);
  if (open === 0) return 0;
  const language = await userLanguage(String(card.user_id));
  await sendPushNotification(String(card.user_id), {
    ...eveningCardPush(language, open),
    url: EVENING_CARD_URL,
  });
  return open;
}

export interface EveningCardItem {
  readonly ask_id: number;
  readonly ask_thread_id: number | null;
  readonly from_name: string | null;
  readonly question: string;
  readonly answered: boolean;
}

export interface EveningCardView {
  readonly id: number;
  readonly due_at: string;
  readonly snoozes: number;
  /** The three taps, in the person's language: yes, no, later. Sent as a message to the item's thread. */
  readonly choices: readonly string[];
  readonly items: readonly EveningCardItem[];
}

/** The person's latest card that has been sent and still has a question waiting. */
export async function currentEveningCard(userId: number): Promise<EveningCardView | null> {
  const card = await query<{ id: string | number; due_at: Date; snoozes: number }>(
    `SELECT c.id, c.due_at, c.snoozes FROM evening_cards c
      WHERE c.user_id = $1 AND c.sent_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM task_asks ta
                     WHERE ta.evening_card_id = c.id AND ta.status = 'sent'
                       AND ta.offered_help_at IS NULL AND ta.later_at IS NULL
                       AND ta.declined_at IS NULL)
      ORDER BY c.due_at DESC
      LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const row = card.rows[0];
  if (!row) return null;
  const items = await query<EveningCardItem>(
    `SELECT ta.id AS ask_id, ta.ask_thread_id, ${ASKER_AS_THE_READER_SAVED_THEM} AS from_name,
            ta.question,
            (ta.status <> 'sent' OR ta.offered_help_at IS NOT NULL OR ta.later_at IS NOT NULL
              OR ta.declined_at IS NOT NULL) AS answered
       FROM task_asks ta
      WHERE ta.evening_card_id = $1
      ORDER BY ta.id
      LIMIT ${ITEMS_PER_CARD}`,
    [row.id],
    QUERY_TIMEOUT_MS,
  );
  return {
    id: Number(row.id),
    due_at: new Date(row.due_at).toISOString(),
    snoozes: row.snoozes,
    choices: askChoices(await userLanguage(String(userId))),
    items: items.rows,
  };
}

/** The card's one snooze: the whole card comes back two hours from now. Null when not theirs or not shown. */
export async function snoozeEveningCard(userId: number, cardId: number): Promise<Date | null> {
  const result = await query<{ due_at: Date }>(
    `UPDATE evening_cards
        SET due_at = NOW() + make_interval(secs => $3), sent_at = NULL, snoozes = snoozes + 1
      WHERE id = $1 AND user_id = $2 AND sent_at IS NOT NULL
      RETURNING due_at`,
    [cardId, userId, EVENING_CARD_SNOOZE_MS / 1000],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ? new Date(result.rows[0].due_at) : null;
}
