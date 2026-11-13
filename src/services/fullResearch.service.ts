import { query } from '../db/postgres/client';
import { farMembersHolding } from './farCircles.service';
import { phoneDigits } from './phone';
import { findCompaniesForNeed } from './tools/findCompaniesForNeed';
import { findPeopleInBase } from './tools/findPeopleInBase';
import { searchByInsight } from './tools/searchByInsight';
import { searchByTag } from './tools/searchByTag';
import { searchMeanings } from './tools/searchMeanings';
import { searchNeeds } from './tools/searchNeeds';
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
/** Each level's findings as the model reads them, at most this long. */
const LEVEL_CHARS = 4_000;
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
}

export interface LevelFindings {
  readonly level: ResearchLevel;
  /** The search's own result; null when it did not finish. */
  readonly result: object | null;
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

async function settled(level: ResearchLevel, work: Promise<object>): Promise<LevelFindings> {
  try {
    return { level, result: await work };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[full-research] ${level} did not finish:`, (err as Error).message);
    return { level, result: null };
  }
}

/** Every level, at once; a level that fails is said to have failed, never dropped. */
export async function researchEveryLevel(request: ResearchRequest): Promise<LevelFindings[]> {
  const { userId, words, ownerLine } = request;
  const meanings = await searchMeanings(userId, words);
  const baseWords = baseSearchWords(words, meanings);
  const findings = await Promise.all([
    settled(ResearchLevel.Own, searchByTag(userId, words, meanings)),
    settled(ResearchLevel.OwnSaved, searchByInsight(userId, words)),
    settled(ResearchLevel.Second, searchSecondDegree(userId, words, ownerLine, meanings)),
    settled(
      ResearchLevel.Further,
      farMembersHolding(Number(userId), words, undefined, meanings).then((further) => ({
        further_out: further,
      })),
    ),
    settled(ResearchLevel.Needs, searchNeeds(userId, words, meanings)),
    settled(ResearchLevel.Companies, findCompaniesForNeed(userId, baseWords)),
    settled(ResearchLevel.BasePeople, findPeopleInBase(userId, baseWords)),
  ]);
  return findings.map((found) =>
    found.result === null
      ? found
      : { ...found, result: withoutWithheldPeople(found.result, request.withheld) },
  );
}

/** Runs every level and keeps the findings for the conversation. Never throws. */
export async function runFullResearch(
  request: ResearchRequest,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    const findings = await researchEveryLevel(request);
    kept.set(request.threadId, {
      findings,
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
  findings.forEach((found) => visit(found.result));
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
  'company and people bases. Answer from it now. If the owner already had a quick answer in ' +
  'this conversation, this is the second, full answer:\n' +
  '- Best people first, nearest first; anyone who is better than those named before, say so.\n' +
  '- A person from the previous answer may be named again: say they were in the previous ' +
  'answer, and whether they have been written to (marks below).\n' +
  '- When nothing new or better was found, say that in one short line and nothing more.\n' +
  '- This is everything: never say more results are coming.\n' +
  'Every search note inside the findings still applies (what may be said, how to name people).';

function markLine(person: MarkedPerson): string {
  return (
    `- ${person.name ?? 'unnamed'} (phone id ${person.phone}): ` +
    `in the previous answer: ${person.inPreviousAnswer ? 'yes' : 'no'}; ${person.contacted}`
  );
}

function levelSection(found: LevelFindings): string {
  if (found.result === null) return `\n\n${found.level.toUpperCase()}: did not finish.`;
  const text = JSON.stringify(found.result);
  const clipped = text.length > LEVEL_CHARS ? `${text.slice(0, LEVEL_CHARS)}…` : text;
  return `\n\n${found.level.toUpperCase()}:\n${clipped}`;
}

/** The findings as the model reads them: what to do, who is marked how, then each level. */
export function researchSection(
  findings: readonly LevelFindings[],
  marked: readonly MarkedPerson[],
): string {
  const touched = marked.filter((p) => p.inPreviousAnswer || p.contacted !== Contacted.No);
  const marks =
    touched.length === 0
      ? '\n\nNobody found here was in a previous answer or has been written to on this goal.'
      : `\n\nALREADY IN THIS CONVERSATION:\n${touched.map(markLine).join('\n')}`;
  return `${FULL_RESEARCH_HEADER}${marks}${findings.map(levelSection).join('')}`;
}

export interface TakenResearch {
  readonly section: string;
  /** Each level's result, so the run can let its walks and asks reach these people. */
  readonly results: readonly object[];
  /** Everyone named at any depth (the company base's people too), for the same reason. */
  readonly people: readonly NamedPerson[];
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
    section: researchSection(waiting.findings, markPeople(people, replies, contacted)),
    results: waiting.findings.flatMap((found) => (found.result === null ? [] : [found.result])),
    people,
  };
}
