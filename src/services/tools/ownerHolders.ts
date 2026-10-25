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
