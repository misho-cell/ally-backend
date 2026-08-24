import { recordClaudeUsage } from './costLedger.service';
import { submitContactFact, FACT_FIELD_TYPES, FactConfidence } from './contactFacts.service';
import { findContactPhonesByName } from './tools/nameMatch';

// Engine T1 (ticket 6, 20 Aug spec): the live assistant saves a fact only
// when it decides to call save_contact_fact mid-conversation — this sweep
// is the backstop for everything it decides NOT to call in the moment.
// Cheap tier, same choice as thread-title generation and note moderation
// elsewhere in this codebase; overridable without a deploy.
const EXTRACTION_MODEL = process.env.FACT_EXTRACTION_MODEL?.trim() || 'claude-haiku-4-5-20251001';
const EXTRACTION_MAX_TOKENS = 600;
const EXTRACTION_TIMEOUT_MS = 15_000;
const EXTRACTION_INPUT_MAX_CHARS = 4_000;
// A message this short is extremely unlikely to state a new fact about a
// named person — skips the model call entirely for "კი", "მადლობა", etc.
const MIN_MESSAGE_CHARS_FOR_SWEEP = 15;
// A resolved name that matches more than this many of the user's own
// contacts is treated as unresolvable — never guess which one.
const NAME_MATCH_LIMIT = 3;

const EXTRACTION_FIELD_TYPES = new Set<string>([...FACT_FIELD_TYPES, 'note']);

interface ExtractedFactCandidate {
  person_name: string;
  field_type: string;
  value: string;
  confidence: FactConfidence;
}

function buildExtractionPrompt(): string {
  return (
    'Read this one exchange from a contacts app. List every NEW factual detail the USER stated ' +
    'or mentioned about a THIRD PERSON they named — never about themselves, never about the ' +
    'assistant. Field types: occupation, employer, city, industry, or note for anything else ' +
    'worth remembering (a skill, a need, a relationship, context). confidence is "stated" when ' +
    'the user asserted it directly and plainly, "mentioned" when it came up only in passing or ' +
    'is uncertain. If nothing qualifies, return an empty array. Reply JSON only, no prose: ' +
    '[{"person_name": "...", "field_type": "...", "value": "...", "confidence": "stated"}, ...]'
  );
}

function parseCandidates(raw: string): ExtractedFactCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExtractedFactCandidate[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    const personName = typeof c.person_name === 'string' ? c.person_name.trim() : '';
    const fieldType = typeof c.field_type === 'string' ? c.field_type.trim().toLowerCase() : '';
    const value = typeof c.value === 'string' ? c.value.trim() : '';
    const confidence = c.confidence === 'mentioned' ? 'mentioned' : 'stated';
    if (!personName || !value || !EXTRACTION_FIELD_TYPES.has(fieldType)) continue;
    out.push({ person_name: personName, field_type: fieldType, value, confidence });
  }
  return out;
}

/**
 * Fire-and-forget, called after every completed run (same hook as thread
 * title generation): reads the just-finished exchange, extracts facts about
 * named third parties the live assistant may not have saved, and writes
 * each one ONLY when the name resolves to exactly one of the user's own
 * contacts — an ambiguous or unknown name is skipped, never guessed at.
 * Every write is tagged source='sweep' so it's visibly distinct from a
 * live save.
 */
export async function sweepFactsFromExchange(
  userId: string,
  threadId: number,
  userMessage: string,
  finalReply?: string,
): Promise<void> {
  if (userMessage.trim().length < MIN_MESSAGE_CHARS_FOR_SWEEP) return;
  try {
    const { default: anthropic } = await import('../config/anthropic');
    const exchange = finalReply
      ? `USER: ${userMessage.slice(0, EXTRACTION_INPUT_MAX_CHARS)}\nASSISTANT: ${finalReply.slice(0, EXTRACTION_INPUT_MAX_CHARS)}`
      : userMessage.slice(0, EXTRACTION_INPUT_MAX_CHARS);
    const response = await anthropic.messages.create(
      {
        model: EXTRACTION_MODEL,
        max_tokens: EXTRACTION_MAX_TOKENS,
        system: buildExtractionPrompt(),
        messages: [{ role: 'user', content: exchange }],
      },
      { timeout: EXTRACTION_TIMEOUT_MS },
    );
    await recordClaudeUsage({
      userId,
      kind: 'fact_extraction_sweep',
      model: EXTRACTION_MODEL,
      usage: response.usage,
      threadId,
    }).catch(() => undefined);

    const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const candidates = parseCandidates(raw);

    for (const candidate of candidates) {
      const matches = await findContactPhonesByName(
        userId,
        candidate.person_name,
        NAME_MATCH_LIMIT,
      );
      if (matches.length !== 1) continue; // unknown or ambiguous — never guess
      await submitContactFact(
        userId,
        matches[0],
        candidate.field_type,
        candidate.value,
        'sweep',
        candidate.confidence,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[fact-sweep] thread ${threadId} failed:`, (err as Error).message);
  }
}
