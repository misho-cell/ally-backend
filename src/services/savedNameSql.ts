/**
 * #1918 (phone report point 47): a contact the owner saved herself was shown
 * to her under the name on the person's account, or under a label somebody
 * else gave them. The owner's own label wins everywhere she sees that person;
 * another owner's label is never shown to her.
 *
 * The name the VIEWER sees for MEMBER: the viewer's own label for any of the
 * member's numbers (the fullest spelling, ties broken alphabetically so it
 * never changes between two replies), else the member's registered name.
 * Both arguments are SQL expressions for integer user ids — column
 * references, never text from a request.
 */
export function nameAsSavedBySql(viewerIdSql: string, memberIdSql: string): string {
  return `COALESCE(
    (SELECT NULLIF(TRIM(sv_ua.alias), '')
       FROM "UserAlias" sv_ua
       JOIN "UserPhone" sv_up ON sv_up.phone = sv_ua.phone
      WHERE sv_ua."contactId" = ${viewerIdSql}
        AND sv_up."userId" = ${memberIdSql}
        AND NULLIF(TRIM(sv_ua.alias), '') IS NOT NULL
      ORDER BY LENGTH(TRIM(sv_ua.alias)) DESC, sv_ua.alias
      LIMIT 1),
    (SELECT NULLIF(TRIM(sv_u.name), '') FROM "User" sv_u WHERE sv_u.id = ${memberIdSql}))`;
}

/** The asker's view of the person asked — every line in the asker's goal thread. */
export const ASKED_AS_THE_ASKER_SAVED_THEM = nameAsSavedBySql('ta.from_user_id', 'ta.to_user_id');

/** The reader's view of the person asking — every line in the reader's own chat. */
export const ASKER_AS_THE_READER_SAVED_THEM = nameAsSavedBySql('ta.to_user_id', 'ta.from_user_id');
