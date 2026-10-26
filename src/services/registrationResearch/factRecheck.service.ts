import { query } from '../../db/postgres/client';
import { nameKey } from '../tools/transliterate';
import { identityWords } from './identity';
import { FactConfidence } from './plan';

/**
 * #7726 / #7727 (engagement desk, 25 Oct): research stored before 980e71d8 can
 * carry a namesake — Giorgi Maisuradze, whom members save as „UGT", shows a
 * different Giorgi Maisuradze's company. Research from 980e71d8 on keeps a fact
 * that holds none of the words others saved as possible; this applies the same
 * check once to what was stored before. Nothing is deleted.
 */
const RESEARCH_SOURCE = 'public_research';
const QUERY_TIMEOUT_MS = 10_000;
/** Everyone researched so far is a few hundred; a bound, not a target. */
const MAX_USERS = 20;
const RECHECK_NOTE = 'held as possible on re-check (#7727): holds none of the words members saved';

interface ResearchedUser {
  readonly id: number;
  readonly name: string;
}

/**
 * The dry run of 26 Oct 20:15Z held 736 facts on 201 of 203 people: every word of
 * every label counted, nicknames and city names too. Only a word that at least
 * two different members put in their labels is identity here — „UGT" on
 * Giorgi Maisuradze is saved by several people; „ძმა" by one.
 */
const MIN_SAVERS_PER_WORD = 2;
const MAX_LABELS_READ = 200;

async function sharedIdentityWords(user: ResearchedUser): Promise<string[]> {
  const result = await query<{ saver: number; alias: string }>(
    `SELECT ua."contactId" AS saver, TRIM(ua.alias) AS alias
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE up."userId" = $1 AND ua."contactId" <> $1 AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      LIMIT $2`,
    [user.id, MAX_LABELS_READ],
    QUERY_TIMEOUT_MS,
  );
  return wordsSavedByMany(result.rows, user.name);
}

/** Identity words that at least two different savers wrote. */
export function wordsSavedByMany(
  labels: readonly { saver: number; alias: string }[],
  name: string,
): string[] {
  const savers = new Map<string, Set<number>>();
  for (const { saver, alias } of labels) {
    for (const word of identityWords([alias], name)) {
      savers.set(word, (savers.get(word) ?? new Set<number>()).add(saver));
    }
  }
  return [...savers].filter(([, who]) => who.size >= MIN_SAVERS_PER_WORD).map(([word]) => word);
}

interface ConfirmedFact {
  readonly id: number;
  readonly value: string;
}

export interface RecheckReport {
  readonly dry_run: boolean;
  readonly users_read: number;
  readonly users_with_identity: number;
  readonly facts_held_possible: number;
}

/**
 * Run over everyone, the dry runs held 736 and then 780 facts: a true fact need
 * not repeat the label word („Nika Axel" works somewhere that is not Axel). So
 * the re-check runs only on the people a row names as a namesake case.
 */
async function researchedUsers(userIds: readonly number[]): Promise<ResearchedUser[]> {
  const result = await query<ResearchedUser>(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.name), ''), '') AS name
       FROM "User" u
      WHERE u."deletedAt" IS NULL AND u.id = ANY($3::int[])
        AND EXISTS (SELECT 1 FROM "UserPhone" up
                      JOIN contact_facts cf ON cf.neo4j_contact_id = up.phone
                     WHERE up."userId" = u.id AND cf.source = $1)
      LIMIT $2`,
    [RESEARCH_SOURCE, MAX_USERS, [...userIds]],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function confirmedFactsOf(userId: number): Promise<ConfirmedFact[]> {
  const result = await query<ConfirmedFact>(
    `SELECT cf.id, cf.value FROM contact_facts cf
       JOIN "UserPhone" up ON up.phone = cf.neo4j_contact_id
      WHERE up."userId" = $1 AND cf.source = $2 AND cf.retracted_at IS NULL
        AND cf.research_status IS DISTINCT FROM $3`,
    [userId, RESEARCH_SOURCE, FactConfidence.Possible],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** The facts that hold none of the identity words. */
export function factsWithoutIdentity(
  facts: readonly ConfirmedFact[],
  words: readonly string[],
): number[] {
  if (words.length === 0) return [];
  return facts
    .filter((f) => !words.some((w) => nameKey(f.value).split(' ').includes(w)))
    .map((f) => f.id);
}

async function holdAsPossible(ids: readonly number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await query(
    `UPDATE contact_facts SET research_status = $2,
            conflict_note = COALESCE(conflict_note || ' · ', '') || $3, updated_at = NOW()
      WHERE id = ANY($1::int[]) AND source = $4`,
    [[...ids], FactConfidence.Possible, RECHECK_NOTE, RESEARCH_SOURCE],
    QUERY_TIMEOUT_MS,
  );
  return result.rowCount ?? 0;
}

/**
 * The named people's research facts that hold none of the words two members
 * saved; with no such word, all of them (the row named the research a namesake's).
 */
export async function recheckStoredResearch(
  dryRun: boolean,
  userIds: readonly number[],
): Promise<RecheckReport> {
  const users = await researchedUsers(userIds);
  let withIdentity = 0;
  let held = 0;
  for (const user of users) {
    const words = await sharedIdentityWords(user);
    if (words.length > 0) withIdentity += 1;
    const facts = await confirmedFactsOf(user.id);
    const ids = words.length > 0 ? factsWithoutIdentity(facts, words) : facts.map((f) => f.id);
    held += dryRun ? ids.length : await holdAsPossible(ids);
  }
  return {
    dry_run: dryRun,
    users_read: users.length,
    users_with_identity: withIdentity,
    facts_held_possible: held,
  };
}
