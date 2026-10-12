import { query } from '../db/postgres/client';
import { queueFollowUp } from './pendingUpdates.service';
import { notATestSeat } from './testSeatCreate.service';

/**
 * 4126, 6d (D757 §5: a user is researched once; after that Netai learns by
 * asking). Misho's yes, 12 Oct (§129), on the question itself: „სამსახურში
 * რამე სიახლეა?", asked of the user at most once a month, instead of research.
 *
 * It reaches the user the way the warm-tie question does: one item on the
 * pending list, asked when the conversation has room, never pushed.
 *
 * The question is approved. The one sentence around it
 * (WORK_NEWS_INSTRUCTION) is MODEL-FACING and new, so the whole thing stays
 * OFF until Misho says yes to that sentence (D44).
 */
export const WORK_NEWS_QUESTION_ON = false;

export const WORK_NEWS_KIND = 'work_news_question';
export const WORK_NEWS_QUESTION = 'სამსახურში რამე სიახლეა?';
export const WORK_NEWS_INSTRUCTION =
  `When the conversation has room for it — never as the opening line — ask once, in the user's ` +
  `language: „${WORK_NEWS_QUESTION}" Save what they say about their own work; if they would ` +
  'rather not say, drop it.';

const COOLDOWN_DAYS = 30;
const BATCH_LIMIT = 200;
const QUERY_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Active users with no work question in the last month; each gets one. */
export async function queueWorkNewsQuestions(
  limit: number = BATCH_LIMIT,
  on: boolean = WORK_NEWS_QUESTION_ON,
): Promise<number> {
  if (!on) return 0;
  const due = await query<{ user_id: number }>(
    `SELECT u.id AS user_id
       FROM "User" u
      WHERE u.subscription_status = 'active' AND u."deletedAt" IS NULL
        AND ${notATestSeat('u.id')}
        AND NOT EXISTS (
          SELECT 1 FROM pending_updates p
           WHERE p.user_id = u.id::text AND p.kind = $2
             AND p.created_at > NOW() - ($3 || ' days')::INTERVAL)
      ORDER BY u.id
      LIMIT $1`,
    [limit, WORK_NEWS_KIND, COOLDOWN_DAYS],
    QUERY_TIMEOUT_MS,
  );
  for (const row of due.rows) {
    await queueFollowUp(
      String(row.user_id),
      null,
      WORK_NEWS_KIND,
      {
        why: 'D757 §5: asked monthly instead of researching again',
        instruction: WORK_NEWS_INSTRUCTION,
      },
      0,
    );
  }
  return due.rows.length;
}

/** Once a day, only while switched on. */
export function startWorkNewsQuestions(on: boolean = WORK_NEWS_QUESTION_ON): boolean {
  if (!on) return false;
  setInterval(() => {
    void queueWorkNewsQuestions().catch((err: unknown) =>
      // eslint-disable-next-line no-console
      console.error('[work-news] queue failed:', (err as Error).message),
    );
  }, DAY_MS).unref();
  return true;
}
