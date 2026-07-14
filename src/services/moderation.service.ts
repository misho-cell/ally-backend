import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../config/anthropic';
import { recordClaudeUsage } from './costLedger.service';

const MODERATION_MODEL = 'claude-haiku-4-5-20251001';
const MODERATION_TIMEOUT_MS = 10_000;

/**
 * Lightweight safety check on the assistant's user-facing reply.
 * Fails open: any error returns `true` so moderation never blocks a
 * legitimate answer.
 */
export async function isReplySafe(text: string, userId: string | null = null): Promise<boolean> {
  if (!text.trim()) return true;

  try {
    const response = await anthropic.messages.create(
      {
        model: MODERATION_MODEL,
        max_tokens: 8,
        system:
          'You moderate replies from a contacts-networking assistant whose whole job is ' +
          'helping people reach the right person through their network — including public ' +
          'officials and people at public institutions. Mark UNSAFE ONLY if the reply itself ' +
          'contains hate speech, harassment or threats toward a person, sexual content, ' +
          'self-harm encouragement, incitement to violence, or genuinely dangerous ' +
          'instructions. The following are always SAFE: naming or identifying a public ' +
          'official or the head of a public body, helping the user reach a person or ' +
          'institution, contact info, names, and ordinary networking. When unsure, answer ' +
          'SAFE. Answer with exactly one word: SAFE or UNSAFE.',
        messages: [{ role: 'user', content: text }],
      },
      { timeout: MODERATION_TIMEOUT_MS },
    );

    void recordClaudeUsage({
      userId,
      kind: 'moderation',
      model: MODERATION_MODEL,
      usage: response.usage,
    }).catch(() => {});

    const verdict = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .toUpperCase();

    return !verdict.includes('UNSAFE');
  } catch {
    return true;
  }
}
