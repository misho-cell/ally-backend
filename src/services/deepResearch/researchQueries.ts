import {
  FoundFact,
  ProviderName,
  ResearchSubject,
  SamePerson,
  SourceHit,
  SourceVerdict,
} from './deepResearch.types';
import { ExaCategory, LinkupDepth } from './searchProviders';

/**
 * Pure: what each step searches for and which pages it reads. The brief's
 * order — find the right person, read what was found, widen from the new
 * facts, read again — with no fixed list of words.
 */

export enum SearchEngine {
  ExaPeople = 'exa_people',
  ExaWeb = 'exa_web',
  LinkupStandard = 'linkup_standard',
  LinkupDeep = 'linkup_deep',
}

export interface PlannedSearch {
  readonly engine: SearchEngine;
  readonly query: string;
}

export type EngineCall =
  | {
      readonly provider: ProviderName.Exa;
      readonly category: ExaCategory;
      readonly priceKey: string;
    }
  | {
      readonly provider: ProviderName.Linkup;
      readonly depth: LinkupDepth;
      readonly priceKey: string;
    };

export const ENGINE_CALL: Readonly<Record<SearchEngine, EngineCall>> = {
  [SearchEngine.ExaPeople]: {
    provider: ProviderName.Exa,
    category: ExaCategory.People,
    priceKey: 'exa.search',
  },
  [SearchEngine.ExaWeb]: {
    provider: ProviderName.Exa,
    category: ExaCategory.Web,
    priceKey: 'exa.search',
  },
  [SearchEngine.LinkupStandard]: {
    provider: ProviderName.Linkup,
    depth: LinkupDepth.Standard,
    priceKey: 'linkup.standard',
  },
  [SearchEngine.LinkupDeep]: {
    provider: ProviderName.Linkup,
    depth: LinkupDepth.Deep,
    priceKey: 'linkup.deep',
  },
};

/** Pages of these sites are never read in full: they sit behind a login, and their rules forbid it. */
const NOT_READ_HOSTS: readonly string[] = [
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'vk.com',
];
/** Pages read in full per reading step. */
export const PAGES_READ_PER_STEP = 5;
/** New organisations a widening step searches the name with. */
const MAX_WIDEN_ORGS = 2;
const DEFAULT_PLACE = 'Georgia';
const ORG_FACT_KEYS: ReadonlySet<string> = new Set(['employer', 'past_roles']);

function quoted(name: string): string {
  return `"${name.replace(/"/gu, '')}"`;
}

function context(subject: ResearchSubject): string {
  return [subject.companies[0] ?? '', subject.role].filter((part) => part !== '').join(' ');
}

/** The find step: the person's own index entry, the open web in each spelling, and Linkup. */
export function findSearches(subject: ResearchSubject): PlannedSearch[] {
  const [first, second] = subject.names;
  const about = context(subject);
  const place = subject.city || DEFAULT_PLACE;
  const searches: PlannedSearch[] = [
    { engine: SearchEngine.ExaPeople, query: `${first} ${about}`.trim() },
    { engine: SearchEngine.ExaWeb, query: `${quoted(first)} ${about}`.trim() },
    { engine: SearchEngine.LinkupStandard, query: `${first} ${about} ${place}`.trim() },
  ];
  if (second !== undefined) {
    searches.push({ engine: SearchEngine.ExaWeb, query: `${quoted(second)} ${about}`.trim() });
  }
  return searches;
}

function lower(text: string): string {
  return text.trim().toLocaleLowerCase();
}

/** Organisations the found facts name that the base did not already give. */
export function newOrganisations(subject: ResearchSubject, facts: readonly FoundFact[]): string[] {
  const known = new Set(subject.companies.map(lower));
  const orgs = facts
    .filter((f) => ORG_FACT_KEYS.has(f.key) && f.status === 'confirmed')
    .map((f) => f.value.trim())
    .filter((org) => org !== '' && !known.has(lower(org)));
  return [...new Map(orgs.map((org) => [lower(org), org])).values()].slice(0, MAX_WIDEN_ORGS);
}

/** The widen step: the name with each new organisation, and one deep search of the whole trail. */
export function widenSearches(
  subject: ResearchSubject,
  facts: readonly FoundFact[],
): PlannedSearch[] {
  const name = subject.names[0];
  const orgs = newOrganisations(subject, facts);
  const about = [context(subject), ...orgs].filter((part) => part !== '').join(', ');
  return [
    ...orgs.map((org) => ({ engine: SearchEngine.ExaWeb, query: `${quoted(name)} ${org}` })),
    {
      engine: SearchEngine.LinkupDeep,
      query:
        `Professional background of ${name}${about === '' ? '' : ` (${about})`}: career history, ` +
        'education, projects, interviews, talks, publications, awards.',
    },
  ];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function readable(url: string): boolean {
  const host = hostOf(url);
  if (host === '') return false;
  return !NOT_READ_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/**
 * The pages worth reading in full: the person's own (then the unsure ones),
 * not on a login-walled site, not read before.
 */
export function pagesToRead(
  verdicts: readonly SourceVerdict[],
  alreadyRead: ReadonlySet<string>,
): string[] {
  const rank = (v: SourceVerdict): number => (v.samePerson === SamePerson.Yes ? 0 : 1);
  return verdicts
    .filter((v) => v.samePerson !== SamePerson.No && readable(v.url) && !alreadyRead.has(v.url))
    .sort((a, b) => rank(a) - rank(b))
    .map((v) => v.url)
    .filter((url, i, all) => all.indexOf(url) === i)
    .slice(0, PAGES_READ_PER_STEP);
}

/** Pure: the hits not seen before, once each. */
export function unseenHits(hits: readonly SourceHit[], seen: ReadonlySet<string>): SourceHit[] {
  const fresh = new Map<string, SourceHit>();
  for (const h of hits) if (!seen.has(h.url) && !fresh.has(h.url)) fresh.set(h.url, h);
  return [...fresh.values()];
}
