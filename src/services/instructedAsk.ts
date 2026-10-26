import { isDeceasedOrBlockedFor } from './block.service';
import { nameFromLabel } from './readerSavedName';
import { factsAround, questionWithFacts } from './instructedFacts';
import { query } from '../db/postgres/client';
import {
  goalTitleFrom,
  instructionAddressee,
  instructionNamed,
  instructionNames,
  instructionNeed,
  instructionQuestion,
  isMeetingInstruction,
  isInstructionSentence,
} from './goalIntent';
import { contactInstructionIn } from './instructionUnsent';
import { ownerAsksForIntroduction } from './introInstruction';
import { canBeAsked, createAsk } from './taskAsks.service';
import { ownerWantsUnnamed } from './anonymousAsk';
import { createTask, getOpenTaskByThread, grantTaskPermission } from './taskStore.service';
import type { RunMode } from './promptBlocks.service';
import { findContactPhonesByName } from './tools/nameMatch';

/**
 * Case 1 (the tester's 44659 / 44661; Misho's yes, §97 item 1): the owner told
 * Netai to ask ONE of their own contacts, the guard gave the run one more turn,
 * and that turn sent nothing either. The server asks that contact itself — the
 * owner's own question, through createAsk's editor and walls like any ask. The
 * typed instruction naming one person is the consent (D316).
 *
 * Refuses (null) unless every person the line names is exactly one saved
 * contact (3928: „X-ს და Y-ს" asks both): two matches for a name, none, or no
 * instruction at all leave it to the owner.
 */
const NAME_WORDS_TRIED = [2, 1] as const;
const MATCHES_LOOKED_AT = 2;

const LABEL_QUERY_TIMEOUT_MS = 3_000;
/** createAsk keeps 600 characters of a question; the facts stop a sentence before that. */
const INSTRUCTED_QUESTION_MAX_CHARS = 600;

/** What the server's send came to. */
export enum InstructedAskResult {
  Sent = 'sent',
  /** T2509: the person is not on Netai (or never opened it) — the owner is told so. */
  NotOnNetai = 'not_on_netai',
  /** 3268: the owner marked the person deceased or blocked them — nothing is sent, no goal opened. */
  Excluded = 'excluded',
  NotSent = 'not_sent',
}

/** What happened for one person the instruction named. */
export interface PersonOutcome {
  readonly result:
    | InstructedAskResult.Sent
    | InstructedAskResult.NotOnNetai
    | InstructedAskResult.Excluded;
  readonly toName: string;
}

export type InstructedAskOutcome =
  | (PersonOutcome & {
      /** 3928: every person named, in the owner's order; the first sent one leads. */
      readonly people: readonly PersonOutcome[];
    })
  | { readonly result: InstructedAskResult.NotSent };

const NOT_SENT: InstructedAskOutcome = { result: InstructedAskResult.NotSent };
const NOT_ON_NETAI_REASONS: ReadonlySet<string> = new Set([
  'recipient_not_member',
  'recipient_not_on_netai',
]);

/** The owner's own label for this number; the words they typed when there is none. */
export async function ownersLabel(userId: string, phone: string, typed: string): Promise<string> {
  const result = await query<{ alias: string; registered: string | null }>(
    `SELECT TRIM(ua.alias) AS alias,
            (SELECT NULLIF(TRIM(u.name), '') FROM "UserPhone" up JOIN "User" u ON u.id = up."userId"
              WHERE regexp_replace(up.phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
                AND u."deletedAt" IS NULL
              LIMIT 1) AS registered
       FROM "UserAlias" ua
      WHERE ua."contactId" = $1::int
        -- 45155: the name search returns digits only; the stored number may carry „+".
        AND regexp_replace(ua.phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
        AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      ORDER BY LENGTH(TRIM(ua.alias)) DESC LIMIT 1`,
    [userId, phone],
    LABEL_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  if (row === undefined) return typed;
  // #7631 (tester 75964, 65721/65729): „Nika B. (gym)" for an account that exists.
  return typeof row.registered === 'string' ? nameFromLabel(row.alias, row.registered) : row.alias;
}

/** The one phone these typed words name; null for none or several. */
export async function phoneForWords(
  userId: string,
  words: readonly string[],
): Promise<string | null> {
  for (const count of NAME_WORDS_TRIED) {
    if (words.length < count) continue;
    const phones = await findContactPhonesByName(
      userId,
      words.slice(0, count).join(' '),
      MATCHES_LOOKED_AT,
    );
    if (phones.length === 1) return phones[0];
    if (phones.length > 1) return null;
  }
  return null;
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/u).filter((w) => w !== '');
}

/** The one phone the instruction's addressee names; null for none or several. */
export async function oneContactNamed(userId: string, sentence: string): Promise<string | null> {
  return phoneForWords(userId, wordsOf(instructionAddressee(sentence) ?? ''));
}

export interface NamedContact {
  readonly phone: string;
  /** The name as the owner typed it. */
  readonly typed: string;
}

/**
 * 3928: everyone the instruction names, each exactly one saved contact — or
 * null, so a line where any one name is unclear is left to the owner whole
 * rather than half-sent. One name keeps the original reading.
 */
export async function contactsNamed(
  userId: string,
  sentence: string,
): Promise<NamedContact[] | null> {
  const names = instructionNames(sentence);
  // 3961: a meeting names its person with „-თან", which only instructionNames reads.
  if (names.length <= 1 && !isMeetingInstruction(sentence)) {
    const phone = await oneContactNamed(userId, sentence);
    return phone === null ? null : [{ phone, typed: instructionNamed(sentence) ?? '' }];
  }
  const found: NamedContact[] = [];
  for (const typed of names) {
    const phone = await phoneForWords(userId, wordsOf(typed));
    if (phone === null) return null;
    if (!found.some((c) => c.phone === phone)) found.push({ phone, typed });
  }
  return found;
}

/** The goal on this conversation, opened from the owner's line when there is none. */
/** This conversation's open goal, or one opened for the owner's instruction (3928). */
export async function goalForInstruction(
  userId: string,
  threadId: number,
  ownerLine: string,
): Promise<number> {
  const open = await getOpenTaskByThread(threadId);
  if (open !== null) return open.id;
  // 3928 run 2 (conv 48589): an order to ask named people is this conversation's
  // own request. Filed under a goal of another conversation, its answers would go
  // back there and the asks are refused (askedFromAnotherGoalsThread).
  const { id } = await createTask(
    userId,
    goalTitleFrom(ownerLine),
    ownerLine.trim(),
    'solve',
    threadId,
    'ask_first',
  );
  return id;
}

/**
 * 5347 (asks 22447 and 22448, threads 54282 and 54284): in a thread that carries
 * someone else's request, the person asked wrote „სანდროს ჰკითხე ჩემი სახელით."
 * and „შეგიძლია ლაშას სთხოვო, რომ გააცნოს." — pass the request on. The server
 * cut the words after the name and sent them as the whole question: Sandro got
 * „ჩემი სახელით." and Lasha „გააცნოს.", under a new goal titled from the line.
 * What goes on from a request thread is the request, which only the run has
 * read; the server never writes that question from the line's tail.
 */
export function serverMayWriteTheAsk(mode: RunMode | undefined): boolean {
  return mode !== 'request_thread';
}

/** One named person asked; null when the ask could not go for another reason. */
async function askOne(
  userId: string,
  taskId: number,
  contact: NamedContact,
  question: string,
  threadId: number,
  unnamed: boolean,
): Promise<PersonOutcome | null> {
  const outcome = await createAsk(
    userId,
    taskId,
    contact.phone,
    question,
    undefined,
    threadId,
    undefined,
    undefined,
    undefined,
    true,
    undefined,
    unnamed || undefined,
  );
  if (outcome.sent) return { result: InstructedAskResult.Sent, toName: outcome.to_name };
  if (outcome.reason === undefined || !NOT_ON_NETAI_REASONS.has(outcome.reason)) return null;
  return {
    result: InstructedAskResult.NotOnNetai,
    toName: await ownersLabel(userId, contact.phone, contact.typed),
  };
}

function summed(people: readonly PersonOutcome[]): InstructedAskOutcome {
  if (people.length === 0) return NOT_SENT;
  const lead = people.find((p) => p.result === InstructedAskResult.Sent) ?? people[0];
  return { ...lead, people };
}

/** 3268: the people the owner marked deceased or blocked — nothing goes to them. */
async function excludedAmong(
  userId: string,
  contacts: readonly NamedContact[],
): Promise<Set<string>> {
  const excluded = new Set<string>();
  for (const c of contacts)
    if (await isDeceasedOrBlockedFor(userId, c.phone)) excluded.add(c.phone);
  return excluded;
}

/**
 * 0309's new fault (tester box 58847, thread 51846): „კი, ნინოს ჰკითხე" names
 * Nino and no question, and Nino is not on Netai. The server sent nothing, which
 * is right, but then told the owner „write the request again", as if the line
 * had not been understood. When everyone the line names is out of reach, that
 * is what the owner is told, and no goal is opened for it.
 */
async function namedButNotOnNetai(
  userId: string,
  askable: readonly NamedContact[],
  people: PersonOutcome[],
): Promise<InstructedAskOutcome> {
  for (const c of askable) {
    if ((await canBeAsked(c.phone)) === 'ok') return NOT_SENT;
  }
  for (const c of askable) {
    const toName = await ownersLabel(userId, c.phone, c.typed);
    people.push({ result: InstructedAskResult.NotOnNetai, toName });
  }
  return summed(people);
}

export async function sendInstructedAsk(
  userId: string,
  threadId: number,
  ownerLine: string,
): Promise<InstructedAskOutcome> {
  const sentence = contactInstructionIn(ownerLine);
  if (sentence === null) return NOT_SENT;
  /**
   * 2311 (tester box 56931, after 0253): „სთხოვე X-ს, დამაკავშიროს Y-თან" to an
   * X who never opened the app. The introduction was refused by the dormant
   * guard (task 54), and this send then went out as the bare fragment
   * „დამაკავშიროს Y-თან." to X, around that guard. An introduction is made as
   * an introduction or not at all: never as the owner's plain question.
   */
  if (ownerAsksForIntroduction([sentence])) return NOT_SENT;
  const contacts = await contactsNamed(userId, sentence);
  if (contacts === null) return NOT_SENT;
  const excluded = await excludedAmong(userId, contacts);
  const people: PersonOutcome[] = [];
  for (const c of contacts.filter((c) => excluded.has(c.phone))) {
    const toName = await ownersLabel(userId, c.phone, c.typed);
    people.push({ result: InstructedAskResult.Excluded, toName });
  }
  const askable = contacts.filter((c) => !excluded.has(c.phone));
  // 3268: before any goal is opened for it — nobody left to ask, no goal.
  if (askable.length === 0) return summed(people);
  // QA-001 (conv 42765): only the question, never „ask <name>" or the context before it.
  // 3928: a line with no question after the names asks about the need said before them.
  const asked = instructionQuestion(sentence) ?? instructionNeed(sentence);
  // 4687 (box 54550, goal 24996): „ლიკას კითხე" alone — the question was the owner's
  // earlier message — reached Lika as the whole question. A line that names whom to
  // ask but not what is no question; the run, which read the earlier message, asks.
  if (asked === null) return namedButNotOnNetai(userId, askable, people);
  const taskId = await goalForInstruction(userId, threadId, ownerLine);
  await grantTaskPermission(userId, taskId);
  // 1687: the facts the owner wrote around the instruction go with it, whole sentences only.
  const question = questionWithFacts(
    asked,
    factsAround(ownerLine.trim(), isInstructionSentence),
    INSTRUCTED_QUESTION_MAX_CHARS,
  );
  // #7856: „one guy is looking for…" — the line itself asks that the helper not learn who.
  const unnamed = ownerWantsUnnamed(ownerLine);
  for (const c of askable) {
    const outcome = await askOne(userId, taskId, c, question, threadId, unnamed);
    if (outcome !== null) people.push(outcome);
  }
  if (!people.some((p) => p.result !== InstructedAskResult.Excluded)) return NOT_SENT;
  // eslint-disable-next-line no-console
  console.log(
    `[instruction-unsent] thread ${threadId}: the server asked ${askable.length} named contact(s)`,
  );
  return summed(people);
}
