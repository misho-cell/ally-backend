import { query } from '../../db/postgres/client';
import { notAnExcludedHolder } from '../excludedHolders.service';
import { netaiMember } from '../netaiMembership';
import { phoneDigits } from '../phone';

/**
 * #7826 (M5, founder 26 Oct; thread 63460): eleven searches answered „no
 * masseur" while a member who has the owner saved holds eight masseurs. The
 * second circle walked only the owner's own phonebook; the people who hold the
 * owner — the inviter, the connectors, former colleagues — were never routes.
 * A member who saved the owner knows him, so their phonebook is a way in too.
 */

const HOLDERS_TIMEOUT_MS = 5_000;
/** Members only, so this is small; a bound, not a cut. */
const MAX_OWNER_HOLDERS = 300;

/** The numbers of the members who saved one of the owner's own numbers. */
export async function ownerHolderPhones(
  userId: string,
  ownerPhones: readonly string[],
): Promise<string[]> {
  if (ownerPhones.length === 0) return [];
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT up.phone
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up."userId" = ua."contactId"
       JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
      WHERE ua.phone = ANY($2::text[]) AND ua."contactId" <> $1::int
        AND ${notAnExcludedHolder('ua."contactId"')}
        -- Only members: their assistant can be asked, and the search stays the size it was.
        AND ${netaiMember('u')}
      LIMIT $3`,
    [userId, [...ownerPhones], MAX_OWNER_HOLDERS],
    HOLDERS_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.phone);
}

/** Holders the owner has not saved himself, by digits: the bridges reached only because they hold him. */
export function holdersOnly(
  holderPhones: readonly string[],
  ownFriendPhones: readonly string[],
): Set<string> {
  const own = new Set(ownFriendPhones.map(phoneDigits));
  return new Set(holderPhones.map(phoneDigits).filter((d) => d !== '' && !own.has(d)));
}

/** Best-effort: a failed read leaves the second circle as the owner's own phonebook. */
export async function ownerHolderPhonesOrNone(
  userId: string,
  ownerPhones: readonly string[],
): Promise<string[]> {
  try {
    return await ownerHolderPhones(userId, ownerPhones);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error('[second-degree] holders of the owner unavailable:', (err as Error).message);
    return [];
  }
}

/**
 * #7826 (c), Misho 27 Oct („სულ დაასრულე"): the community connectors. A member
 * who shares one of the owner's own communities (a current `member_of` fact
 * on both numbers; a former member carries an „affiliation … (former member)"
 * fact instead and is not read here) is a route too, like a holder.
 */
export async function ownerCommunityPhones(
  userId: string,
  ownerPhones: readonly string[],
): Promise<string[]> {
  if (ownerPhones.length === 0) return [];
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT up.phone
       FROM contact_facts mine
       JOIN contact_facts theirs
         ON theirs.field_type = 'member_of' AND theirs.retracted_at IS NULL
        AND theirs.value = mine.value AND theirs.neo4j_contact_id <> mine.neo4j_contact_id
       -- Both carry the same normalised number (+995…), so the index answers.
       JOIN "UserPhone" up ON up.phone = theirs.neo4j_contact_id
       JOIN "User" u ON u.id = up."userId" AND u."deletedAt" IS NULL
      WHERE mine.field_type = 'member_of' AND mine.retracted_at IS NULL
        AND mine.neo4j_contact_id = ANY($2::text[])
        AND up."userId" <> $1::int
        AND ${notAnExcludedHolder('up."userId"')}
        AND ${netaiMember('u')}
      LIMIT $3`,
    [userId, [...ownerPhones], MAX_OWNER_HOLDERS],
    HOLDERS_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.phone);
}

/** Best-effort: a failed read leaves the second circle without the community. */
export async function ownerCommunityPhonesOrNone(
  userId: string,
  ownerPhones: readonly string[],
): Promise<string[]> {
  try {
    return await ownerCommunityPhones(userId, ownerPhones);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[second-degree] owner's community unavailable:", (err as Error).message);
    return [];
  }
}
