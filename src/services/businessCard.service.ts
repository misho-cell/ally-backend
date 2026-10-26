import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../config/anthropic';
import { recordClaudeUsage } from './costLedger.service';
import { EDITOR_MODEL } from './askEditor.service';

/**
 * #374 way 3 (founder D836, Misho's yes 26 Oct): a person met in the street is
 * added inside Netai from a photo of their business card. The server reads the
 * card and returns the contact; nothing is saved here — the app shows it for a
 * check and saves it with POST /contacts/import, the same door as typing it.
 */
export const CARD_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type CardMediaType = (typeof CARD_MEDIA_TYPES)[number];
/** About 5 MB of picture once decoded; a phone photo resized by the app is far less. */
export const MAX_CARD_BASE64_CHARS = 7_000_000;
const READ_BUDGET_MS = 30_000;
const MAX_READ_TOKENS = 600;
const MAX_FIELD_CHARS = 200;
const MAX_PHONES = 5;

export interface CardContact {
  readonly name: string;
  readonly phones: readonly string[];
  readonly email?: string;
  readonly employer?: string;
  readonly jobPosition?: string;
  readonly city?: string;
}

const CARD_TOOL: Anthropic.Tool = {
  name: 'card_contact',
  description: 'The person on the business card, exactly as printed.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Full name as printed; empty when there is none.' },
      phones: {
        type: 'array',
        items: { type: 'string' },
        description: 'Every phone number on the card, with its country code when printed.',
      },
      email: { type: 'string' },
      employer: { type: 'string', description: 'The company or organisation.' },
      jobPosition: { type: 'string', description: 'The title or role.' },
      city: { type: 'string' },
    },
    required: ['name', 'phones'],
  },
};

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD_CHARS);
  return trimmed === '' ? undefined : trimmed;
}

/** The tool's answer as a contact, or null when the card names nobody or no number. */
export function contactFromCard(input: unknown): CardContact | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = text(raw.name);
  const phones = Array.isArray(raw.phones)
    ? raw.phones
        .map(text)
        .filter((p): p is string => p !== undefined && /\d{6,}/u.test(p.replace(/\D/gu, '')))
        .slice(0, MAX_PHONES)
    : [];
  if (name === undefined || phones.length === 0) return null;
  return {
    name,
    phones,
    email: text(raw.email),
    employer: text(raw.employer),
    jobPosition: text(raw.jobPosition),
    city: text(raw.city),
  };
}

export async function readBusinessCard(
  imageBase64: string,
  mediaType: CardMediaType,
  userId: string,
): Promise<CardContact | null> {
  const response = await anthropic.messages.create(
    {
      model: EDITOR_MODEL,
      max_tokens: MAX_READ_TOKENS,
      tools: [CARD_TOOL],
      tool_choice: { type: 'tool', name: CARD_TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            {
              type: 'text',
              text: 'Read this business card. Copy what is printed; invent nothing.',
            },
          ],
        },
      ],
    },
    { timeout: READ_BUDGET_MS, maxRetries: 0 },
  );
  void recordClaudeUsage({
    userId,
    kind: 'business_card',
    model: EDITOR_MODEL,
    usage: response.usage,
  }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[business-card] usage not recorded:', (err as Error).message);
  });
  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  return call ? contactFromCard(call.input) : null;
}
