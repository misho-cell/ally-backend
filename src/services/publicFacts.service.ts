import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';
import { WorldAnswer, WorldPerson } from './worldAnswer';
import {
  askKey,
  FACT_FRESH_DAYS,
  FACT_KEPT_DAYS,
  isSameAsk,
  KeptFact,
  KeptSource,
  officialSources,
} from './publicFacts';

/**
 * #8350 item 4: the kept public facts (migration 287). A fact is kept only
 * from an answer that cited an official page, and only the people it named
 * with those pages; it is used for the same question for 7 days and kept for
 * 30. Every read and write here is a server convenience: a failure is logged
 * and the run goes on as if nothing were kept.
 */
const QUERY_TIMEOUT_MS = 3_000;
/** How many recent facts of one language are compared with a new question. */
const MAX_FACTS_COMPARED = 200;
export const MAX_FACTS_LISTED = 100;

interface FactRow {
  readonly id: number;
  readonly ask_key: string;
  readonly people: WorldPerson[];
  readonly sources: KeptSource[];
  readonly checked_at: Date | string;
}

function factOf(row: FactRow): KeptFact {
  return {
    id: row.id,
    askKey: row.ask_key,
    people: row.people,
    sources: row.sources,
    checkedAt: new Date(row.checked_at),
  };
}

/** The fresh kept fact for this question, the closest wording first; null when there is none. */
export async function recallFact(
  question: string,
  language: RunLanguage,
): Promise<KeptFact | null> {
  const key = askKey(question);
  if (key === '') return null;
  try {
    const result = await query<FactRow>(
      `SELECT id, ask_key, people, sources, checked_at FROM public_office_facts
        WHERE language = $1 AND checked_at > NOW() - make_interval(days => $2)
        ORDER BY (ask_key = $3) DESC, checked_at DESC
        LIMIT $4`,
      [language, FACT_FRESH_DAYS, key, MAX_FACTS_COMPARED],
      QUERY_TIMEOUT_MS,
    );
    const row = result.rows.find((r) => r.ask_key === key || isSameAsk(key, r.ask_key));
    return row === undefined ? null : factOf(row);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[public-facts] not read:', (err as Error).message);
    return null;
  }
}

/** Keeps what an answer with an official page says; a newer answer to the same question replaces it. */
export async function keepFact(
  question: string,
  language: RunLanguage,
  answer: WorldAnswer,
): Promise<boolean> {
  const key = askKey(question);
  const sources = officialSources(answer.sources);
  if (key === '' || sources.length === 0 || answer.people.length === 0) return false;
  try {
    await query(
      `INSERT INTO public_office_facts (language, ask_key, people, sources)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (language, ask_key) DO UPDATE
          SET people = EXCLUDED.people, sources = EXCLUDED.sources, checked_at = NOW()`,
      [language, key, JSON.stringify(answer.people), JSON.stringify(sources)],
      QUERY_TIMEOUT_MS,
    );
    await query(
      `DELETE FROM public_office_facts WHERE checked_at < NOW() - make_interval(days => $1)`,
      [FACT_KEPT_DAYS],
      QUERY_TIMEOUT_MS,
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[public-facts] not kept:', (err as Error).message);
    return false;
  }
}

/** The kept facts, newest first, for the admin console. */
export async function listFacts(): Promise<KeptFact[]> {
  const result = await query<FactRow>(
    `SELECT id, ask_key, people, sources, checked_at FROM public_office_facts
      ORDER BY checked_at DESC LIMIT $1`,
    [MAX_FACTS_LISTED],
    QUERY_TIMEOUT_MS,
  );
  return result.rows.map(factOf);
}

/** Forgets one kept fact, when someone says it changed; true when there was one. */
export async function forgetFact(id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM public_office_facts WHERE id = $1`,
    [id],
    QUERY_TIMEOUT_MS,
  );
  return (result.rowCount ?? 0) > 0;
}
