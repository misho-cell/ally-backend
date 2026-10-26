/**
 * #1918 (phone report point 47): a contact the owner saved herself was shown
 * to her under the name on the person's account, or under a label somebody
 * else gave them. The owner's own label wins everywhere she sees that person;
 * another owner's label is never shown to her.
 *
 * The name the VIEWER sees for MEMBER: the viewer's own label for any of the
 * member's numbers (the one she saved last, so a rename shows at once and the
 * same name comes back every reply), else the member's registered name.
 *
 * The tester's 62340 (55012, 55015): a seat saved as „Helper C …" and later as
 * „Levani …" was still told as Helper C, because the longer label won. The
 * latest label wins here as it does in search (0381).
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
      ORDER BY sv_ua.id DESC
      LIMIT 1)`;
}

export function nameAsSavedBySql(viewerIdSql: string, memberIdSql: string): string {
  return `COALESCE(
    ${labelOf(viewerIdSql, memberIdSql, true)},
    (SELECT NULLIF(TRIM(sv_u.name), '') FROM "User" sv_u WHERE sv_u.id = ${memberIdSql}),
    ${labelOf(viewerIdSql, memberIdSql, false)})`;
}

/** The viewer's own clean label for the member, or NULL — no fallback to the account name. */
export function savedLabelSql(viewerIdSql: string, memberIdSql: string): string {
  return labelOf(viewerIdSql, memberIdSql, true);
}

/** The goal owner of the ask row `ta`; SQL. */
const GOAL_OWNER_OF_ASK = '(SELECT go_t.user_id::int FROM tasks go_t WHERE go_t.id = ta.task_id)';

/** The asker's view of the person asked — every line in the asker's goal thread. */
export const ASKED_AS_THE_ASKER_SAVED_THEM = nameAsSavedBySql('ta.from_user_id', 'ta.to_user_id');

/** #7856: an unnamed ask reads this wherever the reader would see who asked. */
export const UNNAMED_ASKER = 'Netai-ის ერთ-ერთი წევრი';

/**
 * The reader's view of the person asking — every line in the reader's own chat.
 * #7856: an ask the owner wanted unnamed names nobody there either.
 */
export const ASKER_AS_THE_READER_SAVED_THEM = `CASE WHEN ta.anonymous THEN '${UNNAMED_ASKER}'
    ELSE (${nameAsSavedBySql('ta.to_user_id', 'ta.from_user_id')}) END`;

/**
 * 5347 (the tester's 63861 c): at the third link the pass-on card read „ask X
 * for L2" — the person who passed it on, not the one the question is for. On a
 * relayed ask the goal's owner is named: the reader's own label for them, else
 * the name the person passing it on knows them by. A first-hand ask is the
 * owner's own, read as before.
 */
export const QUESTION_IS_FOR_AS_THE_READER_KNOWS_THEM = `CASE WHEN ta.parent_ask_id IS NULL
    THEN ${ASKER_AS_THE_READER_SAVED_THEM}
    ELSE COALESCE(
      ${savedLabelSql('ta.to_user_id', GOAL_OWNER_OF_ASK)},
      ${nameAsSavedBySql('ta.from_user_id', GOAL_OWNER_OF_ASK)})
  END`;
