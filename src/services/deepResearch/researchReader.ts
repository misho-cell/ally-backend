import type Anthropic from '@anthropic-ai/sdk';
import { MAIN_MODEL, noThinkingFor, oneToolChoice } from '../aiModels';
import { recordClaudeUsage } from '../costLedger.service';
import { RESEARCH_FACT_KEYS } from '../companyBase/researchFactsByNumber.service';
import {
  FoundFact,
  Findings,
  ResearchSubject,
  SamePerson,
  SourceHit,
  SourceVerdict,
} from './deepResearch.types';

/**
 * The brief's „NETAI LLM": reads the pages a step found and decides, page by
 * page, whether it is about this person — the same name at another firm or in
 * another country is someone else — and lists the professional facts each page
 * states. A fact counts only when it names a page we gave it, the page is this
 * person's, and its kind is one the base keeps; everything else is dropped.
 */
export const READER_MODEL = process.env.DEEP_RESEARCH_MODEL?.trim() || MAIN_MODEL;
export const READER_USAGE_KIND = 'deep_research_read';
const READER_TIMEOUT_MS = 90_000;
const READER_MAX_TOKENS = 4_000;
const MAX_FACT_CHARS = 300;
const TOOL_NAME = 'report_findings';
const URL_RE = /^https?:\/\/\S+$/u;
const LINKEDIN_PROFILE_RE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/iu;
const LINKEDIN_PROFILE_BASE = 'https://www.linkedin.com/in/';

enum Certainty {
  Stated = 'stated',
  Inferred = 'inferred',
}

const READER_PROMPT =
  'You check web pages for a professional research file about ONE person. For each page, ' +
  'decide whether it is about this person: yes only when the name AND at least one other ' +
  'detail (organisation, role, city, career) fit; no when it is clearly someone else with ' +
  'the same or a similar name; unsure otherwise. Then list the professional facts the ' +
  'pages that are yes or unsure state about this person, each with the number of the page ' +
  'that states it. Keys: linkedin (the profile address), headline, occupation, employer ' +
  '(current), past_roles (role and organisation, with years if given), education, ' +
  'expertise, certification, language, project, award, publication, public_activity ' +
  '(talks, interviews, conferences), website (their own professional site). Copy names, ' +
  'titles and dates as the page writes them. certainty is stated when the page says it ' +
  'outright, inferred otherwise. Never report family, relationships, health, religion, ' +
  'politics, ethnicity, an address, a phone number, an email, money or salary, photos, or ' +
  'anything about anyone else. Report nothing you are not given; guess nothing.';

const READER_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Report the verdict on each page and the facts found.',
  input_schema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            same_person: { type: 'string', enum: Object.values(SamePerson) },
          },
          required: ['page', 'same_person'],
        },
      },
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
            page: { type: 'integer' },
            certainty: { type: 'string', enum: Object.values(Certainty) },
          },
          required: ['key', 'value', 'page', 'certainty'],
        },
      },
    },
    required: ['pages', 'facts'],
  },
};

/** Pure: the person and the pages as the model reads them. */
export function readerInput(subject: ResearchSubject, pages: readonly SourceHit[]): string {
  const who = [
    `Name: ${subject.names.join(' / ')}`,
    subject.companies.length > 0 ? `Organisations: ${subject.companies.join('; ')}` : '',
    subject.role !== '' ? `Role: ${subject.role}` : '',
    subject.city !== '' ? `City: ${subject.city}` : '',
  ].filter((line) => line !== '');
  const listed = pages.map(
    (p, i) => `[${i + 1}] ${p.url}\nTitle: ${p.title}\n${p.text.replace(/\s+/gu, ' ')}`,
  );
  return `${who.join('\n')}\n\nPages:\n\n${listed.join('\n\n')}`;
}

function field(row: unknown, name: string): unknown {
  return typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[name] : null;
}

/**
 * The 19 Nov test: a person the base knew by name alone was matched, sure, to
 * a namesake at another firm. With nothing but a name to compare, no page can
 * be sure: a yes becomes unsure, and its facts possible.
 */
export function nameOnly(subject: ResearchSubject): boolean {
  return subject.companies.length === 0 && subject.role === '' && subject.city === '';
}

function verdictsFrom(raw: unknown, pages: readonly SourceHit[], capped: boolean): SourceVerdict[] {
  const allowed = new Set<string>(Object.values(SamePerson));
  const verdicts: SourceVerdict[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const page = pages[Number(field(row, 'page')) - 1];
    const same = field(row, 'same_person');
    if (page === undefined || typeof same !== 'string' || !allowed.has(same)) continue;
    const samePerson = capped && same === SamePerson.Yes ? SamePerson.Unsure : (same as SamePerson);
    verdicts.push({ url: page.url, samePerson });
  }
  return verdicts;
}

/** A LinkedIn profile address in one form, so the same profile is one fact; '' when it is not one. */
export function linkedinProfile(url: string): string {
  const slug = LINKEDIN_PROFILE_RE.exec(url.trim())?.[2];
  if (slug === undefined) return '';
  let readable = slug;
  try {
    readable = decodeURIComponent(slug);
  } catch {
    // A malformed escape stays as written: the address is still the profile's.
  }
  return `${LINKEDIN_PROFILE_BASE}${readable.toLowerCase()}`;
}

const NAME_TOKEN_SPLIT_RE = /[\s.\-'’]+/u;
const LATIN_TOKEN_RE = /^[a-z]+$/u;
const MIN_NAME_TOKEN_CHARS = 3;

/** The person's name as the words a profile address can carry: Latin, lower case, three letters or more. */
function nameTokens(subject: ResearchSubject): string[] {
  return subject.names
    .flatMap((name) => name.toLowerCase().split(NAME_TOKEN_SPLIT_RE))
    .filter((t) => t.length >= MIN_NAME_TOKEN_CHARS && LATIN_TOKEN_RE.test(t));
}

/**
 * A LinkedIn profile page judged to be about the person is their own profile —
 * the linkedin fact, whether the model listed it or not — only when its
 * address carries their name. The 21-person test (19 Nov): colleagues'
 * profiles that mention the person were judged theirs and became 9 wrong
 * linkedin facts.
 */
function profileFacts(verdicts: readonly SourceVerdict[], subject: ResearchSubject): FoundFact[] {
  const tokens = nameTokens(subject);
  return verdicts.flatMap((v) => {
    const value = linkedinProfile(v.url);
    if (value === '' || v.samePerson === SamePerson.No) return [];
    const slug = value.slice(LINKEDIN_PROFILE_BASE.length);
    if (!tokens.some((t) => slug.includes(t))) return [];
    const status = v.samePerson === SamePerson.Yes ? 'confirmed' : 'possible';
    return [{ key: 'linkedin', value, source_url: v.url, status }];
  });
}

/** A fact's value in the form its key needs, or '' when it does not fit. */
function valueFor(key: string, raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim().slice(0, MAX_FACT_CHARS);
  if (key === 'linkedin') return linkedinProfile(value);
  if (key === 'website') return URL_RE.test(value) ? value : '';
  return value;
}

function factsFrom(
  raw: unknown,
  pages: readonly SourceHit[],
  verdicts: readonly SourceVerdict[],
): FoundFact[] {
  const verdictOf = new Map(verdicts.map((v) => [v.url, v.samePerson]));
  const facts: FoundFact[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const key = field(row, 'key');
    const page = pages[Number(field(row, 'page')) - 1];
    if (typeof key !== 'string' || !RESEARCH_FACT_KEYS.has(key) || page === undefined) continue;
    const same = verdictOf.get(page.url);
    if (same === undefined || same === SamePerson.No) continue;
    const value = valueFor(key, field(row, 'value'));
    if (value === '') continue;
    const stated = field(row, 'certainty') === Certainty.Stated;
    const status = same === SamePerson.Yes && stated ? 'confirmed' : 'possible';
    facts.push({ key, value, source_url: page.url, status });
  }
  return facts;
}

/** Pure: the model's answer, checked against the pages it was given and how much the base knew. */
export function findingsFrom(
  input: unknown,
  pages: readonly SourceHit[],
  subject: ResearchSubject,
): Findings {
  const verdicts = verdictsFrom(field(input, 'pages'), pages, nameOnly(subject));
  const facts = [
    ...profileFacts(verdicts, subject),
    ...factsFrom(field(input, 'facts'), pages, verdicts),
  ];
  return { verdicts, facts };
}

function toolInput(content: readonly Anthropic.ContentBlock[]): unknown {
  const call = content.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME);
  return call?.type === 'tool_use' ? call.input : null;
}

/** Reads one step's pages. Throws when the model cannot be reached; the caller decides. */
export async function readPages(
  subject: ResearchSubject,
  pages: readonly SourceHit[],
  runId: string,
): Promise<Findings> {
  if (pages.length === 0) return { verdicts: [], facts: [] };
  const { default: anthropic } = await import('../../config/anthropic');
  const response = await anthropic.messages.create(
    {
      model: READER_MODEL,
      ...noThinkingFor(READER_MODEL),
      max_tokens: READER_MAX_TOKENS,
      system: READER_PROMPT,
      tools: [READER_TOOL],
      tool_choice: oneToolChoice(READER_MODEL, TOOL_NAME),
      messages: [{ role: 'user', content: readerInput(subject, pages) }],
    },
    { timeout: READER_TIMEOUT_MS },
  );
  await recordClaudeUsage({
    userId: null,
    kind: READER_USAGE_KIND,
    model: READER_MODEL,
    usage: response.usage,
    runId,
  });
  return findingsFrom(toolInput(response.content), pages, subject);
}
