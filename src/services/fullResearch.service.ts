import { query } from '../db/postgres/client';
import { FarDepth, farMembersHolding } from './farCircles.service';
import { phoneDigits } from './phone';
import { goalReachesANamedPerson } from './openingSearch.service';
import { OwnContactInField, ownContactsInField } from './ownContactsInField';
import { peopleListed, personLine, personRowsIn } from './researchPeopleList';
import { webCounts, webLevel } from './researchWeb';
import { findCompaniesForNeed } from './tools/findCompaniesForNeed';
import { findPeopleInBase } from './tools/findPeopleInBase';
import { searchByInsight } from './tools/searchByInsight';
import { searchByTag } from './tools/searchByTag';
import { searchMeanings } from './tools/searchMeanings';
import { searchNeeds } from './tools/searchNeeds';
import { relatedTrades } from './tools/relatedTrades';
import { searchSecondDegree } from './tools/searchSecondDegree';
import { WordMeanings } from './tools/transliterate';
import { withoutWithheldPeople } from './withoutWithheldPeople';

/**
 * Misho, 13 Nov: „a request gets a quick first answer that says it is quick —
 * wait for the full research, or write to these people meanwhile — and the full
 * research of all five levels goes on in the background whatever the first
 * answer said, and its results come back later: two answers." And: „in the
 * background answer, look into the first and second levels deeper than the
 * first answer does", „a person from the first answer may come again: say it
 * was in the previous answer, and whether they were written to".
 *
 * This runs every level once the opening search has its words, keeps the
 * findings for the conversation, and hands them to the next run there — the
 * first run itself when they land while it is still working (one answer, not
 * two), an owner message written meanwhile, or the wake that brings the second
 * answer. Whoever takes them, takes them once.
 */

/** Findings nobody took within this time are dropped: a later run would read them as news. */
export const RESEARCH_KEPT_MS = 30 * 60 * 1000;
/** Each level's own result as the model reads it, at most this long; its people are listed in full. */
const LEVEL_CHARS = 2_000;
/** The web level's own result as the model reads it: the companies and their pages. */
const WEB_LEVEL_CHARS = 16_000;
/** People listed per level, the narrowest search word's first. */
const LISTED_PER_LEVEL = 40;
/** The request's words searched one by one, at most this many. */
const MAX_SINGLE_WORDS = 4;
/** A shorter word („და", „in") says nothing on its own. */
const MIN_SINGLE_WORD_LETTERS = 3;
/** A search finding at least this share of the level's largest count has filled it… */
const SATURATED_SHARE = 0.9;
/** …and a level's searches that all found fewer than this filled nothing. */
const SATURATED_MIN_PEOPLE = 40;
const PREVIOUS_REPLIES_READ = 10;
const READ_TIMEOUT_MS = 5_000;
const MIN_NAME_CHARS = 3;

export enum ResearchLevel {
  Own = 'own contacts — saved under the words or words of the same meaning',
  OwnSaved = 'own contacts — what the assistant has saved about them',
  Second = 'second circle — the contacts of the owner’s contacts',
  Further = 'levels 3-5 — further out, through Netai members',
  Needs = 'people LOOKING for this (their need matches), at every level',
  Companies = 'the company base — companies doing this, with the owner’s people there',
  BasePeople = 'the people base — people known to do this, with who knows them',
  Web = 'the web — the companies that do this, and the owner’s people at each',
}

/** The request names a person: their name does not go to the web (row 253). */
const NAMED_PERSON_STAYS_HOME = {
  skipped: 'the request names a person, and a name is not the web’s to read',
};

/** The web level, or nothing sent out when the request names a person. */
function webSearchFor(request: ResearchRequest, words: ResearchWords): () => Promise<object> {
  return async () =>
    goalReachesANamedPerson(request.ownerLine)
      ? NAMED_PERSON_STAYS_HOME
      : webLevel({
          userId: request.userId,
          threadId: request.threadId,
          words: request.words,
          ownerLine: request.ownerLine,
          meanings: words.meanings,
          related: words.related,
        });
}

/** One of the request's words, searched alone. */
export interface WordFindings {
  readonly word: string;
  /** The search's own result; null when it did not finish. */
  readonly result: object | null;
}

export interface LevelFindings {
  readonly level: ResearchLevel;
  /** The search's own result; null when it did not finish. */
  readonly result: object | null;
  /** The network levels: each word alone, so a common word cannot crowd out a rare one. */
  readonly byWord?: readonly WordFindings[];
}

export interface ResearchRequest {
  readonly userId: string;
  readonly threadId: number;
  readonly taskId: number;
  /** The searched words, as the opening search distilled them. */
  readonly words: string;
  /** The owner's own line, which ranks the second circle by its need. */
  readonly ownerLine: string;
  /** The people the owner ruled out for this, as digits. */
  readonly withheld: ReadonlySet<string>;
  /** When the owner asked: every answer given since then counts as a previous one. */
  readonly askedAt: Date;
}

interface KeptResearch {
  readonly findings: readonly LevelFindings[];
  readonly related: readonly string[];
  /** The searched words, which pick the label a contact's reason shows. */
  readonly words: string;
  readonly askedAt: Date;
  readonly landedAt: number;
  readonly taskId: number;
}

const kept = new Map<number, KeptResearch>();

/** Forget everything kept — for tests. */
export function forgetResearch(): void {
  kept.clear();
}

/** The words with their other meanings, as one line the base searches read (they want synonyms). */
export function baseSearchWords(words: string, meanings: WordMeanings): string {
  return [words, ...[...meanings.values()].flat()].join(' ');
}

/**
 * Misho, 17 Nov: „let the second answer take up to 30 minutes". The research
 * as a whole stops at this; a level still running then is said not to have
 * finished, and the answer is written from the rest.
 */
export const RESEARCH_BUDGET_MS = 30 * 60 * 1000;

/** The work, or a failure when the research's deadline comes first. */
export function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new Error('the research ran out of time'));
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('the research ran out of time')), left);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function settled(
  level: ResearchLevel,
  work: Promise<object>,
  deadline: number = Number.POSITIVE_INFINITY,
): Promise<LevelFindings> {
  try {
    return {
      level,
      result: await (Number.isFinite(deadline) ? beforeDeadline(work, deadline) : work),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[full-research] ${level} did not finish:`, (err as Error).message);
    return { level, result: null };
  }
}

interface LevelSearch {
  readonly level: ResearchLevel;
  readonly search: (words: string) => Promise<object>;
  /** Also searched word by word: the levels that walk the owner's network. */
  readonly byWord: boolean;
}

/**
 * Each level's search, not yet started: they run ONE AFTER ANOTHER. Measured on
 * live, 13 Nov: searches run side by side slowed one another to ~20 s and timed
 * out a name search, so the background never competes with the quick answer.
 */
function levelSearches(request: ResearchRequest, words: ResearchWords): readonly LevelSearch[] {
  const { userId, ownerLine } = request;
  const { meanings } = words;
  // The bases are asked for the related trades too: a print shop makes branded thermoses.
  const baseWords = baseSearchWords([request.words, ...words.related].join(' '), meanings);
  const further = async (words: string): Promise<object> => ({
    further_out: await farMembersHolding(
      Number(userId),
      words,
      undefined,
      meanings,
      FarDepth.Everything,
    ),
  });
  return [
    { level: ResearchLevel.Own, search: (w) => searchByTag(userId, w, meanings), byWord: true },
    { level: ResearchLevel.OwnSaved, search: (w) => searchByInsight(userId, w), byWord: false },
    {
      level: ResearchLevel.Second,
      search: (w) => searchSecondDegree(userId, w, ownerLine, meanings),
      byWord: true,
    },
    { level: ResearchLevel.Further, search: further, byWord: true },
    { level: ResearchLevel.Needs, search: (w) => searchNeeds(userId, w, meanings), byWord: false },
    {
      level: ResearchLevel.Companies,
      search: () => findCompaniesForNeed(userId, baseWords),
      byWord: false,
    },
    {
      level: ResearchLevel.BasePeople,
      search: () => findPeopleInBase(userId, baseWords),
      byWord: false,
    },
    { level: ResearchLevel.Web, search: webSearchFor(request, words), byWord: false },
  ];
}

/**
 * Misho, 16 Nov (Lika's „product photographer in Tbilisi"): the second circle
 * ranks by how many of the words a person matches, every word alike, so
 * „product" + „Tbilisi" outranked a photographer and fifty places filled before
 * the photographers came. Each word is also searched alone; which word is the
 * narrow one is read from what each finds, not from a list of words.
 */
export function singleWords(words: string): string[] {
  const distinct = [...new Set(words.split(/\s+/u).filter((w) => w !== ''))];
  if (distinct.length < 2) return [];
  return distinct
    .filter((word) => [...word].length >= MIN_SINGLE_WORD_LETTERS)
    .slice(0, MAX_SINGLE_WORDS);
}

async function searchLevel(
  spec: LevelSearch,
  words: string,
  singles: readonly string[],
  deadline: number,
): Promise<LevelFindings> {
  const whole = await settled(spec.level, spec.search(words), deadline);
  if (!spec.byWord || singles.length === 0) return whole;
  const byWord: WordFindings[] = [];
  for (const word of singles) {
    const found = await settled(spec.level, spec.search(word), deadline);
    byWord.push({ word, result: found.result });
  }
  return { ...whole, byWord };
}

function withoutWithheld(found: LevelFindings, withheld: ReadonlySet<string>): LevelFindings {
  const clean = (result: object | null): object | null =>
    result === null ? null : withoutWithheldPeople(result, withheld);
  return {
    ...found,
    result: clean(found.result),
    ...(found.byWord === undefined
      ? {}
      : { byWord: found.byWord.map((w) => ({ ...w, result: clean(w.result) })) }),
  };
}

/** Every level, one after another; a level that fails is said to have failed, never dropped. */
export interface Research {
  readonly findings: readonly LevelFindings[];
  /** The trades who could deliver this, searched as fully as the request's own words. */
  readonly related: readonly string[];
}

/** What the research searches: the request's words one by one, then each related trade. */
interface ResearchWords {
  readonly meanings: WordMeanings;
  readonly singles: readonly string[];
  readonly related: readonly string[];
}

/**
 * Misho, 16 Nov: „if related words are searched, the search on them must be
 * enough too". A related trade gets its own meanings in the three languages,
 * its own search at every network level, the bases and the web.
 */
async function researchWordsFor(request: ResearchRequest): Promise<ResearchWords> {
  const [meanings, related] = await Promise.all([
    searchMeanings(request.userId, request.words),
    goalReachesANamedPerson(request.ownerLine)
      ? Promise.resolve([])
      : relatedTrades(request.userId, request.ownerLine, request.words),
  ]);
  const relatedMeanings =
    related.length === 0 ? new Map() : await searchMeanings(request.userId, related.join(' '));
  return {
    meanings: new Map([...meanings, ...relatedMeanings]),
    singles: [...new Set([...singleWords(request.words), ...related])],
    related,
  };
}

export async function researchEveryLevel(
  request: ResearchRequest,
  now: number = Date.now(),
): Promise<Research> {
  const deadline = now + RESEARCH_BUDGET_MS;
  const words = await researchWordsFor(request);
  const findings: LevelFindings[] = [];
  for (const spec of levelSearches(request, words)) {
    findings.push(await searchLevel(spec, request.words, words.singles, deadline));
  }
  return {
    findings: findings.map((found) => withoutWithheld(found, request.withheld)),
    related: words.related,
  };
}

/** Every result a level holds: the whole request's, then each word's. */
function resultsOf(found: LevelFindings): object[] {
  return [found.result, ...(found.byWord ?? []).map((w) => w.result)].filter(
    (result): result is object => result !== null,
  );
}

interface CountedResult {
  readonly result: object;
  readonly count: number;
}

function counted(result: object | null): CountedResult | null {
  if (result === null) return null;
  const count = personRowsIn(result).length;
  return count === 0 ? null : { result, count };
}

/**
 * Misho, 16 Nov: a search that filled the level on its own — „Tbilisi" 50 of
 * 50, „for the team" 59 — says nothing about the request, and its people
 * pushed the photographers out. Such a search is left out whenever another
 * found fewer: which search is saturated is read from the counts themselves.
 */
export function withoutSaturated(searches: readonly CountedResult[]): CountedResult[] {
  const most = Math.max(0, ...searches.map((s) => s.count));
  if (most < SATURATED_MIN_PEOPLE) return [...searches];
  const saturated = (s: CountedResult): boolean => s.count >= most * SATURATED_SHARE;
  const narrower = searches.filter((s) => !saturated(s));
  return narrower.length === 0 ? [...searches] : narrower;
}

/** The narrowest word's people first — the word that found fewest — then the whole request's. */
export function narrowestFirst(found: LevelFindings): object[] {
  const words = (found.byWord ?? [])
    .map((w) => counted(w.result))
    .filter((w): w is CountedResult => w !== null)
    .sort((a, b) => a.count - b.count);
  const whole = counted(found.result);
  const all = whole === null ? words : [...words, whole];
  return withoutSaturated(all).map((s) => s.result);
}

/** One line per level: how many people the request found, and each word alone. */
/** Each level's name in the log line (ops, 16 Nov: two levels both read „own contacts"). */
const LEVEL_LOG_NAME: Readonly<Record<ResearchLevel, string>> = {
  [ResearchLevel.Own]: 'own contacts',
  [ResearchLevel.OwnSaved]: 'own saved notes',
  [ResearchLevel.Second]: 'second circle',
  [ResearchLevel.Further]: 'levels 3-5',
  [ResearchLevel.Needs]: 'needs',
  [ResearchLevel.Companies]: 'company base',
  [ResearchLevel.BasePeople]: 'people base',
  [ResearchLevel.Web]: 'web companies',
};

const countOf = (result: object | null): string | number =>
  result === null ? 'did not finish' : personRowsIn(result).length;

/**
 * One line per research: each level's people for the whole request, and each
 * word's alone. Ops, 16 Nov: „levels 3-5: 0" beside words that found 7-10 read
 * as people lost — they are not, the words' people are listed — so the line
 * says which number is which, and how many reach the model.
 */
export function researchCounts(findings: readonly LevelFindings[]): string {
  return findings
    .map((found) => {
      const name = LEVEL_LOG_NAME[found.level];
      const listed = peopleListed(narrowestFirst(found), LISTED_PER_LEVEL).length;
      if (found.level === ResearchLevel.Web && found.result !== null) {
        return `${name}: people ${countOf(found.result)}, ${webCounts(found.result)}`;
      }
      if (found.byWord === undefined) return `${name}: ${countOf(found.result)}`;
      const words = found.byWord.map((w) => `${w.word} ${countOf(w.result)}`).join(', ');
      return `${name}: whole ${countOf(found.result)}, by word ${words}, listed ${listed}`;
    })
    .join(' | ');
}

/** Runs every level and keeps the findings for the conversation. Never throws. */
export async function runFullResearch(
  request: ResearchRequest,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    const { findings, related } = await researchEveryLevel(request);
    // eslint-disable-next-line no-console
    console.info(
      `[full-research] thread ${request.threadId}: related ${related.length} | ${researchCounts(findings)}`,
    );
    kept.set(request.threadId, {
      findings,
      related,
      words: request.words,
      askedAt: request.askedAt,
      landedAt: now(),
      taskId: request.taskId,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[full-research] failed:', (err as Error).message);
    return false;
  }
}

/** Whether findings wait for this conversation, still fresh. */
export function researchWaiting(threadId: number, now: number = Date.now()): boolean {
  const waiting = kept.get(threadId);
  if (waiting === undefined) return false;
  if (now - waiting.landedAt > RESEARCH_KEPT_MS) {
    kept.delete(threadId);
    return false;
  }
  return true;
}

/** A person a finding names: their phone id and the name shown, if any. */
export interface NamedPerson {
  readonly phone: string;
  readonly name: string | null;
}

/** Everyone the findings name, once each, from any depth of any result. */
export function peopleNamedIn(findings: readonly LevelFindings[]): NamedPerson[] {
  const byPhone = new Map<string, NamedPerson>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    if (typeof row.phone === 'string' && phoneDigits(row.phone) !== '') {
      const digits = phoneDigits(row.phone);
      const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : null;
      if (!byPhone.has(digits) || byPhone.get(digits)?.name === null) {
        byPhone.set(digits, { phone: row.phone, name });
      }
    }
    Object.values(row).forEach(visit);
  };
  findings.forEach((found) => resultsOf(found).forEach(visit));
  return [...byPhone.values()];
}

/** How the owner has already reached a person on this goal. */
export enum Contacted {
  AskedDirectly = 'asked directly',
  IntroductionRequested = 'an introduction was requested',
  No = 'not written to',
}

/** Who on this goal was asked directly, and who an introduction was requested to, as digits. */
async function contactedOnGoal(
  userId: string,
  threadId: number,
  taskId: number,
): Promise<{ asked: Set<string>; introduced: Set<string> }> {
  const result = await query<{ phone: string; how: string }>(
    `SELECT up.phone, 'asked' AS how
       FROM task_asks ta JOIN "UserPhone" up ON up."userId" = ta.to_user_id
      WHERE ta.task_id = $3
     UNION
     SELECT COALESCE(r.target_phone, tp.phone), 'introduced'
       FROM introduction_requests r
       LEFT JOIN "UserPhone" tp ON tp."userId" = r.target_user_id
      WHERE r.requester_user_id::text = $1
        AND (r.requester_task_id = $3 OR r.origin_thread_id = $2 OR r.requester_thread_id = $2)
     LIMIT 500`,
    [userId, threadId, taskId],
    READ_TIMEOUT_MS,
  );
  const asked = new Set<string>();
  const introduced = new Set<string>();
  for (const row of result.rows) {
    if (typeof row.phone !== 'string') continue;
    (row.how === 'asked' ? asked : introduced).add(phoneDigits(row.phone));
  }
  return { asked, introduced };
}

/** The assistant's replies in this conversation since the owner asked, lower-cased. */
async function repliesSince(threadId: number, since: Date): Promise<string> {
  const result = await query<{ content: string | null }>(
    `SELECT content FROM conversations
      WHERE thread_id = $1 AND role = 'assistant' AND created_at >= $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [threadId, since, PREVIOUS_REPLIES_READ],
    READ_TIMEOUT_MS,
  );
  return result.rows
    .map((row) => row.content ?? '')
    .join('\n')
    .toLocaleLowerCase();
}

export interface MarkedPerson extends NamedPerson {
  readonly inPreviousAnswer: boolean;
  readonly contacted: Contacted;
}

/** Each named person, marked: in an answer already given, and how they were written to. */
export function markPeople(
  people: readonly NamedPerson[],
  replies: string,
  contacted: { readonly asked: ReadonlySet<string>; readonly introduced: ReadonlySet<string> },
): MarkedPerson[] {
  return people.map((person) => {
    const digits = phoneDigits(person.phone);
    const name = person.name?.toLocaleLowerCase() ?? '';
    return {
      ...person,
      inPreviousAnswer: [...name].length >= MIN_NAME_CHARS && replies.includes(name),
      contacted: contacted.asked.has(digits)
        ? Contacted.AskedDirectly
        : contacted.introduced.has(digits)
          ? Contacted.IntroductionRequested
          : Contacted.No,
    };
  });
}

export const FULL_RESEARCH_HEADER =
  'FULL RESEARCH FINISHED — every level of the owner’s network, searched deeper than a quick ' +
  'answer: their own contacts (with words of the same meaning, and what you have saved about ' +
  'them), the second circle, levels 3-5 through members, people looking for this, and the ' +
  'company and people bases, and the web: the companies that do this, what each one’s page says, ' +
  'and the owner’s people at each. Answer from it now. If the owner already had a quick answer ' +
  'in this conversation, this is the second, full answer.\n' +
  '- THE WEB: name every company that fits (Misho, 26 Nov: no public links, numbers or emails ' +
  'unless the owner asked for them). Whether it does this is read from ' +
  'its_page: its own page was opened and the request’s words looked for on it (mentions, with ' +
  'an excerpt) — say „its page says …" only from that; with no its_page, say only what the ' +
  'result’s text says. The way in to a company, closest first: (1) a head the web names ' +
  '(heads_on_the_web) who is the owner’s own contact; (2) such a head saved in a contact’s ' +
  'phone (through_your_contacts: „<your_contact> has him saved as „…""); (3) someone a contact ' +
  'holds whom other people’s phones tie to the company (people_your_contacts_hold_there: say ' +
  'whose phone has them and as what, and that others’ phones tie them to the company — never ' +
  'quote those others’ labels); (4) the owner’s own contact there; (5) people saved under the ' +
  'company’s name further out.\n' +
  'WHAT TO GIVE (Misho, 16 Nov: the owner must see exactly how to reach the result; the tester, ' +
  '17 Nov: „it should press on the people I know"):\n' +
  '- The network comes first. An option with a real path through people the owner knows comes ' +
  'before any company with no one to reach it through; companies with no way in go last, one ' +
  'short line each, by name only — never a public number, email or link, and never „contact ' +
  'them yourself": the way in is through the owner’s people.\n' +
  '- Name the person to reach yourself — never only ask a contact whom they would recommend ' +
  'when the findings name someone who does this.\n' +
  '- Each level’s PEOPLE FOUND list holds everyone it found, the narrowest search first. ' +
  'Read it whole and name every person who fits, not only the few the quick answer had.\n' +
  '- NEVER REPEAT THE PREVIOUS ANSWER (the tester, 17 Nov: „it says the same again, at length"). ' +
  'Start with what is new or better. Someone the previous answer already gave gets at most one ' +
  'short line — that they were in it, and whether they have been written to (marks below) — ' +
  'unless this research learned something new about them.\n' +
  '- When nothing new or better was found, say that in one short line and nothing more.\n' +
  '- This is everything: never say more results are coming.\n' +
  'HOW TO WRITE IT — about the result, so the owner knows what to do next:\n' +
  '1. Open with one or two sentences: the best way to the result, and what you advise doing first.\n' +
  '2. Then the options, numbered, best first: one that surely does this, with the shortest real ' +
  'path, comes first. For each option say:\n' +
  '   a) who or what it is — a person, or a company and who there;\n' +
  '   b) why you chose them — ALWAYS, for every person you name, even in a one-line mention ' +
  '(Misho, 24 Nov: „the answer is very good; the one thing missing is why these people were ' +
  'sent"). One short sentence with the real tie the findings show: the company they work at or ' +
  'are tied to and how („works at X", „heads X, its page names him"), the label someone saved ' +
  'them under and whose phone it is in, a note saved about them, or what a website says. ' +
  'Say the tie itself, never only „they fit" or „they are related to this". A person whose tie ' +
  'you cannot say from the findings is not named;\n' +
  '   c) how the owner reaches them, step by step, with real names: start from the owner’s own ' +
  'contact and name every person on the way, saying what each step is — e.g. „Iro is your ' +
  'contact; Iro has Omiko Khoperia saved; Omiko has her saved as „Nino Colibri"". Never say ' +
  '„second circle", „level 3" or „ring" — say who knows whom;\n' +
  '   d) what to do now: call them directly when they are the owner’s own contact, let you ' +
  'ask that person’s assistant (only Netai members have one; for someone who is not, say plainly ' +
  'that they do not use Netai, so you cannot write to them, and who could introduce the owner), ' +
  'or ask someone to introduce them.\n' +
  '3. A label from someone’s phone is shown as what it is: „<whose> phone has them saved as ' +
  '„…"". Never present a label as a name or a job unless it says one.\n' +
  '   The owner’s own contact is named EXACTLY as the owner saved them — the whole saved name, ' +
  'every word of it, never only its first word (the tester, 16 Nov: „who is Dima? I have nobody ' +
  'by that name" — she had him saved under two words).\n' +
  '4. Where two sources disagree (two different directors), say so in one line.\n' +
  '4a. Someone who only SHARES A NAME with a person the search named (a director in a ' +
  'register, a name on a page) is not a way in: leave them out, unless something else ties ' +
  'them — the company in a label saved for them, or the same number.\n' +
  '5. SHORT (Misho, 26 Nov: „as short, concrete and informative as it can be"): plain words, ' +
  'at most two sentences for an option; no explanation of how you searched, no repeats, ' +
  'nothing the owner cannot act on. No internal word (signal, ring, level, base).\n' +
  '6. End with THE NEXT STEP as its own last paragraph, one or two short sentences (Misho, ' +
  '26 Nov: the owner must know exactly how to go on): what you will do yourself and what the ' +
  'owner has to do — e.g. „I write to Iro’s assistant now; you only answer yes."\n' +
  'Every search note inside the findings still applies (what may be said, how to name people).';

function markLine(person: MarkedPerson): string {
  return (
    `- ${person.name ?? 'unnamed'} (phone id ${person.phone}): ` +
    `in the previous answer: ${person.inPreviousAnswer ? 'yes' : 'no'}; ${person.contacted}`
  );
}

function peopleFoundLines(found: LevelFindings): string {
  const listed = peopleListed(narrowestFirst(found), LISTED_PER_LEVEL);
  if (listed.length === 0) return '\nPEOPLE FOUND: none.';
  return `\nPEOPLE FOUND (${listed.length}):\n${listed.map(personLine).join('\n')}`;
}

function levelSection(found: LevelFindings): string {
  const head = `\n\n${found.level.toUpperCase()}:`;
  if (resultsOf(found).length === 0) return `${head} did not finish.`;
  const people = peopleFoundLines(found);
  if (found.result === null) return `${head}${people}\nThe whole request’s search did not finish.`;
  const text = JSON.stringify(found.result);
  // The web level's companies and what each page says are its answer, not notes beside a list.
  const limit = found.level === ResearchLevel.Web ? WEB_LEVEL_CHARS : LEVEL_CHARS;
  const clipped = text.length > limit ? `${text.slice(0, limit)}…` : text;
  return `${head}${people}\nTHE SEARCH’S OWN RESULT (its notes apply):\n${clipped}`;
}

/** The findings as the model reads them: what to do, who is marked how, then each level. */
export function researchSection(
  findings: readonly LevelFindings[],
  marked: readonly MarkedPerson[],
  related: readonly string[] = [],
): string {
  const touched = marked.filter((p) => p.inPreviousAnswer || p.contacted !== Contacted.No);
  const marks =
    touched.length === 0
      ? '\n\nNobody found here was in a previous answer or has been written to on this goal.'
      : `\n\nALREADY IN THIS CONVERSATION:\n${touched.map(markLine).join('\n')}`;
  const trades =
    related.length === 0
      ? ''
      : `\n\nRELATED TRADES, searched as fully as the request’s own words: ${related.join(', ')}. ` +
        'Someone found only through one fits if that trade can deliver this: say which, and how ' +
        '(e.g. „a print shop — they print logos on thermoses").';
  return `${FULL_RESEARCH_HEADER}${marks}${trades}${findings.map(levelSection).join('')}`;
}

export interface TakenResearch {
  readonly section: string;
  /** Each level's result, so the run can let its walks and asks reach these people. */
  readonly results: readonly object[];
  /** Everyone named at any depth (the company base's people too), for the same reason. */
  readonly people: readonly NamedPerson[];
  /** The owner's own contacts tied to this, not yet given nor written to, strongest first. */
  readonly ownContacts: readonly OwnContactInField[];
}

/** The own-contact levels: the owner's labels and the owner's own notes. */
const OWN_LEVELS: ReadonlySet<ResearchLevel> = new Set([ResearchLevel.Own, ResearchLevel.OwnSaved]);

/** Misho, 24 Nov: every own contact tied to this, beyond the few the answers give. */
export function ownContactsLeft(
  findings: readonly LevelFindings[],
  words: string,
  replies: string,
  contacted: { readonly asked: ReadonlySet<string>; readonly introduced: ReadonlySet<string> },
): OwnContactInField[] {
  const results = findings.filter((f) => OWN_LEVELS.has(f.level)).flatMap(resultsOf);
  return ownContactsInField(results, words, (phone, name) => {
    const digits = phoneDigits(phone);
    const lower = name.toLocaleLowerCase();
    const given = [...lower].length >= MIN_NAME_CHARS && replies.includes(lower);
    return !given && !contacted.asked.has(digits) && !contacted.introduced.has(digits);
  });
}

/** The findings for this conversation, once, marked as they stand now; null when none wait. */
export async function takeResearch(
  userId: string,
  threadId: number,
  now: number = Date.now(),
): Promise<TakenResearch | null> {
  if (!researchWaiting(threadId, now)) return null;
  const waiting = kept.get(threadId);
  if (waiting === undefined) return null;
  kept.delete(threadId);
  const people = peopleNamedIn(waiting.findings);
  const [replies, contacted] = await Promise.all([
    repliesSince(threadId, waiting.askedAt).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[full-research] replies not read:', (err as Error).message);
      return '';
    }),
    contactedOnGoal(userId, threadId, waiting.taskId).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[full-research] who was written to not read:', (err as Error).message);
      return { asked: new Set<string>(), introduced: new Set<string>() };
    }),
  ]);
  return {
    section: researchSection(
      waiting.findings,
      markPeople(people, replies, contacted),
      waiting.related,
    ),
    results: waiting.findings.flatMap(resultsOf),
    people,
    ownContacts: ownContactsLeft(waiting.findings, waiting.words, replies, contacted),
  };
}
