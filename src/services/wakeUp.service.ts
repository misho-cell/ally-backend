import { query } from '../db/postgres/client';

/**
 * The accounts that already registered and never came back.
 *
 * Measured on 5 September: of the 84 businessmen on the founder's seed list,
 * 42 were ALREADY in the base — and of those, one pays, seven have ever opened
 * Netai, and 34 have not. They are the cheapest people in the product to
 * reach: the account exists, the phone is known, and their phonebooks are
 * already loaded. Nobody had ever looked at them as a group.
 *
 * The founder's answer when shown the numbers was to build the list ("4. კი
 * კარგი იქნება"), and to keep it separate from an invitation: an invitation
 * says „come in", a wake-up says „your network is already here".
 *
 * NOTHING IS SENT FROM HERE. This module answers who and why; the channel and
 * the words are the founder's call, and reaching a real person needs his yes.
 */

/** The same three statuses the rest of the codebase counts as a live account. */
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

/** Facts that mean we can say something specific to this person. */
const KNOWN_FACT_TYPES = ['role', 'occupation', 'employer', 'expertise', 'headline'];

const WAKE_QUERY_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface WakeUpCandidate {
  user_id: number;
  phone: string;
  /** What the public record says about them — the hook for a first line. */
  facts: readonly string[];
  /** How many contacts they carry. Size of the network we would light up. */
  phonebook: number;
  /**
   * How many of THEIR OWN contacts are already active on Netai. This is the
   * whole argument for waking them: the value is already sitting in the app,
   * built by people they know.
   */
  contacts_on_netai: number;
  registered_at: string;
}

/**
 * Dormant accounts worth waking, best first.
 *
 * "Dormant" is not a shortlist on its own — 62,121 of the 62,164 accounts have
 * never opened Netai, which is the whole base. The bound that makes the list
 * mean something is the one that also makes the message writable: we only
 * wake somebody we can say something SPECIFIC to, so a candidate must carry a
 * public role fact. That is 68 people today, and it grows with every profile
 * the curator imports.
 *
 * Ranked by how many of their own contacts are already here, because that is
 * the sentence the wake-up is made of.
 */
export async function listWakeUpCandidates(limit = DEFAULT_LIMIT): Promise<WakeUpCandidate[]> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  const result = await query<{
    id: number;
    phone: string;
    facts: string[];
    phonebook: string;
    contacts_on_netai: string;
    registered_at: Date | string;
  }>(
    `WITH netai AS (
       SELECT u.id FROM "User" u
       WHERE u."deletedAt" IS NULL
         AND (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
           OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
           OR u.subscription_status = ANY($1::text[]))
     ),
     known AS (
       SELECT regexp_replace(f.neo4j_contact_id, '\\D', '', 'g') AS d,
              array_agg(DISTINCT f.field_type || ': ' ||
                        COALESCE(f.canonical_value, f.value)) AS facts
       FROM contact_facts f
       WHERE f.is_public AND f.retracted_at IS NULL
         AND f.field_type = ANY($2::text[])
       GROUP BY 1
     ),
     cand AS (
       SELECT DISTINCT ON (usr.id) usr.id, up.phone, k.facts, usr."createdAt" AS registered_at
       FROM "UserPhone" up
       JOIN known k ON k.d = regexp_replace(up.phone, '\\D', '', 'g')
       JOIN "User" usr ON usr.id = up."userId" AND usr."deletedAt" IS NULL
       WHERE NOT EXISTS (SELECT 1 FROM netai n WHERE n.id = usr.id)
       ORDER BY usr.id
     )
     SELECT c.id, c.phone, c.facts, c.registered_at,
            (SELECT COUNT(*) FROM "UserAlias" a WHERE a."contactId" = c.id) AS phonebook,
            (SELECT COUNT(DISTINCT n.id)
             FROM "UserAlias" a
             JOIN "UserPhone" p2
               ON regexp_replace(p2.phone, '\\D', '', 'g') =
                  regexp_replace(a.phone, '\\D', '', 'g')
             JOIN netai n ON n.id = p2."userId"
             WHERE a."contactId" = c.id) AS contacts_on_netai
     FROM cand c
     ORDER BY contacts_on_netai DESC, phonebook DESC, c.id
     LIMIT $3`,
    [ACTIVE_STATUSES, KNOWN_FACT_TYPES, capped],
    WAKE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((row) => ({
    user_id: Number(row.id),
    phone: row.phone,
    facts: row.facts,
    phonebook: Number(row.phonebook),
    contacts_on_netai: Number(row.contacts_on_netai),
    registered_at: new Date(row.registered_at).toISOString(),
  }));
}
