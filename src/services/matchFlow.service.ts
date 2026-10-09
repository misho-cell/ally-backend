import { query } from '../db/postgres/client';
import {
  askedLine,
  card1Choices,
  card1Text,
  card2Choices,
  card2Text,
  MatchTap,
  notedLine,
  nothingCameLine,
  toTheNeedLine,
  toTheOfferLine,
} from './matchCards';
import { sendPushNotification } from './notification.service';
import { RunLanguage } from './runLanguage';
import { getOrCreateDefaultThread, saveThreadMessage, userLanguage } from './threads.service';

/**
 * 1699 part 2 (A16): the two no-name cards. Card 1 goes to the need's owner,
 * in his goal's conversation, naming only the field. On his yes, card 2 goes
 * to the offer's owner, naming only the field — never the goal's words. On her
 * yes both are named to each other and the assistants carry it (D438). A no
 * on either side closes it; the other side hears „nothing came of it" only if
 * he had already said yes. At most one card per person per day.
 */
const QUERY_TIMEOUT_MS = 5_000;
const CARDS_PER_RUN = 100;
const PUSH_BODY_CHARS = 120;

interface DueMatch {
  readonly id: number;
  readonly need_user_id: number;
  readonly field: string | null;
  readonly thread_id: number | null;
}

async function push(userId: number, text: string, threadId: number): Promise<void> {
  await sendPushNotification(String(userId), {
    title: 'Netai',
    body: text.slice(0, PUSH_BODY_CHARS),
    url: `/chat/${threadId}`,
  }).catch(() => undefined);
}

/** Card 1 for each proposed match whose owner had no match card in the last day. */
export async function deliverDueCards(): Promise<number> {
  const due = await query<DueMatch>(
    `SELECT m.id, m.need_user_id, o.field, t.thread_id
       FROM matches m
       JOIN offers o ON o.id = m.offer_id AND o.active
       JOIN tasks t ON t.id = m.need_goal_id AND t.status = 'open'
      WHERE m.state = 'proposed' AND m.expires_at > NOW()
        AND NOT EXISTS (SELECT 1 FROM matches x
                         WHERE x.need_user_id = m.need_user_id
                           AND x.card1_at > NOW() - INTERVAL '1 day')
      ORDER BY m.id LIMIT $1`,
    [CARDS_PER_RUN],
    QUERY_TIMEOUT_MS,
  );
  const carded = new Set<number>();
  for (const match of due.rows) {
    if (match.thread_id === null || match.field === null || carded.has(match.need_user_id))
      continue;
    carded.add(match.need_user_id);
    const language = await userLanguage(String(match.need_user_id));
    const text = card1Text(language, match.field);
    await saveThreadMessage(
      match.thread_id,
      match.need_user_id,
      'assistant',
      text,
      'message',
      null,
      card1Choices(language),
    );
    await query(
      `UPDATE matches SET state = 'card1', card1_thread_id = $2, card1_at = NOW() WHERE id = $1`,
      [match.id, match.thread_id],
      QUERY_TIMEOUT_MS,
    );
    await push(match.need_user_id, text, match.thread_id);
  }
  return carded.size;
}

interface CardedMatch {
  readonly id: number;
  readonly need_user_id: number;
  readonly offer_user_id: number;
  readonly field: string | null;
  readonly card1_thread_id: number | null;
  readonly need_name: string | null;
  readonly offer_name: string | null;
}

const CARDED_COLUMNS = `m.id, m.need_user_id, m.offer_user_id, o.field, m.card1_thread_id,
  (SELECT u.name FROM "User" u WHERE u.id = m.need_user_id) AS need_name,
  (SELECT u.name FROM "User" u WHERE u.id = m.offer_user_id) AS offer_name`;

async function decide(id: number, state: string): Promise<void> {
  await query(
    `UPDATE matches SET state = $2, decided_at = NOW() WHERE id = $1`,
    [id, state],
    QUERY_TIMEOUT_MS,
  );
}

async function tellTheNeed(match: CardedMatch, line: (l: RunLanguage) => string): Promise<void> {
  if (match.card1_thread_id === null) return;
  const language = await userLanguage(String(match.need_user_id));
  const text = line(language);
  await saveThreadMessage(match.card1_thread_id, match.need_user_id, 'assistant', text);
  await push(match.need_user_id, text, match.card1_thread_id);
}

/** His yes on card 1: card 2 goes to the offer's owner. */
async function sendCard2(match: CardedMatch): Promise<void> {
  const threadId = await getOrCreateDefaultThread(String(match.offer_user_id));
  const language = await userLanguage(String(match.offer_user_id));
  const text = card2Text(language, match.field ?? '');
  await saveThreadMessage(
    threadId,
    match.offer_user_id,
    'assistant',
    text,
    'message',
    null,
    card2Choices(language),
  );
  await query(
    `UPDATE matches SET state = 'need_yes', card2_thread_id = $2, card2_at = NOW() WHERE id = $1`,
    [match.id, threadId],
    QUERY_TIMEOUT_MS,
  );
  await push(match.offer_user_id, text, threadId);
}

async function cardedOn(
  card: 1 | 2,
  userId: string,
  threadId: number,
): Promise<CardedMatch | null> {
  const where =
    card === 1
      ? `m.card1_thread_id = $1 AND m.need_user_id = $2::int AND m.state = 'card1'`
      : `m.card2_thread_id = $1 AND m.offer_user_id = $2::int AND m.state = 'need_yes'`;
  const result = await query<CardedMatch>(
    `SELECT ${CARDED_COLUMNS} FROM matches m JOIN offers o ON o.id = m.offer_id
      WHERE ${where} ORDER BY m.id DESC LIMIT 1`,
    [threadId, userId],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

/** A tap on one of the two cards, acted on; the line the tapper reads. Null when no card waits here. */
export async function settleMatchTap(
  userId: string,
  threadId: number,
  card: 1 | 2,
  tap: MatchTap,
  language: RunLanguage,
): Promise<string | null> {
  const match = await cardedOn(card, userId, threadId);
  if (match === null) return null;
  if (card === 1) {
    if (tap === MatchTap.No) {
      await decide(match.id, 'declined');
      return notedLine(language);
    }
    await sendCard2(match);
    return askedLine(language);
  }
  if (tap === MatchTap.No) {
    await decide(match.id, 'declined');
    await tellTheNeed(match, nothingCameLine);
    return notedLine(language);
  }
  const needName = match.need_name?.trim() ?? '';
  const offerName = match.offer_name?.trim() ?? '';
  // Both are named to each other; an account with no name is a fault to see, not a „?" to send.
  if (needName === '' || offerName === '') {
    // eslint-disable-next-line no-console
    console.error(`[match] ${match.id}: a side has no name — left for the turn`);
    return null;
  }
  await decide(match.id, 'both_yes');
  await tellTheNeed(match, (l) => toTheNeedLine(l, offerName));
  return toTheOfferLine(language, needName);
}

/** Matches past their 14 days close; a need owner who had said yes hears it came to nothing. */
export async function expireMatches(): Promise<number> {
  const expired = await query<CardedMatch & { readonly card2_at: Date | null }>(
    `UPDATE matches SET state = 'expired', decided_at = NOW()
      WHERE state IN ('proposed', 'card1', 'need_yes') AND expires_at <= NOW()
      RETURNING id, need_user_id, offer_user_id, NULL::text AS field, card1_thread_id,
                NULL::text AS need_name, NULL::text AS offer_name, card2_at`,
    [],
    QUERY_TIMEOUT_MS,
  );
  // Card 2 went out only after his yes: he is the one owed a word.
  for (const match of expired.rows) {
    if (match.card2_at !== null) await tellTheNeed(match, nothingCameLine);
  }
  return expired.rows.length;
}
