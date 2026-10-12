/**
 * 4126 item 1 — the pure half of the registration research run: which searches
 * to make, how far the run may go, and how sure each fact is.
 *
 * D757 (Lika + Tornike): a user is researched ONCE, at registration, as deep as
 * possible. Misho's „შეზღუდე" (§122 scope): with a hard stop per person, so one
 * common name cannot spend without limit.
 */

/** Misho's stop, per person (scope item 1). */
export const MAX_SEARCHES_PER_PERSON = 60;
export const MAX_PAGES_PER_PERSON = 30;

/** The extractor reads at most this much of one page. */
export const MAX_PAGE_CHARS = 6_000;
export const MAX_SNIPPET_CHARS = 600;
export const MAX_FACT_CHARS = 500;

/** Keys a fact may carry; anything else the extractor returns is dropped. */
export const RESEARCH_FACT_KEYS: ReadonlySet<string> = new Set([
  'occupation',
  'employer',
  'industry',
  'city',
  'education',
  'affiliation',
  'expertise',
  'other_role',
  'headline',
]);

/** contact_facts holds one value per saver for these (uq_contact_facts_structured). */
export const ONE_VALUE_KEYS: ReadonlySet<string> = new Set([
  'occupation',
  'employer',
  'city',
  'industry',
]);

export enum FactConfidence {
  Confirmed = 'confirmed',
  Possible = 'possible',
}

export interface FoundFact {
  readonly key: string;
  readonly value: string;
  readonly sources: readonly string[];
  readonly date: string | null;
}

export interface StoredFact {
  readonly key: string;
  readonly value: string;
  readonly sourceUrl: string;
  readonly date: string | null;
  readonly confidence: FactConfidence;
  readonly conflictNote: string | null;
}

/** The first searches for a person: the name alone, then with what they gave at signup. */
export function firstQueries(name: string, city: string | null): string[] {
  const person = name.trim();
  if (person === '') return [];
  const quoted = `"${person}"`;
  const queries = [quoted, `${quoted} LinkedIn`, `${quoted} company`, `${quoted} სამსახური`];
  if (city !== null && city.trim() !== '') queries.splice(1, 0, `${quoted} ${city.trim()}`);
  return queries.slice(0, MAX_SEARCHES_PER_PERSON);
}

/** How many more searches the stop allows. */
export function searchesLeft(spent: number): number {
  return Math.max(0, MAX_SEARCHES_PER_PERSON - spent);
}

/** How many more pages the stop allows. */
export function pagesLeft(spent: number): number {
  return Math.max(0, MAX_PAGES_PER_PERSON - spent);
}

const OFFICIAL_HOST_RE = /(?:^|\.)gov(?:\.[a-z]{2})?$|(?:^|\.)gov\.ge$|(?:^|\.)parliament\.ge$/iu;
const WWW_RE = /^www\./iu;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/** The site a source lives on, without „www."; null for anything that is not a URL. */
export function sourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(WWW_RE, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * D757 §3: source quality, not count, decides. An official source confirms on
 * its own; otherwise two independent sites do. One ordinary source is
 * „possible".
 */
export function confidenceOf(sources: readonly string[]): FactConfidence {
  const hosts = new Set(sources.map(sourceHost).filter((h): h is string => h !== null));
  if ([...hosts].some((h) => OFFICIAL_HOST_RE.test(h))) return FactConfidence.Confirmed;
  return hosts.size >= 2 ? FactConfidence.Confirmed : FactConfidence.Possible;
}

/** A fact the store can take: a known key, a value, and at least one real source. */
export function usableFact(fact: FoundFact): FoundFact | null {
  const key = fact.key.trim().toLowerCase();
  const value = fact.value.trim().slice(0, MAX_FACT_CHARS);
  const sources = fact.sources.filter((url) => sourceHost(url) !== null);
  if (!RESEARCH_FACT_KEYS.has(key) || value === '' || sources.length === 0) return null;
  const date = fact.date !== null && DATE_RE.test(fact.date) ? fact.date : null;
  return { key, value, sources, date };
}

function strength(fact: FoundFact): number {
  return (
    (confidenceOf(fact.sources) === FactConfidence.Confirmed ? 1_000 : 0) + fact.sources.length
  );
}

/**
 * The facts as they will be stored. A one-value key keeps its strongest value;
 * the others are not dropped silently — the kept fact says what else was found
 * and where (D757 §3: conflicting sources are both kept and explained).
 */
export function factsToStore(found: readonly FoundFact[]): StoredFact[] {
  const usable = found.map(usableFact).filter((f): f is FoundFact => f !== null);
  const out: StoredFact[] = [];
  const byOneValueKey = new Map<string, FoundFact[]>();
  for (const fact of usable) {
    if (ONE_VALUE_KEYS.has(fact.key)) {
      byOneValueKey.set(fact.key, [...(byOneValueKey.get(fact.key) ?? []), fact]);
    } else {
      out.push(stored(fact, null));
    }
  }
  for (const facts of byOneValueKey.values()) {
    const [best, ...others] = [...facts].sort((a, b) => strength(b) - strength(a));
    const differing = others.filter((o) => o.value.toLowerCase() !== best.value.toLowerCase());
    const note =
      differing.length === 0
        ? null
        : differing.map((o) => `also found: „${o.value}" (${o.sources[0]})`).join('; ');
    out.push(stored(best, note));
  }
  return out;
}

function stored(fact: FoundFact, conflictNote: string | null): StoredFact {
  return {
    key: fact.key,
    value: fact.value,
    sourceUrl: fact.sources[0],
    date: fact.date,
    confidence: confidenceOf(fact.sources),
    conflictNote,
  };
}
