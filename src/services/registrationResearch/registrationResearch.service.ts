import { query } from '../../db/postgres/client';
import { fetchPage, webSearch } from '../tools/webSearch';
import { Extracted, extractFacts, extractResearch, PersonGiven, ReadText } from './extract';
import { LIST_PEOPLE_ON, newUserAsKnown, storeListedPeople } from './listedPeople';
import {
  factsToStore,
  firstQueries,
  MAX_SNIPPET_CHARS,
  pagesLeft,
  searchesLeft,
  sourceHost,
  StoredFact,
} from './plan';

/**
 * 4126 item 1 — one research run per new user, at registration (D757 §5), within
 * Misho's hard stop.
 *
 * ON since Misho's yes to REGISTRATION_EXTRACT_BRIEF, 12 Oct (§129). Back to
 * false stops it: nothing is queued and the ticker never starts.
 */
export const REGISTRATION_RESEARCH_ON = true;

/** The same saver and the same private, unmatchable shape as the Axel research (4225). */
const SYSTEM_SAVER_ID = '0';
/** The Axel research's own source: facts about me, the republish passes and the reads all know it. */
const RESEARCH_SOURCE = 'public_research';
const QUERY_TIMEOUT_MS = 10_000;
const TICK_INTERVAL_MS = 30_000;
/**
 * The 21 Oct launch (the tester's 60292 and 60358, F9; Misho's yes to Q6, 15
 * Oct): one user a minute meant 200 sign-ups waited 200 minutes for their
 * research. Up to this many users are researched at once, each worker taking
 * the next queued user as soon as it finishes the last.
 */
export const RESEARCH_WORKERS = 5;
let workersRunning = 0;
const MAX_ERROR_CHARS = 300;

/** Queue the new user once; a second call for the same user does nothing. */
export async function queueRegistrationResearch(
  userId: number,
  on: boolean = REGISTRATION_RESEARCH_ON,
): Promise<boolean> {
  if (!on) return false;
  const result = await query(
    `INSERT INTO registration_research (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}

interface Claimed {
  readonly userId: number;
  readonly name: string;
  readonly city: string | null;
  readonly phones: readonly string[];
}

/** The oldest queued user, marked running in the same statement so no other tick takes it. */
async function claimNext(): Promise<Claimed | null> {
  const result = await query<{ user_id: number; name: string | null; city: string | null }>(
    `UPDATE registration_research r SET status = 'running', started_at = NOW()
      WHERE r.user_id = (
        SELECT user_id FROM registration_research WHERE status = 'queued'
         ORDER BY queued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING r.user_id,
        (SELECT name FROM "User" WHERE id = r.user_id) AS name,
        (SELECT value FROM user_profile_kv WHERE user_id = r.user_id::text AND key = 'city' LIMIT 1) AS city`,
    [],
    QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const phones = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = $1 LIMIT 5`,
    [row.user_id],
    QUERY_TIMEOUT_MS,
  );
  return {
    userId: row.user_id,
    name: (row.name ?? '').trim(),
    city: row.city,
    phones: phones.rows.map((p) => p.phone),
  };
}

interface Gathered {
  readonly texts: ReadText[];
  readonly searches: number;
  readonly pages: number;
}

function hitsOf(reply: object): ReadText[] {
  const raw = (reply as Record<string, unknown>).results;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((hit: unknown) => {
    const h = hit as Record<string, unknown>;
    if (typeof h.url !== 'string' || sourceHost(h.url) === null) return [];
    const text = typeof h.snippet === 'string' ? h.snippet : '';
    const title = typeof h.title === 'string' ? h.title : null;
    return [{ url: h.url, title, text: text.slice(0, MAX_SNIPPET_CHARS), isPage: false }];
  });
}

/** Searches, then the pages they found, both inside the stop. */
async function gather(person: PersonGiven): Promise<Gathered> {
  const snippets: ReadText[] = [];
  const queries = firstQueries(person.name, person.city).slice(0, searchesLeft(0));
  for (const q of queries) snippets.push(...hitsOf(await webSearch(q)));
  const urls = [...new Set(snippets.map((s) => s.url))].slice(0, pagesLeft(0));
  const pages: ReadText[] = [];
  for (const url of urls) {
    const page = (await fetchPage(url)) as Record<string, unknown>;
    if (typeof page.content === 'string' && page.content.trim() !== '') {
      pages.push({ url, title: null, text: page.content, isPage: true });
    }
  }
  return { texts: [...snippets, ...pages], searches: queries.length, pages: urls.length };
}

/** The facts on every number of the user's own; a fact the user removed stays removed. */
async function storeFacts(
  phones: readonly string[],
  facts: readonly StoredFact[],
): Promise<number> {
  let stored = 0;
  for (const phone of phones) {
    for (const f of facts) {
      const result = await query(
        `INSERT INTO contact_facts
           (neo4j_contact_id, submitted_by_user_id, field_type, value, is_public, source,
            confidence, is_matchable, source_url, fact_date, research_status, conflict_note)
         SELECT $1, $2, $3, $4, false, $5, 'mentioned', false, $6, $7::date, $8, $9
          WHERE NOT EXISTS (
            SELECT 1 FROM contact_facts
             WHERE neo4j_contact_id = $1 AND submitted_by_user_id = $2 AND field_type = $3
               AND (value = $4 OR removed_by_subject_at IS NOT NULL))
         ON CONFLICT DO NOTHING`,
        [
          phone,
          SYSTEM_SAVER_ID,
          f.key,
          f.value,
          RESEARCH_SOURCE,
          f.sourceUrl,
          f.date,
          f.confidence,
          f.conflictNote,
        ],
        QUERY_TIMEOUT_MS,
      );
      stored += result.rowCount ?? 0;
    }
  }
  return stored;
}

async function finish(
  userId: number,
  status: 'done' | 'failed',
  counts: { searches: number; pages: number; facts: number },
  error: string | null,
): Promise<void> {
  await query(
    `UPDATE registration_research
        SET status = $2, searches = $3, pages = $4, facts = $5, error = $6, finished_at = NOW()
      WHERE user_id = $1`,
    [userId, status, counts.searches, counts.pages, counts.facts, error],
    QUERY_TIMEOUT_MS,
  );
}

/** The extractor's answer; the listed people are asked for only while LIST_PEOPLE_ON. */
async function extracted(
  userId: number,
  given: PersonGiven,
  texts: readonly ReadText[],
  withListedPeople: boolean,
): Promise<Extracted> {
  if (!withListedPeople) return { facts: await extractFacts(userId, given, texts), listed: [] };
  return extractResearch(userId, given, texts, true);
}

/** One queued user researched; false when nobody was waiting. */
export async function researchNextUser(
  withListedPeople: boolean = LIST_PEOPLE_ON,
): Promise<boolean> {
  const person = await claimNext();
  if (person === null) return false;
  const counts = { searches: 0, pages: 0, facts: 0, listed: 0 };
  try {
    if (person.name === '' || person.phones.length === 0) {
      await finish(person.userId, 'done', counts, 'no name or number to research');
      return true;
    }
    const given = { name: person.name, city: person.city };
    const gathered = await gather(given);
    counts.searches = gathered.searches;
    counts.pages = gathered.pages;
    const found = await extracted(person.userId, given, gathered.texts, withListedPeople);
    const facts = factsToStore(found.facts);
    counts.facts = await storeFacts(person.phones, facts);
    const newUser = newUserAsKnown(person.phones[0], person.name, facts);
    counts.listed = await storeListedPeople(found.listed, newUser);
    await finish(person.userId, 'done', counts, null);
    // eslint-disable-next-line no-console
    console.log(
      `[registration-research] user ${person.userId}: ${counts.searches} searches, ` +
        `${counts.pages} pages, ${counts.facts} facts, ${counts.listed} listed people`,
    );
  } catch (err) {
    const message = (err as Error).message.slice(0, MAX_ERROR_CHARS);
    // eslint-disable-next-line no-console
    console.error(`[registration-research] user ${person.userId} failed:`, message);
    await finish(person.userId, 'failed', counts, message);
  }
  return true;
}

/** One worker: researches queued users one after another until none is left. */
async function researchUntilEmpty(research: () => Promise<boolean>): Promise<void> {
  workersRunning += 1;
  try {
    while (await research()) {
      // the next queued user, straight away
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[registration-research] worker stopped:', (err as Error).message);
  } finally {
    workersRunning -= 1;
  }
}

/** Starts workers up to the limit; each one ends when the queue is empty. */
export function fillResearchWorkers(
  research: () => Promise<boolean> = researchNextUser,
  workers: number = RESEARCH_WORKERS,
): number {
  let started = 0;
  while (workersRunning < workers) {
    void researchUntilEmpty(research);
    started += 1;
  }
  return started;
}

/** The ticker: tops the workers up, and only while the run is on. */
export function startRegistrationResearch(on: boolean = REGISTRATION_RESEARCH_ON): boolean {
  if (!on) return false;
  setInterval(() => fillResearchWorkers(), TICK_INTERVAL_MS).unref();
  return true;
}
