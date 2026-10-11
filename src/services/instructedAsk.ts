import { isDeceasedOrBlockedFor } from './block.service';
import { query } from '../db/postgres/client';
import {
  goalTitleFrom,
  instructionAddressee,
  instructionNamed,
  instructionNames,
  instructionNeed,
  instructionQuestion,
  isMeetingInstruction,
} from './goalIntent';
import { contactInstructionIn } from './instructionUnsent';
import { createAsk } from './taskAsks.service';
import { createTask, getOpenTaskByThread, grantTaskPermission } from './taskStore.service';
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
  const result = await query<{ alias: string }>(
    `SELECT TRIM(alias) AS alias FROM "UserAlias"
      WHERE "contactId" = $1::int
        -- 45155: the name search returns digits only; the stored number may carry „+".
        AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
        AND NULLIF(TRIM(alias), '') IS NOT NULL
      ORDER BY LENGTH(TRIM(alias)) DESC LIMIT 1`,
    [userId, phone],
    LABEL_QUERY_TIMEOUT_MS,
  );
  return result.rows[0]?.alias ?? typed;
}

/** The one phone these typed words name; null for none or several. */
async function phoneForWords(userId: string, words: readonly string[]): Promise<string | null> {
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
async function goalFor(userId: string, threadId: number, ownerLine: string): Promise<number> {
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

/** One named person asked; null when the ask could not go for another reason. */
async function askOne(
  userId: string,
  taskId: number,
  contact: NamedContact,
  question: string,
  threadId: number,
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

export async function sendInstructedAsk(
  userId: string,
  threadId: number,
  ownerLine: string,
): Promise<InstructedAskOutcome> {
  const sentence = contactInstructionIn(ownerLine);
  if (sentence === null) return NOT_SENT;
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
  const taskId = await goalFor(userId, threadId, ownerLine);
  await grantTaskPermission(userId, taskId);
  // QA-001 (conv 42765): only the question, never „ask <name>" or the context before it.
  // 3928: a line with no question after the names asks about the need said before them.
  const question = instructionQuestion(sentence) ?? instructionNeed(sentence) ?? sentence;
  for (const c of askable) {
    const outcome = await askOne(userId, taskId, c, question, threadId);
    if (outcome !== null) people.push(outcome);
  }
  if (!people.some((p) => p.result !== InstructedAskResult.Excluded)) return NOT_SENT;
  // eslint-disable-next-line no-console
  console.log(
    `[instruction-unsent] thread ${threadId}: the server asked ${askable.length} named contact(s)`,
  );
  return summed(people);
}
