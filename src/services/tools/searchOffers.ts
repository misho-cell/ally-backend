import { query } from '../../db/postgres/client';
import { buildRawWordGroups, toWordStartPattern } from './transliterate';

/**
 * #8525 (the prompt-test chat, cases 24 and 14; Misho's yes, 4 Nov, on the recommendation
 * „the agent sees that the person offers help in this area, but does not show the offer's
 * text to anyone word for word"): a member's offer „Odoo / ERP" was not found by „ERP".
 * Offers (D679/D680) were read only by pre-matching, bridge choice and the nightly matcher.
 * Now the owner's own contacts who are members, and whose active offer matches the
 * query's words, come back with the insight search.
 */
const QUERY_TIMEOUT_MS = 4_000;
const MAX_OFFERS = 10;
const MAX_OFFER_CHARS = 200;

export const OFFERS_NOTE =
  'These are the owner’s own contacts who told Netai they are open to help in this area. ' +
  'Say in your own words that they offered help with it; never quote their offer text, and ' +
  'never show it to anyone else word for word.';

export interface OfferMatch {
  readonly saved_as: string;
  readonly open_to: string;
}

/** The owner's contacts whose active offer matches the query's words. */
export async function offersMatching(userId: string, searchQuery: string): Promise<OfferMatch[]> {
  const patterns = buildRawWordGroups(searchQuery).flat().map(toWordStartPattern);
  if (patterns.length === 0) return [];
  const result = await query<{ saved_as: string; text: string }>(
    `SELECT DISTINCT ON (o.user_id) a.alias AS saved_as, o.text
       FROM offers o
       JOIN "UserPhone" up ON up."userId" = o.user_id
       JOIN "UserAlias" a ON a."contactId" = $1::int AND a.phone = up.phone
      WHERE o.active AND o.user_id <> $1::int AND o.text ~* ANY($2::text[])
      ORDER BY o.user_id, o.created_at DESC
      LIMIT $3`,
    [userId, patterns, MAX_OFFERS],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    saved_as: row.saved_as,
    open_to: row.text.slice(0, MAX_OFFER_CHARS),
  }));
}

/** The insight result with the matching offers added; the result unchanged when there are none. */
export function withOffers(result: object, offers: readonly OfferMatch[]): object {
  if (offers.length === 0) return result;
  return { ...result, open_to_help: offers, open_to_help_note: OFFERS_NOTE };
}
