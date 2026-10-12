import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../../config/anthropic';
import { recordClaudeUsage } from '../costLedger.service';
import { ListPerson } from '../listPeople.service';
import { LIST_PEOPLE_BRIEF, listedPeopleIn } from './listedPeople';
import { FoundFact, MAX_PAGE_CHARS, MAX_SNIPPET_CHARS } from './plan';

/**
 * 4126 item 1: what the searches and pages say about the new user, turned into
 * facts — each with the pages that say it.
 *
 * MODEL-FACING (D44): REGISTRATION_EXTRACT_BRIEF needs Misho's yes word for
 * word before the run is switched on.
 */
export const REGISTRATION_EXTRACT_BRIEF =
  'You read web search results and pages about one person who has just joined Netai, and you ' +
  'return what they say about that person’s work. Use only what the given texts say; never guess ' +
  'or add. First decide whether the texts are about this person at all: the name must match, and ' +
  'anything else known about them (city, profile link) must not contradict it. If several people ' +
  'share the name and you cannot tell which is them, set same_person to false and return no facts. ' +
  'Return work facts only — occupation, employer, industry, city, education, affiliation, ' +
  'expertise, other_role, headline — never family, health, religion, politics or private life. ' +
  'For every fact give the URLs of the texts that say it, and the date the text gives for it if ' +
  'there is one (YYYY-MM-DD). Reply with JSON only: {"same_person": true|false, "facts": ' +
  '[{"key": "...", "value": "...", "sources": ["https://..."], "date": "YYYY-MM-DD" | null}]}.';

export const EXTRACT_MODEL = process.env.REGISTRATION_RESEARCH_MODEL?.trim() || 'claude-sonnet-5';
const EXTRACT_MAX_TOKENS = 2_000;
const EXTRACT_BUDGET_MS = 60_000;

export interface PersonGiven {
  readonly name: string;
  readonly city: string | null;
}

export interface ReadText {
  readonly url: string;
  readonly title: string | null;
  readonly text: string;
  readonly isPage: boolean;
}

/** The texts as the extractor reads them, each under its URL. */
export function extractInput(person: PersonGiven, texts: readonly ReadText[]): string {
  const about = `Person: ${person.name}${person.city ? `, city given: ${person.city}` : ''}`;
  const blocks = texts.map((t) => {
    const cap = t.isPage ? MAX_PAGE_CHARS : MAX_SNIPPET_CHARS;
    return `URL: ${t.url}\nTitle: ${t.title ?? ''}\n${t.text.slice(0, cap)}`;
  });
  return `${about}\n\n${blocks.join('\n\n---\n\n')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asFact(value: unknown): FoundFact | null {
  if (!isRecord(value)) return null;
  const { key, value: said, sources, date } = value;
  if (typeof key !== 'string' || typeof said !== 'string' || !Array.isArray(sources)) return null;
  return {
    key,
    value: said,
    sources: sources.filter((s): s is string => typeof s === 'string'),
    date: typeof date === 'string' ? date : null,
  };
}

const JSON_OBJECT_RE = /\{[\s\S]*\}/u;

/** The reply's JSON object, or null when it has none that parses. */
function parsedReply(reply: string): unknown {
  const json = JSON_OBJECT_RE.exec(reply)?.[0];
  if (json === undefined) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function factsIn(parsed: unknown): FoundFact[] {
  if (!isRecord(parsed) || parsed.same_person !== true || !Array.isArray(parsed.facts)) return [];
  return parsed.facts.map(asFact).filter((f): f is FoundFact => f !== null);
}

/** The extractor's facts; none when it was not sure the texts are about this person. */
export function factsFromReply(reply: string): FoundFact[] {
  return factsIn(parsedReply(reply));
}

export interface Extracted {
  readonly facts: FoundFact[];
  /** 4126 item 3: the people a public list names; empty unless asked for. */
  readonly listed: ListPerson[];
}

const NOTHING_EXTRACTED: Extracted = { facts: [], listed: [] };

/** The brief the extractor reads: the live one, plus the list rule only when asked for. */
export function extractBrief(withListedPeople: boolean): string {
  return withListedPeople
    ? `${REGISTRATION_EXTRACT_BRIEF} ${LIST_PEOPLE_BRIEF}`
    : REGISTRATION_EXTRACT_BRIEF;
}

/** One extractor call; an error or an unusable reply gives no facts, never a guess. */
export async function extractFacts(
  userId: number,
  person: PersonGiven,
  texts: readonly ReadText[],
): Promise<FoundFact[]> {
  return (await extractResearch(userId, person, texts, false)).facts;
}

/** One extractor call, with the people a public list names when asked for. */
export async function extractResearch(
  userId: number,
  person: PersonGiven,
  texts: readonly ReadText[],
  withListedPeople: boolean,
  now: Date = new Date(),
): Promise<Extracted> {
  if (texts.length === 0) return NOTHING_EXTRACTED;
  const response = await anthropic.messages.create(
    {
      model: EXTRACT_MODEL,
      max_tokens: EXTRACT_MAX_TOKENS,
      system: extractBrief(withListedPeople),
      messages: [{ role: 'user', content: extractInput(person, texts) }],
    },
    { timeout: EXTRACT_BUDGET_MS, maxRetries: 0 },
  );
  void recordClaudeUsage({
    userId: String(userId),
    kind: 'registration_research',
    model: EXTRACT_MODEL,
    usage: response.usage,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[registration-research] usage not recorded:', (err as Error).message);
  });
  const said = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const parsed = parsedReply(said);
  return {
    facts: factsIn(parsed),
    listed: withListedPeople ? listedPeopleIn(parsed, now.toISOString().slice(0, 10)) : [],
  };
}
