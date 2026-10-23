import { query } from '../db/postgres/client';
import { withoutAllyWord } from './georgianScriptName';
import { nameKey } from './tools/transliterate';

/**
 * #6767 (Giorgi, 20 Oct): a person is named the way the READER has him saved —
 * that is how the reader knows him. Only when the reader has not saved him is
 * the person's own registered name used.
 *
 * The label is the reader's row for any of the person's numbers, compared as
 * digits (the book keeps „+995…", a number may be stored without it). The old
 * app's „Ally" word is not part of anybody's name.
 */
const READER_LABEL_TIMEOUT_MS = 3_000;

async function readersLabelFor(readerUserId: number, personUserId: number): Promise<string | null> {
  const result = await query<{ alias: string }>(
    `SELECT TRIM(rs_ua.alias) AS alias
       FROM "UserAlias" rs_ua
       JOIN "UserPhone" up
         ON regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace(rs_ua.phone, '\\D', '', 'g')
      WHERE rs_ua."contactId" = $1::int
        AND up."userId" = $2::int
        AND TRIM(rs_ua.alias) <> ''
      ORDER BY rs_ua.created_at
      LIMIT 1`,
    [readerUserId, personUserId],
    READER_LABEL_TIMEOUT_MS,
  );
  const label = withoutAllyWord(result.rows[0]?.alias ?? '');
  return label === '' ? null : label;
}

/**
 * #7328 (Lia's case, thread 64120): Omiko saved Iro as „Iro Tsagareishvili
 * Axel" — her name and then where she works. The Georgian line declined the
 * last word and read „ირო ცაგარეიშვილი ახელს". A label that starts with the
 * registered name, word for word in either script, is that name; the words
 * after it are the reader's note, not part of the name.
 */
export function nameWithoutNote(label: string, registeredName: string): string {
  const words = label.split(/\s+/u);
  const registered = nameKey(registeredName).split(' ');
  if (registered.length < 2 || words.length <= registered.length) return label;
  const head = words.slice(0, registered.length);
  return nameKey(head.join(' ')) === registered.join(' ') ? head.join(' ') : label;
}

/** The person's name as this reader saved him; the registered name when he did not, or the read failed. */
export async function nameAsReaderSaved(
  readerUserId: number,
  personUserId: number,
  registeredName: string,
): Promise<string> {
  if (readerUserId === personUserId) return registeredName;
  try {
    const label = await readersLabelFor(readerUserId, personUserId);
    return label === null ? registeredName : nameWithoutNote(label, registeredName);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[reader-name] the reader’s label was not read:', (err as Error).message);
    return registeredName;
  }
}
