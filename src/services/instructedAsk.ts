import { goalTitleFrom, instructionAddressee } from './goalIntent';
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

export interface InstructedAskSent {
  readonly toName: string;
}

/** The one phone the instruction's addressee names; null for none or several. */
async function oneContactNamed(userId: string, sentence: string): Promise<string | null> {
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
): Promise<InstructedAskSent | null> {
  const sentence = contactInstructionIn(ownerLine);
  if (sentence === null) return null;
  const phone = await oneContactNamed(userId, sentence);
  if (phone === null) return null;
  const taskId = await goalFor(userId, threadId, ownerLine);
  await grantTaskPermission(userId, taskId);
  const outcome = await createAsk(userId, taskId, phone, ownerLine.trim(), undefined, threadId);
  if (!outcome.sent || !('to_name' in outcome) || outcome.to_name === undefined) return null;
  // eslint-disable-next-line no-console
  console.log(`[instruction-unsent] thread ${threadId}: the server asked the one named contact`);
  return { toName: outcome.to_name };
}
