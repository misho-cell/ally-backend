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
/**
 * What counts as „an organisation".
 *
 * ⚠️ `industry` USED TO BE IN HERE AND IT SHOULD NOT HAVE BEEN. D498 is one
 * sentence — „only sure matches (member's tag = an organisation the goal
 * names)" — and an industry is a SECTOR, not an organisation. I widened it to
 * „the vocabulary people have actually used", which is a different rule from
 * the one the founder gave.
 *
 * The tester found it on the two seat goals within an hour of the fix: „a good
 * plumber for my flat" matched the tag `logistics` because the brief happens to
 * say a network member works in logistics. The goal does not name that
 * organisation — it does not name an organisation at all.
 *
 * Measured across every open goal on the base before removing it: `employer`
 * gives 4 goal/tag pairs over 2 owners, `industry` gives 2 pairs over 1 owner —
 * and those 2 are exactly the false pair the tester read. So the narrowing
 * costs nothing that was ever right. The split is clean in the data too: `arci`
 * is recorded as an employer, `logistics` only as an industry.
 */
const ORGANISATION_FIELDS = ['employer'];
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
/**
 * ⚠️ ONE SPELLING OF A NUMBER, and the reason is in `auth.service` in capital
 * letters: an exact string compare on a phone „created a DUPLICATE user on
 * re-login when the client sent a different format", and the old account
 * silently disappeared for its owner. The stored labels are all E.164 with a
 * leading plus — measured, 19,960 of 20,000 — so the INPUT is brought to that
 * shape rather than the column being rewritten, which keeps the index.
 *
 * A number with no country code cannot be canonicalised and simply will not
 * match. That is the honest outcome for an ambiguous input, and the route that
 * calls this says so out loud rather than reporting a confident nothing.
 */
export function canonicalPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D+/g, '');
  return digits === '' ? '' : `+${digits}`;
}

/**
 * ⚠️ WHOSE PHONEBOOK IS IT. `"UserTags"` HAS TWO ID COLUMNS AND THIS READ THE
 * WRONG ONE — for as long as it has existed.
 *
 * `"contactId"` is the PERSON WHOSE PHONEBOOK THE ROW IS IN. `"userId"` is the
 * account that owns the TAGGED NUMBER, when the tagged person happens to have
 * one. The names suggest the opposite of both.
 *
 * Measured on the live base rather than argued: of the 526,348 rows where both
 * are set, `"userId"` equals the tagged phone's own account 526,348 times —
 * every single one — and `"contactId"` equals it 115,281 times, which is just
 * the people who keep their own number in their own contacts. 411,506 rows
 * have the two columns pointing at different people.
 *
 * So what this query called „the goal's owner" was the NEW MEMBER'S OWN
 * ACCOUNT. On the live base the row could not fire at all: an unregistered
 * contact — the ordinary case this feature is for — has no `"userId"`, so the
 * CTE returned nothing, and a registered one was then struck out by the „not
 * the owner about themselves" guard, which was comparing a person to
 * themselves. Zero cards, for the right-looking reason.
 *
 * ⚠️ AND THE REPLAY DID NOT CATCH IT — it CAUSED it to look healthy. The test
 * contacts were written by §60, which put the seat's id in `"userId"`, so the
 * two ids lined up by accident on exactly the rows I was testing with, and
 * nowhere else. Same fault as everything else this week: the measurement was
 * right and the question was different.
 */
export async function goalsThisMemberMightUnblock(phone: string): Promise<GoalTheyMightUnblock[]> {
  const wanted = canonicalPhone(phone);
  if (wanted === '') return [];
  const result = await query<GoalTheyMightUnblock>(
    `WITH tagged AS (
       SELECT DISTINCT ut."contactId"::text AS user_id, LOWER(TRIM(ut.tag)) AS tag
         FROM "UserTags" ut
        WHERE ut.phone = $1
          AND ut."contactId" IS NOT NULL
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
            /**
             * ⚠️ THE NAME THE OWNER KNOWS THEM BY, first.
             *
             * This read the REGISTERED account's name, and on a replay — and
             * for anybody whose account carries no name — it came back null,
             * so the card said „Somebody new" about a person the owner has
             * had in their phonebook for months.
             *
             * The owner's own label is the better answer even when both
             * exist: the card is telling THEM that somebody THEY know has
             * arrived, and they know them as whatever they wrote down.
             */
            COALESCE(NULLIF(TRIM(own_label.alias), ''), NULLIF(TRIM(u.name), '')) AS who
       FROM tagged tg
       JOIN organisations o ON o.name = tg.tag
       JOIN tasks t ON t.user_id = tg.user_id AND t.status = 'open'
       -- ⚠️ "User" HAS NO PHONE COLUMN. A phone lives in "UserPhone", and this
       -- read said u.phone = $1 — which typechecks, because SQL is a string,
       -- and threw on every single call. The tester's first use of the dry run
       -- was four 500s in a row. Same shape as the updated_at column earlier
       -- today: nothing but reading the live schema, or running it, finds it.
       LEFT JOIN "UserPhone" up ON up.phone = $1
       LEFT JOIN "User" u ON u.id = up."userId"
       LEFT JOIN LATERAL (
         SELECT ua.alias
           FROM "UserAlias" ua
          WHERE ua."contactId"::text = tg.user_id AND ua.phone = $1
          ORDER BY LENGTH(TRIM(ua.alias)) DESC
          LIMIT 1
       ) own_label ON TRUE
      -- ⚠️ NOT THE OWNER ABOUT THEMSELVES, and this guard only started doing
      -- that once the CTE above was reading the phonebook's owner. While
      -- tg.user_id was the tagged number's own account, this line compared a
      -- person to themselves and silently threw away every registered match.
      --
      -- Found by running the dry run on goal 5678's real case: it came back
      -- naming the goal's OWN owner,
      -- because the number tagged arci in his phonebook is his own. People
      -- keep their own number in their own contacts and tag it with where
      -- they work, and without this the card reads "Tornike Abuladze has just
      -- opened Netai" to Tornike. (No backtick in here: this SQL lives in a
      -- template literal and one ends the string.)
      --
      -- PARENTHESISED, because OR binds looser than AND: written flat, this
      -- reads as "(not the owner) OR (registered AND the tag matches)", so an
      -- unregistered number would have skipped the tag test altogether and
      -- matched every open goal the person has.
      WHERE (up."userId" IS NULL OR up."userId"::text <> tg.user_id)
        AND ' ' || REGEXP_REPLACE(
                     LOWER(COALESCE(t.title, '') || ' ' || COALESCE(t.brief, '')),
                     '[^[:alnum:]]+', ' ', 'g') || ' '
            LIKE '% ' || tg.tag || ' %'
      ORDER BY t.id
      LIMIT $4`,
    [wanted, SHORTEST_USEFUL_TAG, ORGANISATION_FIELDS, MOST_CARDS_PER_JOIN],
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
