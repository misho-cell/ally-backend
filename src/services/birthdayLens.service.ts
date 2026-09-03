import { query } from '../db/postgres/client';

/**
 * The birthday lens (D1, decided 14 August; Ticket 9 Task 32.1).
 *
 * Its guardrail has been in the prompt since Ticket 6 — "only for warm,
 * playful moments, never in professional matching, ranking or introductions"
 * — but nothing ever read a birthday back, so the lens had a rule and no eye.
 *
 * The source is deliberately the user's OWN saved facts, which is what D1
 * said ("a nudge for a contact's birthday when one is saved in facts"). The
 * `User.birthday` column holds 2,726 members' own profile dates, and surfacing
 * those to a third person who merely has them in a phonebook would be a new
 * disclosure nobody authorised. A date the user recorded themselves is theirs
 * to be reminded of.
 */

const QUERY_TIMEOUT_MS = 8_000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const RESULT_LIMIT = 50;

/** Field keys people actually use when they save a birthday. */
const BIRTHDAY_KEYS = ['birthday', 'birthdate', 'დაბადება', 'დაბადების_დღე', 'დაბადების დღე'];

const GEORGIAN_MONTHS: Readonly<Record<string, number>> = {
  იანვ: 1,
  თებერ: 2,
  მარტ: 3,
  აპრილ: 4,
  მაის: 5,
  ივნის: 6,
  ივლის: 7,
  აგვისტ: 8,
  სექტემბ: 9,
  ოქტომბ: 10,
  ნოემბ: 11,
  დეკემბ: 12,
};

const ENGLISH_MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export interface MonthDay {
  month: number;
  day: number;
}

/**
 * Pull a month and day out of however the person wrote it.
 *
 * People write dates as they speak them, so this reads ISO, dotted and slashed
 * forms and both alphabets' month names. It deliberately returns null rather
 * than guessing: a birthday reminder on the wrong day is worse than none.
 */
export function parseMonthDay(value: string): MonthDay | null {
  const text = value.trim().toLowerCase();

  const iso = /(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/.exec(text);
  if (iso) return validMonthDay(Number(iso[2]), Number(iso[3]));

  // 12.11 / 12/11 / 12-11 — day first, the local convention.
  const numeric = /(?:^|\D)(\d{1,2})[./-](\d{1,2})(?:\D|$)/.exec(text);
  if (numeric) return validMonthDay(Number(numeric[2]), Number(numeric[1]));

  const day = /(?:^|\D)(\d{1,2})(?:\D|$)/.exec(text);
  if (!day) return null;
  for (const [stem, month] of Object.entries(GEORGIAN_MONTHS)) {
    if (text.includes(stem)) return validMonthDay(month, Number(day[1]));
  }
  for (const [stem, month] of Object.entries(ENGLISH_MONTHS)) {
    if (text.includes(stem)) return validMonthDay(month, Number(day[1]));
  }
  return null;
}

function validMonthDay(month: number, day: number): MonthDay | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

/** Days from today until the next occurrence — 0 means today. */
export function daysUntil(target: MonthDay, from: Date = new Date()): number {
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  let next = Date.UTC(from.getUTCFullYear(), target.month - 1, target.day);
  if (next < today) next = Date.UTC(from.getUTCFullYear() + 1, target.month - 1, target.day);
  return Math.round((next - today) / 86_400_000);
}

export interface UpcomingBirthday {
  contact_id: string;
  name: string | null;
  saved_as: string;
  days_until: number;
}

export async function getUpcomingBirthdays(
  userId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): Promise<UpcomingBirthday[]> {
  const days = Math.min(
    Math.max(Math.trunc(windowDays) || DEFAULT_WINDOW_DAYS, 1),
    MAX_WINDOW_DAYS,
  );
  const result = await query<{ phone: string; name: string | null; value: string }>(
    `SELECT cf.neo4j_contact_id AS phone, MAX(ua.alias) AS name, MAX(cf.value) AS value
     FROM contact_facts cf
     LEFT JOIN "UserAlias" ua ON ua.phone = cf.neo4j_contact_id AND ua."contactId" = $1
     WHERE cf.submitted_by_user_id = $2
       AND cf.retracted_at IS NULL
       AND cf.field_type = ANY($3::text[])
     GROUP BY cf.neo4j_contact_id
     LIMIT $4`,
    [userId, userId, BIRTHDAY_KEYS, RESULT_LIMIT],
    QUERY_TIMEOUT_MS,
  );

  return result.rows
    .map((row) => {
      const parsed = parseMonthDay(row.value);
      if (!parsed) return null;
      return {
        contact_id: row.phone,
        name: row.name,
        saved_as: row.value,
        days_until: daysUntil(parsed, now),
      };
    })
    .filter((b): b is UpcomingBirthday => b !== null && b.days_until <= days)
    .sort((a, b) => a.days_until - b.days_until);
}
