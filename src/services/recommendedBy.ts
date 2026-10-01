import { query } from '../db/postgres/client';
import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * PLATE v301 G5, THE SECOND HALF — „a recommended person gets the same
 * original request again".
 *
 * Giorgi's mediator recommended somebody; that person then received Giorgi's
 * first request word for word, with nothing to say why it had come to them.
 * The question is the asker's assistant's to write, but WHY this person is
 * being asked is a fact the server holds: an earlier answer on the same goal
 * named them. So the opening says it, in the reader's language, whatever the
 * question's wording is.
 */

/** A first name shorter than this is too common a substring to match on. */
const MIN_NAME_PART_CHARS = 3;

const RECOMMENDER_TIMEOUT_MS = 5_000;

/** The parts of a name an answer may use for the person: the full name and its first word. */
export function namePartsToMatch(name: string): string[] {
  const full = name.trim();
  const first = full.split(/\s+/)[0] ?? '';
  return [...new Set([full, first])].filter((part) => part.length >= MIN_NAME_PART_CHARS);
}

/**
 * Who, on this goal, answered by naming this recipient — the latest such
 * answer from somebody else. Null when nobody did, or the read failed (the ask
 * then goes as it always did).
 */
export async function recommenderFor(
  taskId: number,
  toUserId: number,
  toName: string,
): Promise<string | null> {
  const parts = namePartsToMatch(toName);
  if (parts.length === 0) return null;
  try {
    const result = await query<{ name: string | null }>(
      `SELECT u.name
         FROM task_asks ta
         JOIN "User" u ON u.id = ta.to_user_id
        WHERE ta.task_id = $1
          AND ta.to_user_id <> $2
          AND ta.answer IS NOT NULL
          AND EXISTS (SELECT 1 FROM unnest($3::text[]) AS p(part)
                       WHERE strpos(lower(ta.answer), lower(p.part)) > 0)
        ORDER BY ta.answered_at DESC NULLS LAST
        LIMIT 1`,
      [taskId, toUserId, parts],
      RECOMMENDER_TIMEOUT_MS,
    );
    return result.rows[0]?.name?.trim() || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[recommended-by] could not read the goal’s answers:', (err as Error).message);
    return null;
  }
}

/** The line that opens an ask to a person somebody recommended, in the reader's language. */
export function recommendedByLine(language: RunLanguage, recommender: string): string {
  switch (language) {
    case 'en':
      return `${recommender} recommended you for this.`;
    case 'ru':
      return `Тебя порекомендовал(а) ${recommender}.`;
    case 'es':
      return `${recommender} te recomendó para esto.`;
    default:
      return `ამ საკითხისთვის შენ ${geoName(recommender, 'erg')} დაგასახელა.`;
  }
}
