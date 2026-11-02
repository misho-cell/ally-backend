import { query } from '../db/postgres/client';

/**
 * #8527 (the tester's 80752 item 13, case 108; Misho's yes, 2 Nov): „it is
 * Petashvili, not Fetashvili" was saved as a note, and every search still showed
 * the old name — there was no way to rename. The owner's correction becomes
 * their newest label for the number. The searches show the newest own label, so
 * the new name is what they show; the old label stays as a row, so the old
 * spelling still finds the person and the change can be undone.
 */
export const OWNER_RENAME_SOURCE = 'owner_rename';
const RENAME_QUERY_TIMEOUT_MS = 5_000;
const MAX_NAME_CHARS = 80;
const HAS_LETTER_RE = /\p{L}/u;

export enum RenameRefusal {
  NoName = 'no_name',
  TooLong = 'too_long',
  NotYourContact = 'not_your_contact',
}

export type RenameOutcome =
  | { readonly renamed: true; readonly name: string }
  | { readonly renamed: false; readonly reason: RenameRefusal };

/** The name as it will be saved, or the reason it cannot be. */
export function cleanName(raw: string): string | RenameRefusal {
  const name = raw.replace(/\s+/gu, ' ').trim();
  if (name === '' || !HAS_LETTER_RE.test(name)) return RenameRefusal.NoName;
  if (name.length > MAX_NAME_CHARS) return RenameRefusal.TooLong;
  return name;
}

export async function renameOwnContact(
  userId: string,
  phone: string,
  newName: string,
): Promise<RenameOutcome> {
  const name = cleanName(newName);
  if (name === RenameRefusal.NoName || name === RenameRefusal.TooLong) {
    return { renamed: false, reason: name };
  }
  const own = await query<{ phone: string }>(
    `SELECT phone FROM "UserAlias"
      WHERE "contactId" = $1::int
        AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2::text, '\\D', '', 'g')
      LIMIT 1`,
    [userId, phone],
    RENAME_QUERY_TIMEOUT_MS,
  );
  const stored = own.rows[0]?.phone;
  if (stored === undefined) return { renamed: false, reason: RenameRefusal.NotYourContact };
  await query(
    `INSERT INTO "UserAlias" (phone, "contactId", alias, source)
     VALUES ($1::text, $2::int, $3::text, $4::text)`,
    [stored, userId, name, OWNER_RENAME_SOURCE],
    RENAME_QUERY_TIMEOUT_MS,
  );
  return { renamed: true, name };
}
