/**
 * #1918 (phone report point 47): a contact the owner saved herself was shown
 * to her under the name on the person's account, or under a label somebody
 * else gave them. The owner's own label wins everywhere she sees that person;
 * another owner's label is never shown to her.
 *
 * The name the VIEWER sees for MEMBER: the viewer's own label for any of the
 * member's numbers (the fullest clean spelling, ties broken alphabetically so
 * it never changes between two replies), else the member's registered name.
 * Both arguments are SQL expressions for integer user ids — column
 * references, never text from a request.
 *
 * #2312 (the founder's own chat, 7 Oct): the status line read „LIST. <name>.
 * Ally. Force: …" — the fullest of his labels was a phonebook-import note, not
 * a name. A label with a dot in it, or longer than a name runs, is passed over
 * for a clean one, then for the person's registered name, and is shown only
 * when there is nothing else.
 */
const MAX_NAME_WORDS = 4;

function labelOf(viewerIdSql: string, memberIdSql: string, cleanOnly: boolean): string {
  const clean = cleanOnly
    ? `AND sv_ua.alias NOT LIKE '%.%'
        AND array_length(regexp_split_to_array(TRIM(sv_ua.alias), '\\s+'), 1) <= ${MAX_NAME_WORDS}`
    : '';
  return `(SELECT NULLIF(TRIM(sv_ua.alias), '')
       FROM "UserAlias" sv_ua
       JOIN "UserPhone" sv_up ON sv_up.phone = sv_ua.phone
      WHERE sv_ua."contactId" = ${viewerIdSql}
        AND sv_up."userId" = ${memberIdSql}
        AND NULLIF(TRIM(sv_ua.alias), '') IS NOT NULL
        ${clean}
      ORDER BY LENGTH(TRIM(sv_ua.alias)) DESC, sv_ua.alias
      LIMIT 1)`;
}

export function nameAsSavedBySql(viewerIdSql: string, memberIdSql: string): string {
  return `COALESCE(
    ${labelOf(viewerIdSql, memberIdSql, true)},
    (SELECT NULLIF(TRIM(sv_u.name), '') FROM "User" sv_u WHERE sv_u.id = ${memberIdSql}),
    ${labelOf(viewerIdSql, memberIdSql, false)})`;
}

/** The asker's view of the person asked — every line in the asker's goal thread. */
export const ASKED_AS_THE_ASKER_SAVED_THEM = nameAsSavedBySql('ta.from_user_id', 'ta.to_user_id');

/** The reader's view of the person asking — every line in the reader's own chat. */
export const ASKER_AS_THE_READER_SAVED_THEM = nameAsSavedBySql('ta.to_user_id', 'ta.from_user_id');
