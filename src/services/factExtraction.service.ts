import { query } from '../db/postgres/client';
import { recordClaudeUsage } from './costLedger.service';
import { parseModelJson } from './modelJson';
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
    'Read this one exchange from a contacts app. List every NEW factual detail THE USER stated ' +
    'or explicitly confirmed about a THIRD PERSON they named — never about themselves, never ' +
    'about the assistant. ' +
    'THE ASSISTANT BLOCK IS CONTEXT ONLY, NEVER A SOURCE. The assistant guesses, reads web ' +
    'pages and repeats phonebook labels; none of that is something the user knows. If a detail ' +
    'appears only in the ASSISTANT block and the user did not confirm it, DO NOT return it. ' +
    'A short agreement from the user ("yes", "correct", "დიახ", "სწორია") DOES confirm what the ' +
    'assistant just said; silence does not. ' +
    'TENSE MATTERS: a role the person no longer holds is field_type "past_role", never ' +
    '"employer" or "occupation". "Worked at X for 15 years, left in 2022" is past_role, not ' +
    'employer X. ' +
    'Field types: occupation, employer, city, industry, past_role, or note for anything else ' +
    'worth remembering (a skill, a need, a relationship, context). confidence is "stated" when ' +
    'the user asserted it directly and plainly, "mentioned" when it came up only in passing or ' +
    'is uncertain. CRITICAL: value must contain ONLY what was actually said — never add a date, ' +
    'year, number, or any specific detail the user did not state, even if it seems like a ' +
    'reasonable guess (e.g. the current year). If a detail like a date genuinely was not given, ' +
    'leave it out of value entirely rather than inferring one. If nothing qualifies, return an ' +
    'empty array. Reply JSON only, no prose: ' +
    '[{"person_name": "...", "field_type": "...", "value": "...", "confidence": "stated"}, ...]'
  );
}

// A prompt instruction alone doesn't guarantee compliance — live-caught: told
// only "starting a new construction project in Vake", no date, the model
// still wrote "(2025)" into the saved value, stamped with today's date as if
// confirmed. This is the deterministic backstop: any 4-digit year in a
// candidate's value that does not appear verbatim in the source exchange is
// stripped, regardless of what the prompt asked for.
const YEAR_RE = /\b(19|20)\d{2}\b/g;

function stripUnstatedYears(value: string, sourceText: string): string {
  return value
    .replace(YEAR_RE, (year) => (sourceText.includes(year) ? year : ''))
    .replace(/\(\s*\)/g, '') // an empty parenthetical the strip left behind
    .replace(/\s+/g, ' ')
    .trim();
}

// A short agreement turns the assistant's last sentence into something the
// user confirmed. Anything longer is the user speaking for themselves, and
// then their own words are the only source.
const CONFIRMATION_WORDS = new Set([
  'კი',
  'დიახ',
  'ჰო',
  'სწორია',
  'ასეა',
  'ზუსტად',
  'ნამდვილად',
  'yes',
  'yep',
  'correct',
  'right',
  'exactly',
  'true',
]);
// A few of them together still make one agreement — „დიახ, სწორია" is two
// words and my first version, which allowed only one, refused it.
const MAX_CONFIRMATION_WORDS = 3;

function isConfirmation(userMessage: string): boolean {
  const words = userMessage
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= MAX_CONFIRMATION_WORDS &&
    words.every((w) => CONFIRMATION_WORDS.has(w))
  );
}

// A role the person no longer holds. The sweep had no tense at all: "15 years
// at Wissol, left in 2022" was stored as employer: Wissol, and that false
// present tense then read back as truth in every later conversation.
// Georgian marks the past in the verb, so a word list can only ever be the
// common cases — these are the forms that actually turned up in the live
// examples. The year rule below is what catches the rest.
const PAST_MARKERS = [
  'ყოფილი',
  'აღარ',
  'წარსულში',
  'ადრე',
  'დატოვა',
  'წამოვიდა',
  'წავიდა',
  'მუშაობდა',
  'იყო',
  'ex-',
  'former',
  'formerly',
  'previously',
  'used to',
  'left in',
  'until ',
  'worked at',
  'worked for',
  'no longer',
];
// "…, left in 2022" and „2022-ში წამოვიდა" share this shape: a role plus a
// year that has already passed. Cheaper and more general than chasing verb
// endings in two languages.
function mentionsPastYear(haystack: string): boolean {
  const thisYear = new Date().getFullYear();
  return (haystack.match(/\b(19|20)\d{2}\b/g) ?? []).some((y) => Number(y) < thisYear);
}
const PRESENT_ROLE_FIELDS = new Set(['employer', 'occupation', 'role']);

/** Words worth grounding on — short ones match everything and prove nothing. */
const MIN_GROUNDING_WORD = 4;

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Is this candidate actually the USER's knowledge?
 *
 * The exchange handed to the model contains the assistant's whole reply, and
 * the model read it as fact: on 2 September a clinic's web page the assistant
 * had summarised became four public facts about two real doctors, none of it
 * typed by anyone. The prompt now says the assistant block is context only —
 * this is the check that does not depend on the model obeying it.
 */
function isGroundedInUser(value: string, userMessage: string): boolean {
  const user = normalizeForCompare(userMessage);
  if (isConfirmation(userMessage)) return true; // they agreed to what was just said
  const words = normalizeForCompare(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= MIN_GROUNDING_WORD);
  if (words.length === 0) return user.includes(normalizeForCompare(value));
  return words.some((w) => user.includes(w));
}

/** A present-tense role field whose value or context says otherwise becomes past_role. */
function correctTense(fieldType: string, value: string, sourceText: string): string {
  if (!PRESENT_ROLE_FIELDS.has(fieldType)) return fieldType;
  const haystack = normalizeForCompare(`${value} ${sourceText}`);
  const past = PAST_MARKERS.some((m) => haystack.includes(m)) || mentionsPastYear(haystack);
  return past ? 'past_role' : fieldType;
}

function parseCandidates(raw: string, sourceText: string): ExtractedFactCandidate[] {
  // The sweep ran 165 times and wrote nothing: every reply arrived fenced and
  // this parse threw, so the whole batch was dropped as "no candidates".
  const parsed = parseModelJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  const out: ExtractedFactCandidate[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    const personName = typeof c.person_name === 'string' ? c.person_name.trim() : '';
    const fieldType = typeof c.field_type === 'string' ? c.field_type.trim().toLowerCase() : '';
    const rawValue = typeof c.value === 'string' ? c.value.trim() : '';
    const value = rawValue ? stripUnstatedYears(rawValue, sourceText) : '';
    const confidence = c.confidence === 'mentioned' ? 'mentioned' : 'stated';
    if (!personName || !value || !EXTRACTION_FIELD_TYPES.has(fieldType)) continue;
    out.push({ person_name: personName, field_type: fieldType, value, confidence });
  }
  return out;
}

/**
 * Has this user already saved this, in any wording that contains or is
 * contained by it?
 *
 * Eight notes accumulated on one person in one day, the same fact in five
 * spellings, one per conversation — the sweep had no memory of its own
 * writes. Substring both ways, because a sweep note is often a shorter
 * restatement of a note the user wrote themselves.
 */
async function alreadyStored(
  userId: string,
  phone: string,
  fieldType: string,
  value: string,
): Promise<boolean> {
  const result = await query<{ value: string }>(
    `SELECT value FROM contact_facts
     WHERE submitted_by_user_id = $1 AND neo4j_contact_id = $2
       AND field_type = $3 AND retracted_at IS NULL`,
    [userId, phone, fieldType],
    EXTRACTION_TIMEOUT_MS,
  );
  const incoming = normalizeForCompare(value);
  return result.rows.some((row) => {
    const existing = normalizeForCompare(row.value);
    return existing.includes(incoming) || incoming.includes(existing);
  });
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
  // Short messages are skipped to save a model call — but a confirmation is
  // short BY NATURE, and „დიახ, სწორია" is the one short message that can
  // carry a fact: it makes the assistant's last sentence the user's own.
  // Skipping it meant "what the user confirmed" could never be stored at all.
  const shortMessage = userMessage.trim().length < MIN_MESSAGE_CHARS_FOR_SWEEP;
  if (shortMessage && !(isConfirmation(userMessage) && finalReply)) return;
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
    const candidates = parseCandidates(raw, exchange);

    for (const candidate of candidates) {
      // The user's own words are the only source. Everything else in the
      // exchange is the assistant thinking aloud.
      if (!isGroundedInUser(candidate.value, userMessage)) {
        // eslint-disable-next-line no-console
        console.log(
          `[fact-sweep] dropped (not the user's words): ${candidate.field_type} on ` +
            `${candidate.person_name}`,
        );
        continue;
      }
      const fieldType = correctTense(candidate.field_type, candidate.value, userMessage);
      const matches = await findContactPhonesByName(
        userId,
        candidate.person_name,
        NAME_MATCH_LIMIT,
      );
      if (matches.length !== 1) continue; // unknown or ambiguous — never guess
      if (await alreadyStored(userId, matches[0], fieldType, candidate.value)) continue;
      await submitContactFact(
        userId,
        matches[0],
        fieldType,
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
