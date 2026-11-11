import { recordClaudeUsage } from './costLedger.service';
import { QUICK_MODEL, noThinkingFor } from './aiModels';

/**
 * #8779 c, claims (Misho's choice, 5 Nov: „პატარა მოდელი"): a reply may say
 * something was deleted, saved or sent only when it really was. The guards used
 * to find those sentences by word lists in four languages, and each new
 * phrasing slipped past them (3302, 3796, 4490, 4555, #2113, #7229). The
 * founder's #8779: no fixed word lists. A small model reads the owner's line and
 * the reply and returns the sentences that make each kind of claim; the server
 * only checks structure — did the tool run — and a sentence the model returns
 * that is not in the reply word for word is dropped, so it cannot invent one.
 */
const REPLY_CLAIMS_MODEL = process.env.REPLY_CLAIMS_MODEL?.trim() || QUICK_MODEL;
const REPLY_CLAIMS_TIMEOUT_MS = 4_000;
const REPLY_CLAIMS_MAX_TOKENS = 600;
const MAX_REPLY_CHARS = 4_000;
const MAX_OWNER_LINE_CHARS = 1_000;

export enum ClaimKind {
  /** Says something is deleted, forgotten or removed now. */
  Deleted = 'deleted',
  /** Says something is saved, noted or remembered now (any fact, note or profile line). */
  Saved = 'saved',
  /** Says the owner's own offer of a service is saved. */
  OfferSaved = 'offer_saved',
  /** Says a message, question or request already went to somebody. */
  Sent = 'sent',
  /** Says it is writing or sending to somebody right now. */
  SendingNow = 'sending_now',
  /** Says an answer was, or will be, passed back to the person who asked. */
  PassedOn = 'passed_on',
  /** Says an answer or message could not be sent or delivered. */
  NotSent = 'not_sent',
}

export enum OwnerAsk {
  /** Asks to delete, forget or remove something. */
  Delete = 'asks_to_delete',
  /** Offers a service or product of their own. */
  OffersOwnService = 'offers_own_service',
  /** Only asks a question; asks nothing to be kept or done. */
  OnlyAsks = 'only_asks_a_question',
}

export interface ReplyClaims {
  readonly sentences: Readonly<Partial<Record<ClaimKind, readonly string[]>>>;
  readonly ownerAsks: ReadonlySet<OwnerAsk>;
}

export const NO_CLAIMS: ReplyClaims = { sentences: {}, ownerAsks: new Set() };

const CLAIM_KINDS: readonly string[] = Object.values(ClaimKind);
const OWNER_ASKS: readonly string[] = Object.values(OwnerAsk);

const CLAIMS_PROMPT =
  'You check an assistant reply for claims about actions. You get the OWNER line (what the ' +
  'user wrote) and the REPLY. Reply with JSON only: {"owner": [...], "claims": {...}}.\n' +
  '"owner" lists which of these the owner line does: "asks_to_delete" (asks to delete, ' +
  'forget or remove something), "offers_own_service" (offers a service or product of their ' +
  'own), "only_asks_a_question" (only asks a question and asks nothing to be kept or done).\n' +
  '"claims" maps each kind the REPLY makes to the exact sentences that make it, copied ' +
  'character for character: "deleted" (says something is deleted, forgotten or removed), ' +
  '"saved" (says something is saved, noted or remembered — past, present or future first ' +
  'person), "offer_saved" (says the owner\'s own offer is saved), "sent" (says a message, ' +
  'question or request already went to somebody), "sending_now" (says it is writing or ' +
  'sending to somebody right now), "passed_on" (says an answer was or will be passed back to ' +
  'the person who asked, or labels text as the answer to pass on), "not_sent" (says an answer ' +
  'or message could not be sent). A negated sentence ("I have not deleted it") makes no ' +
  'claim. Leave out kinds the reply does not make. Any language.';

function replyText(content: readonly { type: string; text?: string }[]): string {
  return content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
}

function jsonPart(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/** Only strings that stand in the reply word for word. */
function sentencesInReply(value: unknown, reply: string): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '' && reply.includes(item));
}

/** The model's answer, checked against the reply: unknown kinds and invented sentences go. */
export function claimsFromAnswer(answer: string, reply: string): ReplyClaims {
  const parsed = jsonPart(answer);
  if (parsed === null || typeof parsed !== 'object') return NO_CLAIMS;
  const { owner, claims } = parsed as { owner?: unknown; claims?: unknown };
  const ownerAsks = new Set<OwnerAsk>(
    (Array.isArray(owner) ? owner : []).filter(
      (item): item is OwnerAsk => typeof item === 'string' && OWNER_ASKS.includes(item),
    ),
  );
  const sentences: Partial<Record<ClaimKind, readonly string[]>> = {};
  if (claims !== null && typeof claims === 'object') {
    for (const [kind, value] of Object.entries(claims as Record<string, unknown>)) {
      if (!CLAIM_KINDS.includes(kind)) continue;
      const found = sentencesInReply(value, reply);
      if (found.length > 0) sentences[kind as ClaimKind] = found;
    }
  }
  return { sentences, ownerAsks };
}

export function claimsOfKind(claims: ReplyClaims, kind: ClaimKind): readonly string[] {
  return claims.sentences[kind] ?? [];
}

export function makesClaim(claims: ReplyClaims, kind: ClaimKind): boolean {
  return claimsOfKind(claims, kind).length > 0;
}

/** The reply without the given sentences; the reply itself when nothing would be left. */
export function withoutSentences(reply: string, sentences: readonly string[]): string {
  const kept = sentences
    .reduce((text, sentence) => text.split(sentence).join(''), reply)
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/ {2,}/gu, ' ')
    .trim();
  return kept === '' ? reply : kept;
}

export interface ReplyClaimsOrigin {
  readonly userId: string;
  readonly runId?: string | null;
  readonly threadId?: number | null;
}

/** What the reply claims, as the small model reads it; no claims on an empty reply or any failure. */
export async function readReplyClaims(
  reply: string,
  ownerLine: string,
  origin: ReplyClaimsOrigin,
): Promise<ReplyClaims> {
  if (reply.trim() === '') return NO_CLAIMS;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const response = await anthropic.messages.create(
      {
        model: REPLY_CLAIMS_MODEL,
        ...noThinkingFor(REPLY_CLAIMS_MODEL),
        max_tokens: REPLY_CLAIMS_MAX_TOKENS,
        system: CLAIMS_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `OWNER:\n${ownerLine.slice(0, MAX_OWNER_LINE_CHARS)}\n\n` +
              `REPLY:\n${reply.slice(0, MAX_REPLY_CHARS)}`,
          },
        ],
      },
      { timeout: REPLY_CLAIMS_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId: origin.userId,
      kind: 'reply_claims',
      model: REPLY_CLAIMS_MODEL,
      usage: response.usage,
      ...(origin.runId ? { runId: origin.runId } : {}),
      ...(origin.threadId ? { threadId: origin.threadId } : {}),
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[reply-claims] usage not recorded:', (err as Error).message);
    });
    return claimsFromAnswer(replyText(response.content), reply);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reply-claims] could not read the claims:', (err as Error).message);
    return NO_CLAIMS;
  }
}
