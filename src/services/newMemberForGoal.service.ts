import { query } from '../db/postgres/client';
import { queueResult } from './pendingUpdates.service';

/**
 * ROW 262 — A CONTACT JOINS NETAI, AND ONE OF THE OWNER'S OPEN GOALS IS ABOUT
 * WHERE THEY WORK.
 *
 * D498, the founder, 25 September: „only sure matches (member's tag = an
 * organisation the goal names). Skill tags later." Misho, the same night, on
 * the same three options: „as you said" — which was option B.
 *
 * ⚠️ WHY IT IS THIS NARROW, AND THE MEASUREMENT THAT MADE IT SO.
 *
 * The obvious build is „any tag on the new member that appears in any open
 * goal". Measured on the live base this afternoon: 1,550 member/open-goal
 * pairs, 19 tag hits — and READING them, most were noise, because „lisi" is
 * inside „tbilisi". Tightened, 5 remained, of which 3 were right, and the 3
 * shared one shape: the tag was an ORGANISATION the goal named. 40% noise in a
 * message that goes to a real person is not mine to accept, so the shape
 * became the rule.
 *
 * ⚠️ AND THE SHAPE HAD TO BE MEASURED TWICE. Matching the tag against the
 * goal's TITLE alone returned zero — I nearly reported the whole row as
 * unsupported by the data. The title is a sentence somebody typed; the
 * ORGANISATION is named in the BRIEF, which is where the goal's own work is
 * written down. Same evening, same fault as everything else in it: the
 * measurement was right and the question was different.
 *
 * What survives on today's base is one goal — a bathroom tiler in Tbilisi
 * whose brief reads „Tinatin Ratiani, close friend at Arci construction … ask
 * about a trusted tiler through Arci's contractor network" — and seventeen
 * contacts tagged `arci`. That is exactly the case the row was written for,
 * and its volume is the point: this is a rare card, not a feed.
 */

/** Shorter than this and a tag matches things it has nothing to do with. */
const SHORTEST_USEFUL_TAG = 4;
/** What counts as „an organisation" — the vocabulary people have actually used. */
const ORGANISATION_FIELDS = ['employer', 'industry'];
/** A person has a handful of goals, not a hundred. A ceiling, not an expectation. */
const MOST_CARDS_PER_JOIN = 5;
const MATCH_TIMEOUT_MS = 8_000;
const NEW_MEMBER_KIND = 'new_member_for_goal';

export interface GoalTheyMightUnblock {
  readonly task_id: number;
  readonly user_id: string;
  readonly goal: string;
  readonly organisation: string;
  readonly who: string | null;
}

/**
 * ⚠️ NO REGEX IS BUILT FROM A TAG, and that is not caution — it is today's
 * own scar. A tag is text a person typed, and one of them took a search down
 * this afternoon with „parentheses not balanced" because it was compiled as a
 * pattern. A tag is only ever DATA here: the goal's words are reduced to
 * single-spaced alphanumerics and the tag is looked for with its spaces
 * around it, which is what „whole word" means and needs no pattern at all.
 *
 * The tag is additionally required to be letters, digits and spaces, so a
 * LIKE wildcard typed into a label cannot widen the match either.
 */
export async function goalsThisMemberMightUnblock(phone: string): Promise<GoalTheyMightUnblock[]> {
  const result = await query<GoalTheyMightUnblock>(
    `WITH tagged AS (
       SELECT DISTINCT ut."userId"::text AS user_id, LOWER(TRIM(ut.tag)) AS tag
         FROM "UserTags" ut
        WHERE ut.phone = $1
          AND LENGTH(TRIM(ut.tag)) >= $2
          -- Letters, digits and spaces only: anything else is not an
          -- organisation's name and must not reach a pattern of any kind.
          AND TRIM(ut.tag) ~ '^[[:alnum:] ]+$'
     ), organisations AS (
       SELECT DISTINCT LOWER(TRIM(COALESCE(cf.canonical_value, cf.value))) AS name
         FROM contact_facts cf
        WHERE cf.field_type = ANY($3::text[])
          AND cf.retracted_at IS NULL
          AND LENGTH(TRIM(COALESCE(cf.canonical_value, cf.value))) >= $2
     )
     SELECT t.id                                   AS task_id,
            t.user_id,
            t.title                                AS goal,
            tg.tag                                 AS organisation,
            NULLIF(TRIM(u.name), '')               AS who
       FROM tagged tg
       JOIN organisations o ON o.name = tg.tag
       JOIN tasks t ON t.user_id = tg.user_id AND t.status = 'open'
       LEFT JOIN "User" u ON u.phone = $1
      WHERE ' ' || REGEXP_REPLACE(
                     LOWER(COALESCE(t.title, '') || ' ' || COALESCE(t.brief, '')),
                     '[^[:alnum:]]+', ' ', 'g') || ' '
            LIKE '% ' || tg.tag || ' %'
      ORDER BY t.id
      LIMIT $4`,
    [phone, SHORTEST_USEFUL_TAG, ORGANISATION_FIELDS, MOST_CARDS_PER_JOIN],
    MATCH_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * Tell the owner, once per goal, through the same queue every other update
 * uses — held, drip-released, and delivered as its own message with its own
 * buttons rather than woven into an answer.
 *
 * ⚠️ IT TELLS; IT DOES NOT ASK ANYBODY ANYTHING. The new member is a real
 * person who has just arrived, and writing to them on the strength of a tag
 * match is precisely the „message sent in the owner's name without the owner's
 * yes" that row 1 exists about. The card carries the yes; the ask comes after.
 */
export async function tellOwnersANewMemberFitsAGoal(phone: string): Promise<number> {
  const matches = await goalsThisMemberMightUnblock(phone);
  let told = 0;
  for (const match of matches) {
    const already = await query<{ id: number }>(
      `SELECT id FROM pending_updates
        WHERE task_id = $1 AND kind = $2 AND payload->>'phone_tag' = $3
          AND status IN ('held', 'released', 'seen')
        LIMIT 1`,
      [match.task_id, NEW_MEMBER_KIND, match.organisation],
      MATCH_TIMEOUT_MS,
    );
    if (already.rows.length > 0) continue;
    await queueResult(match.user_id, match.task_id, NEW_MEMBER_KIND, {
      who: match.who,
      organisation: match.organisation,
      goal_title: match.goal,
      // Kept so the same organisation cannot produce a second card for the
      // same goal when another of its people joins next week.
      phone_tag: match.organisation,
      instruction:
        `Somebody the owner has tagged "${match.organisation}" has just opened Netai, and the ` +
        `owner's goal ${match.task_id} names that organisation in its own brief. The owner is ` +
        `being shown this as its own message with buttons. If they say yes, ask this person ` +
        `about the goal with ask_contact — their words, not a template. If they say no or say ` +
        `nothing, do not write to this person at all and do not raise it again.`,
    });
    told += 1;
  }
  return told;
}
