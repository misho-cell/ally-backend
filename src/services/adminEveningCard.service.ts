import { query } from '../db/postgres/client';
import { currentEveningCard, EveningCardView, snoozeEveningCard } from './eveningCard.service';

/**
 * #1850 (box 48942): the evening card lives only on the seat's own
 * /evening-card screen, and the tester never calls a seat's GETs — so the card
 * and its one snooze could not be checked. An admin reads what the screen
 * shows, plus the latest card's own row (sent or not, snoozed how often), and
 * may snooze a card on a fictional test seat only; a real person's card is
 * theirs to snooze.
 */
const QUERY_TIMEOUT_MS = 4_000;

export interface EveningCardRow {
  readonly id: number;
  readonly due_at: string;
  readonly sent_at: string | null;
  readonly snoozes: number;
  readonly asks: number;
}

export interface AdminEveningCard {
  /** Exactly what GET /evening-card returns to the person, or null. */
  readonly screen: EveningCardView | null;
  /** The newest card row, whether or not it has been shown yet. */
  readonly latest: EveningCardRow | null;
}

export enum AdminSnoozeOutcome {
  Snoozed = 'snoozed',
  NotATestSeat = 'not_a_test_seat',
  NotFound = 'not_found',
}

async function latestCardRow(userId: number): Promise<EveningCardRow | null> {
  const result = await query<{
    id: string | number;
    due_at: Date;
    sent_at: Date | null;
    snoozes: number;
    asks: string | number;
  }>(
    `SELECT c.id, c.due_at, c.sent_at, c.snoozes,
            (SELECT count(*) FROM task_asks ta WHERE ta.evening_card_id = c.id) AS asks
       FROM evening_cards c
      WHERE c.user_id = $1
      ORDER BY c.id DESC
      LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    due_at: new Date(row.due_at).toISOString(),
    sent_at: row.sent_at === null ? null : new Date(row.sent_at).toISOString(),
    snoozes: row.snoozes,
    asks: Number(row.asks),
  };
}

export async function eveningCardForAdmin(userId: number): Promise<AdminEveningCard> {
  const [screen, latest] = await Promise.all([currentEveningCard(userId), latestCardRow(userId)]);
  return { screen, latest };
}

async function isTestSeat(userId: number): Promise<boolean> {
  const result = await query<{ user_id: number }>(
    `SELECT user_id FROM test_seats WHERE user_id = $1 LIMIT 1`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.length > 0;
}

/** The card's one snooze, pressed for a fictional seat; refused for anyone else. */
export async function snoozeSeatEveningCard(
  userId: number,
  cardId: number,
): Promise<{ readonly outcome: AdminSnoozeOutcome; readonly due_at?: string }> {
  if (!(await isTestSeat(userId))) return { outcome: AdminSnoozeOutcome.NotATestSeat };
  const dueAt = await snoozeEveningCard(userId, cardId);
  if (dueAt === null) return { outcome: AdminSnoozeOutcome.NotFound };
  return { outcome: AdminSnoozeOutcome.Snoozed, due_at: dueAt.toISOString() };
}
