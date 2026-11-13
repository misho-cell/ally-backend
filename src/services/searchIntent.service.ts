import { recordClaudeUsage } from './costLedger.service';
import { QUICK_MODEL, noThinkingFor } from './aiModels';

/**
 * Misho, 13 Nov: „search the web for an organisation automatically, and use the
 * web search in most requests — unless they ask specifically to look in their
 * contacts." Giorgi asked „სამხარაულში მყავს ვინმე?"; the run searched only his
 * network, and the web — which names the bureau's leadership, whom his network
 * may know — ran only once he asked for it.
 *
 * No fixed word lists (the founder, #8779): a small model reads the owner's
 * message and says what kind of message it is. Any failure reads as None, so
 * nothing leaves for the web on a guess (row 253: a person's name must not go
 * to a search engine to answer a question the web cannot answer).
 */
export enum SearchIntent {
  /** A need, a question about a company, an organisation, a service or the world. */
  Web = 'web',
  /** A look-up in the owner's own contacts, or reaching one person by name. */
  ContactsOnly = 'contacts',
  /** Not a request: a greeting, thanks, a short reply, an app setting. */
  None = 'none',
}

const INTENT_MODEL = process.env.SEARCH_INTENT_MODEL?.trim() || QUICK_MODEL;
const INTENT_TIMEOUT_MS = 3_000;
const INTENT_MAX_TOKENS = 5;
const MAX_LINE_CHARS = 600;

const INTENT_PROMPT =
  'You read one message an owner wrote to their networking assistant. Answer with exactly one ' +
  'word.\n' +
  'web — they ask for help with a need, or about a company, an organisation, an institution, ' +
  'a service, a trade, a place or anything in the world: who works somewhere, who can do ' +
  'something, who leads something, how to reach an organisation. A question whether they ' +
  'know someone AT an organisation („do I have anyone at the forensic bureau?") is web.\n' +
  'contacts — they ask only to look something up in their own contacts (find a saved ' +
  'contact, a number, how someone is saved, who they have saved as something — „დირექტორი ' +
  'ვის უწერია?" asks whose contacts carry that label, so it is contacts), or to find, ' +
  'reach or be introduced to one particular person they name.\n' +
  'none — anything else: a greeting, thanks, a short reply to the assistant, yes or no, a ' +
  'choice, a correction, a setting.';

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

/** The one word the model answered, as an intent; anything else is None. */
export function intentFromAnswer(answer: string): SearchIntent {
  const word = answer
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/gu, '');
  if (word === SearchIntent.Web) return SearchIntent.Web;
  if (word === SearchIntent.ContactsOnly) return SearchIntent.ContactsOnly;
  return SearchIntent.None;
}

export interface IntentOrigin {
  readonly userId: string;
  readonly runId: string;
  readonly threadId: number;
}

/** What kind of message the owner wrote; None on any failure. */
export async function readSearchIntent(
  ownerLine: string,
  origin: IntentOrigin,
): Promise<SearchIntent> {
  if (ownerLine.trim() === '') return SearchIntent.None;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: INTENT_MODEL,
        ...noThinkingFor(INTENT_MODEL),
        max_tokens: INTENT_MAX_TOKENS,
        system: INTENT_PROMPT,
        messages: [{ role: 'user', content: ownerLine.trim().slice(0, MAX_LINE_CHARS) }],
      },
      { timeout: INTENT_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'search_intent',
      model: INTENT_MODEL,
      usage: response.usage,
      threadId: origin.threadId,
      runId: origin.runId,
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[search-intent] usage not recorded:', (err as Error).message);
    });
    return intentFromAnswer(answerText(response.content));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[search-intent] not read:', (err as Error).message);
    return SearchIntent.None;
  }
}
