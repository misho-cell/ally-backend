import Anthropic from '@anthropic-ai/sdk';
import anthropic from '../config/anthropic';
import { recordClaudeUsage } from './costLedger.service';

const MODERATION_MODEL = 'claude-haiku-4-5-20251001';
const MODERATION_TIMEOUT_MS = 10_000;
/** „UNSAFE: harassment" needs a few more than „UNSAFE" did. */
const MODERATION_MAX_TOKENS = 16;

const MODERATION_SYSTEM =
  'You moderate replies from a contacts-networking assistant whose whole job is ' +
  'helping people reach the right person through their network — including public ' +
  'officials and people at public institutions. Mark UNSAFE ONLY if the reply itself ' +
  'contains hate speech, harassment or threats toward a person, sexual content, ' +
  'self-harm encouragement, incitement to violence, or genuinely dangerous ' +
  'instructions. The following are always SAFE: naming or identifying a public ' +
  'official or the head of a public body, helping the user reach a person or ' +
  'institution, contact info, names, and ordinary networking. Relaying or quoting ' +
  'another person\'s answer ("she said yes", "he will introduce you"), reporting ' +
  "that a message was sent or an introduction was made on the user's behalf, and " +
  'personal or family details a contact chose to share are also always SAFE. When ' +
  'unsure, answer SAFE. Answer with SAFE, or with UNSAFE followed by a colon and the ' +
  'one category that applies (hate, harassment, threat, sexual, self_harm, violence, ' +
  'dangerous) — for example „UNSAFE: harassment". Nothing else.';

/**
 * Row 76, and the seat's 407 §5a — a block nobody can diagnose.
 *
 * 21 September, 15:35:46: a plain Georgian question about Tbilisi's office
 * districts. Seventy-five seconds later the reply was blocked, the person got
 * the apology, and twenty tokens were spent on an answer nobody read. „Repeat
 * it" produced a full answer 53 seconds later, so the text itself was fine.
 *
 * The log said this and nothing more:
 *
 *   [moderation] run dad8bba4 thread 20857 reply blocked by content filter (len=1148)
 *
 * Which is „a record that says something happened and not what" — the phrase
 * is already in this codebase three times over, on rows 125, 126 and 202, and
 * once more in the officeholder gate right beside this call.
 *
 * So the classifier now names the category when it refuses. The CONTENT is
 * still never logged, and that is not an oversight: a reply blocked for sexual
 * content or harassment is the last text that should be copied into a log
 * file. A category on a question about office districts is enough to say the
 * block was wrong, which is the whole job.
 */
export interface ModerationVerdict {
  readonly safe: boolean;
  /** The category the classifier named, when it refused. */
  readonly reason?: string;
}

const KNOWN_CATEGORIES: readonly string[] = [
  'hate',
  'harassment',
  'threat',
  'sexual',
  'self_harm',
  'violence',
  'dangerous',
];

/** The category out of „UNSAFE: harassment", or „unnamed" when it gave none. */
function categoryOf(verdict: string): string {
  const lower = verdict.toLowerCase();
  return KNOWN_CATEGORIES.find((c) => lower.includes(c)) ?? 'unnamed';
}

async function moderationVote(text: string, userId: string | null): Promise<ModerationVerdict> {
  try {
    const response = await anthropic.messages.create(
      {
        model: MODERATION_MODEL,
        max_tokens: MODERATION_MAX_TOKENS,
        system: MODERATION_SYSTEM,
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

    if (!verdict.includes('UNSAFE')) return { safe: true };
    return { safe: false, reason: categoryOf(verdict) };
  } catch {
    // Fails open, as it always has: a classifier that cannot be reached must
    // never be the thing that withholds somebody's answer.
    return { safe: true };
  }
}

/**
 * Lightweight safety check on the assistant's user-facing reply.
 * Fails open: any error returns `true` so moderation never blocks a
 * legitimate answer.
 *
 * A single UNSAFE vote is not enough to block: the classifier misfires
 * intermittently, and a false block silently discards completed work and
 * shows the user a refusal instead of a delivered answer (14 Aug P0,
 * threads 8944/8954). Blocking requires a second independent vote to agree.
 */
export async function moderateReply(
  text: string,
  userId: string | null = null,
): Promise<ModerationVerdict> {
  if (!text.trim()) return { safe: true };
  const first = await moderationVote(text, userId);
  if (first.safe) return first;
  const second = await moderationVote(text, userId);
  if (second.safe) return second;
  // Both refused. The SECOND category is reported beside the first, because
  // two votes that block for different reasons is itself a sign the
  // classifier is guessing — and that is the shape of a false block.
  return {
    safe: false,
    reason: first.reason === second.reason ? first.reason : `${first.reason}+${second.reason}`,
  };
}

/** The boolean the reply path used before the category existed. */
export async function isReplySafe(text: string, userId: string | null = null): Promise<boolean> {
  return (await moderateReply(text, userId)).safe;
}
