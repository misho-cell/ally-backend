import { query } from '../db/postgres/client';
import { QUICK_MODEL, noThinkingFor } from './aiModels';
import { recordClaudeUsage } from './costLedger.service';

/**
 * Misho, 13 Nov (a real member): he answered „კი" to „shall I write to Erekle
 * with this text?", a reply that named the person to be met, and the
 * introduction was refused because his „კი" carried no name. „No strict rules
 * where a name must follow the yes: read the messages before it — up to ten —
 * to understand what he is answering, and if it is still unclear, ask him."
 *
 * So when the quick name checks in introYesGate do not settle it, a small model
 * reads the end of the conversation and says whether the owner agreed to this
 * introduction: yes, no, or unclear. Unclear (and any failure) means one short
 * question to the owner, never a silent send.
 */
export enum IntroConsent {
  Yes = 'yes',
  No = 'no',
  Unclear = 'unclear',
}

export const RECENT_MESSAGES_TO_READ = 10;
const CONSENT_MODEL = process.env.INTRO_CONSENT_MODEL?.trim() || QUICK_MODEL;
const CONSENT_TIMEOUT_MS = 4_000;
const CONSENT_MAX_TOKENS = 10;
const MESSAGE_CHARS = 800;
const READ_TIMEOUT_MS = 3_000;
const INJECTED_NOTE_RE = /^\s*\((სისტემური|system note)/iu;

const CONSENT_PROMPT =
  'You read the end of a conversation between an owner and their assistant, oldest first. ' +
  'The assistant now wants to ask GO-BETWEEN to introduce the owner to TARGET (or to ask ' +
  'GO-BETWEEN about it). Read the owner’s latest message in the light of the messages before ' +
  'it: a short reply such as „კი", „ხო", „ok" or a name answers the assistant’s last question. ' +
  'Did the owner agree that the assistant asks this go-between for this? Answer with exactly ' +
  'one word: yes, no, or unclear. Say yes only when, read with what came before, the owner’s ' +
  'words agree to it. Say no when the owner declined or asked for something else instead. ' +
  'Say unclear when you cannot tell.';

interface ConversationRow {
  readonly role: string;
  readonly content: string | null;
}

/** The last messages of a thread, oldest first, as „OWNER:" / „ASSISTANT:" lines; [] when unreadable. */
export async function recentExchange(
  threadId: number,
  limit: number = RECENT_MESSAGES_TO_READ,
): Promise<string[]> {
  try {
    const result = await query<ConversationRow>(
      `SELECT role, content FROM conversations
        WHERE thread_id = $1 AND kind = 'message' AND role IN ('user', 'assistant')
          AND COALESCE(content, '') <> ''
        ORDER BY created_at DESC
        LIMIT $2`,
      [threadId, limit],
      READ_TIMEOUT_MS,
    );
    return result.rows
      .map((row) => ({ role: row.role, text: (row.content ?? '').trim() }))
      .filter((row) => row.text !== '' && !INJECTED_NOTE_RE.test(row.text))
      .reverse()
      .map(
        (row) =>
          `${row.role === 'user' ? 'OWNER' : 'ASSISTANT'}: ${row.text.slice(0, MESSAGE_CHARS)}`,
      );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[intro-consent] could not read the conversation:', (err as Error).message);
    return [];
  }
}

/** The one word the model answered, as a verdict; anything else is unclear. */
export function consentFromAnswer(answer: string): IntroConsent {
  const word = answer
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/gu, '');
  if (word === IntroConsent.Yes) return IntroConsent.Yes;
  if (word === IntroConsent.No) return IntroConsent.No;
  return IntroConsent.Unclear;
}

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

export interface ConsentOrigin {
  readonly userId: string;
  readonly runId?: string;
  readonly threadId: number;
}

/** Whether the owner agreed to this introduction, read from the conversation; unclear on any failure. */
export async function readIntroConsent(
  exchange: readonly string[],
  mediatorName: string,
  targetName: string,
  origin: ConsentOrigin,
): Promise<IntroConsent> {
  if (exchange.length === 0) return IntroConsent.Unclear;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: CONSENT_MODEL,
        ...noThinkingFor(CONSENT_MODEL),
        max_tokens: CONSENT_MAX_TOKENS,
        system: CONSENT_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `GO-BETWEEN: ${mediatorName}\nTARGET: ${targetName}\n\n` +
              `CONVERSATION:\n${exchange.join('\n')}`,
          },
        ],
      },
      { timeout: CONSENT_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'intro_consent',
      model: CONSENT_MODEL,
      usage: response.usage,
      threadId: origin.threadId,
      ...(origin.runId ? { runId: origin.runId } : {}),
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[intro-consent] usage not recorded:', (err as Error).message);
    });
    return consentFromAnswer(answerText(response.content));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[intro-consent] could not read the consent:', (err as Error).message);
    return IntroConsent.Unclear;
  }
}
