import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../config/anthropic';
import { recordClaudeUsage } from './costLedger.service';
import { EDITOR_MODEL } from './askEditor.service';
import { RunLanguage } from './runLanguage';
import { userLanguage } from './threads.service';
import {
  getWarRoomCard,
  updateWarRoomCard,
  WarRoomCard,
  withoutNumbers,
} from './warRoomCards.service';

/**
 * #7591 WAR ROOM, step 5 (founder, 24 Oct): he leaves a quick instruction on a
 * card and a worker writes the draft; he approves, and step 6 sends it. The
 * draft is only ever a draft: nothing reaches the person without his approval.
 */
const DRAFT_BUDGET_MS = 30_000;
const MAX_DRAFT_TOKENS = 600;
/** A Netai message a person reads on a phone: a few short sentences. */
const MAX_DRAFT_CHARS = 700;
export const DRAFTED_BY = 'netai-worker';

const LANGUAGE_NAMES: Readonly<Record<RunLanguage, string>> = {
  ka: 'Georgian',
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

function draftBrief(language: RunLanguage): string {
  return [
    'You are Netai, a personal assistant that helps its members reach the right people.',
    `Write ONE short message from Netai to this member, in ${LANGUAGE_NAMES[language]}, in Netai's own first-person voice.`,
    "Do exactly what the founder's instruction says this message must do; the card tells you who the member is, what they last said, what Netai did and where it stalled.",
    'Two to four short sentences. Address the member by first name at most once. No phone numbers, no promise that someone will answer, never tell them to do the work themselves.',
    'Plain text only: no markdown, no quotation marks around anybody’s words. Output only the message.',
  ].join('\n');
}

function draftInput(card: WarRoomCard): string {
  const { brief } = card;
  return [
    `Founder's instruction: ${card.instruction ?? ''}`,
    `Member: ${brief.who}`,
    `Their last words: ${brief.their_words ?? '—'}`,
    `What Netai did: ${brief.netai_did ?? '—'}`,
    `Where it stalled: ${brief.stalled}`,
  ].join('\n');
}

async function writeDraftText(card: WarRoomCard): Promise<string | null> {
  const language = await userLanguage(String(card.user_id)).catch((): RunLanguage => 'ka');
  const response = await anthropic.messages.create(
    {
      model: EDITOR_MODEL,
      max_tokens: MAX_DRAFT_TOKENS,
      system: draftBrief(language),
      messages: [{ role: 'user', content: draftInput(card) }],
    },
    { timeout: DRAFT_BUDGET_MS, maxRetries: 0 },
  );
  void recordClaudeUsage({
    userId: null,
    kind: 'war_room_draft',
    model: EDITOR_MODEL,
    usage: response.usage,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[war-room] draft usage not recorded:', (err as Error).message);
  });
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  return text === '' ? null : withoutNumbers(text).slice(0, MAX_DRAFT_CHARS);
}

export enum DraftOutcome {
  Drafted = 'drafted',
  NoSuchCard = 'no_such_card',
  NoInstruction = 'no_instruction',
  AlreadySent = 'already_sent',
  NothingWritten = 'nothing_written',
}

/** The card's draft, written from the founder's instruction. Throws only on a model failure. */
export async function writeCardDraft(
  cardId: number,
): Promise<{ outcome: DraftOutcome; card?: WarRoomCard }> {
  const card = await getWarRoomCard(cardId);
  if (card === null) return { outcome: DraftOutcome.NoSuchCard };
  if (card.sent_by !== null) return { outcome: DraftOutcome.AlreadySent };
  if (!card.instruction?.trim()) return { outcome: DraftOutcome.NoInstruction };
  const text = await writeDraftText(card);
  if (text === null) return { outcome: DraftOutcome.NothingWritten };
  const updated = await updateWarRoomCard(cardId, { draft: text, by: DRAFTED_BY });
  return updated === null
    ? { outcome: DraftOutcome.AlreadySent }
    : { outcome: DraftOutcome.Drafted, card: updated };
}
