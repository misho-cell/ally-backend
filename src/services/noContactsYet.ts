import { query } from '../db/postgres/client';

/**
 * 2707 (the master test run's ON-006 / ON-007; Misho's yes, §99.3): on a new
 * seat with no phonebook, „კარგი იურისტი მჭირდება…" ran as a goal and asked
 * „which city?", never saying the one true thing — the contacts are not in yet.
 * The goal opens before the run, so the run is a goal step, not onboarding.
 * A goal run for an owner with no phonebook row gets one line, on the
 * conversation's first owner line only, so it is said once.
 */
const NO_CONTACTS_READ_TIMEOUT_MS = 3_000;
const FIRST_OWNER_LINES = 1;

export const NO_CONTACTS_YET_SECTION =
  '\n\n## კონტაქტები ჯერ არ არის (2707)\n' +
  'ამ მფლობელს კონტაქტები ჯერ არ აუტვირთავს. პასუხის დასაწყისში ერთი წინადადებით უთხარი, ' +
  'რომ მისი კონტაქტები ჯერ არ ჩანს, და სთხოვე ატვირთოს — ასე მის ნაცნობებშიც მოვძებნი. ' +
  'მერე დაეხმარე იმით, რაც გაქვს. ეს მხოლოდ ერთხელ თქვი.';

export async function noContactsYetSection(userId: string, threadId: number): Promise<string> {
  try {
    const result = await query<{ applies: boolean }>(
      `SELECT NOT EXISTS (SELECT 1 FROM "UserAlias" WHERE "contactId" = $1::int)
          AND (SELECT count(*) FROM conversations
                WHERE thread_id = $2 AND role = 'user' AND kind = 'message'
                  AND content NOT LIKE '[%' AND content NOT LIKE '(%') <= $3 AS applies`,
      [userId, threadId, FIRST_OWNER_LINES],
      NO_CONTACTS_READ_TIMEOUT_MS,
    );
    return result.rows[0]?.applies === true ? NO_CONTACTS_YET_SECTION : '';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[no-contacts-yet] not read:', (err as Error).message);
    return '';
  }
}
