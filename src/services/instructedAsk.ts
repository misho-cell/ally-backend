import { isDeceasedOrBlockedFor } from './block.service';
import { query } from '../db/postgres/client';
import {
  goalTitleFrom,
  instructionAddressee,
  instructionNamed,
  instructionQuestion,
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
 * Refuses (null) unless the line names exactly one saved contact: two
 * matches, none, or no instruction at all leave it to the owner.
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

export type InstructedAskOutcome =
  | {
      readonly result:
        | InstructedAskResult.Sent
        | InstructedAskResult.NotOnNetai
        | InstructedAskResult.Excluded;
      readonly toName: string;
    }
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

/** The one phone the instruction's addressee names; null for none or several. */
export async function oneContactNamed(userId: string, sentence: string): Promise<string | null> {
  const words = (instructionAddressee(sentence) ?? '').split(/\s+/u).filter((w) => w !== '');
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

/** The goal on this conversation, opened from the owner's line when there is none. */
async function goalFor(userId: string, threadId: number, ownerLine: string): Promise<number> {
  const open = await getOpenTaskByThread(threadId);
  if (open !== null) return open.id;
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

export async function sendInstructedAsk(
  userId: string,
  threadId: number,
  ownerLine: string,
): Promise<InstructedAskOutcome> {
  const sentence = contactInstructionIn(ownerLine);
  if (sentence === null) return NOT_SENT;
  const phone = await oneContactNamed(userId, sentence);
  if (phone === null) return NOT_SENT;
  // 3268: before any goal is opened for it.
  if (await isDeceasedOrBlockedFor(userId, phone)) {
    return {
      result: InstructedAskResult.Excluded,
      toName: await ownersLabel(userId, phone, instructionNamed(sentence) ?? ''),
    };
  }
  const taskId = await goalFor(userId, threadId, ownerLine);
  await grantTaskPermission(userId, taskId);
  // QA-001 (conv 42765): only the question, never „ask <name>" or the context before it.
  const question = instructionQuestion(sentence) ?? sentence;
  const outcome = await createAsk(
    userId,
    taskId,
    phone,
    question,
    undefined,
    threadId,
    undefined,
    undefined,
    undefined,
    true,
  );
  if (!outcome.sent) {
    if (outcome.reason === undefined || !NOT_ON_NETAI_REASONS.has(outcome.reason)) return NOT_SENT;
    const typed = instructionNamed(sentence) ?? '';
    return {
      result: InstructedAskResult.NotOnNetai,
      toName: await ownersLabel(userId, phone, typed),
    };
  }
  // eslint-disable-next-line no-console
  console.log(`[instruction-unsent] thread ${threadId}: the server asked the one named contact`);
  return { result: InstructedAskResult.Sent, toName: outcome.to_name };
}
