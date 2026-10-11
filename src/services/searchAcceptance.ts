import { query } from '../db/postgres/client';
import { recordSearchOutcome, SearchOutcome } from './searchOutcome.service';

/**
 * 2810 (MASTER TEST RUN AD-015, 2 of 2): the owner asked „ვინ მყავს
 * კონტაქტებში იურისტი?", got the name, said it was what she needed — and the
 * search stayed without an outcome, so „successful searches" stayed 0. The
 * model is asked to call record_search_outcome and rarely does. The server
 * reads the plain cases itself: a short line right after a search that says
 * „that is what I needed" is `accepted`; „that is not what I needed" is
 * `refused`. A rung the owner already climbed is never overwritten.
 */
const QUERY_TIMEOUT_MS = 5_000;
/** An acceptance is a short reply, not a new request that happens to contain the words. */
const MAX_VERDICT_CHARS = 80;
/** How long after a search a line can still be about it. */
const SEARCH_WINDOW_MINUTES = 30;

const ACCEPTS_RE =
  /(ეს\s+მჭირდებოდა|ზუსტად\s+ეს|სწორედ\s+ეს|იდეალურია|შესანიშნავია|ეს\s+გამომადგება|\bthat'?s\s+(?:exactly\s+)?what\s+i\s+needed\b|\bexactly\s+what\s+i\s+needed\b|\bperfect\b|\bthat\s+helps\b|\bthat\s+works\b|то,?\s+что\s+нужно|именно\s+то|подходит|justo\s+lo\s+que\s+necesitaba|me\s+sirve)/iu;

const REFUSES_RE =
  /(ეს\s+არ\s+მჭირდება|ეს\s+არ\s+არის\s+ის|არ\s+გამომადგება|\bnot\s+what\s+i\s+needed\b|\bnot\s+(?:quite\s+)?right\b|\bdoesn'?t\s+help\b|не\s+то|не\s+подходит|no\s+es\s+lo\s+que\s+necesitaba|no\s+me\s+sirve)/iu;

/** What this line says about the search just shown; null for anything else. */
export function verdictOn(line: string): SearchOutcome | null {
  const text = line.trim();
  if (text === '' || text.length > MAX_VERDICT_CHARS) return null;
  if (REFUSES_RE.test(text)) return 'refused';
  if (ACCEPTS_RE.test(text)) return 'accepted';
  return null;
}

/** The owner's newest search that found someone, still without an outcome, in the last half hour. */
async function latestOpenSearch(userId: string): Promise<number | null> {
  const result = await query<{ id: number }>(
    `SELECT id FROM search_activity
      WHERE user_id = $1 AND result_count > 0 AND outcome IS NULL
        AND created_at > NOW() - make_interval(mins => $2)
      ORDER BY id DESC LIMIT 1`,
    [userId, SEARCH_WINDOW_MINUTES],
    QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.id ?? null;
}

/** Records the owner's plain verdict on the search just shown. Never fails the turn. */
export async function noteSearchVerdict(userId: string, line: string): Promise<void> {
  const verdict = verdictOn(line);
  if (verdict === null) return;
  try {
    const searchId = await latestOpenSearch(userId);
    if (searchId === null) return;
    await recordSearchOutcome({
      searchId,
      userId,
      outcome: verdict,
      reason: 'the owner said so in the chat',
      onlyIfUnset: true,
    });
    // eslint-disable-next-line no-console
    console.log(`[search-outcome] search ${searchId}: ${verdict}, from the owner's own line`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[search-outcome] verdict not recorded:', (err as Error).message);
  }
}
