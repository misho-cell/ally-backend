// Phone-number scrubber shared by every surface that can emit free text to a
// client or model: the MCP connector's tool results and the in-app agent's
// streamed narration / final answers. Phone-shaped runs of digits are redacted
// server-side so they can never reach Claude's context or the chat UI. ISO
// dates and short numeric runs (ages, counts, house numbers) are spared.

const PHONE_LIKE_PATTERN = '\\+?\\d[\\d\\s\\-().]{5,}\\d';
const PHONE_KEY_RE = /phone|msisdn/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Year ranges ("2015-2017", "2015 - 2017") are education/work dates, not phones.
const YEAR_RANGE_RE = /^(19|20)\d{2}\s?[-–—]\s?(19|20)\d{2}$/;
const REDACTED = '[hidden]';
// Georgian numbers are 9 digits local / 12 with the country code. 8-digit runs
// were over-masking real content (a year range is 8 digits) — see the battery
// finding "[hidden] ადამიანი" / "FreeUni/ESM, [hidden]".
const MIN_PHONE_DIGITS = 9;

function redactCandidate(match: string): string {
  const trimmed = match.trim();
  if (ISO_DATE_RE.test(trimmed) || YEAR_RANGE_RE.test(trimmed)) return match;
  // A run of ADJACENT standalone numbers ("1500 2000 3000", "2015-2017
  // 2018-2020") is not one phone: real spaced phones break into 2-3 digit
  // groups ("+995 599 12 34 56"), while lists of counts/years/prices come in
  // chunks of 4+ digits each. Judge such chunks individually instead of
  // summing digits across the whole run — summing is what masked real content.
  const chunks = trimmed.split(/\s+/);
  if (chunks.length > 1 && chunks.every((c) => c.replace(/\D/g, '').length >= 4)) {
    const anyChunkIsPhone = chunks.some((c) => c.replace(/\D/g, '').length >= MIN_PHONE_DIGITS);
    return anyChunkIsPhone ? REDACTED : match;
  }
  const digitCount = match.replace(/\D/g, '').length;
  return digitCount >= MIN_PHONE_DIGITS ? REDACTED : match;
}

// Explicit-consent passthrough: ONLY the get_own_contact_number tool wraps a
// number in these markers (the user's own direct contact, on their explicit
// request). scrubText carries the span through UNTOUCHED (markers included, so
// repeated scrub passes stay idempotent); the display boundaries call
// stripAllowedSpans() to reveal the number at the last moment. Any number
// OUTSIDE a marker pair is scrubbed exactly as before.
export const ALLOW_OPEN = '⟦own⟧';
export const ALLOW_CLOSE = '⟦/own⟧';
const ALLOW_SPAN_RE = /⟦own⟧[\s\S]*?⟦\/own⟧/g;

export function scrubText(text: string): string {
  return text
    .split(ALLOW_SPAN_RE)
    .map((part) => part.replace(new RegExp(PHONE_LIKE_PATTERN, 'g'), redactCandidate))
    .reduce((acc, part, i) => {
      const spans = text.match(ALLOW_SPAN_RE) ?? [];
      return acc + (i > 0 ? spans[i - 1] : '') + part;
    }, '');
}

/**
 * Brand rule: assistant prose must not carry em dashes. Applied ONLY at
 * display boundaries (SSE, thread reads) — stored text stays untouched, and
 * three prompt-side attempts failed, so this is the render-layer fix.
 */
export function stripEmDashesForDisplay(text: string): string {
  return text.replace(/\s+—\s+/g, ', ').replace(/—/g, '-');
}

/**
 * The mechanical classes the prompt cannot hold (Ticket 11 Task 1): bold
 * markers, markdown headers and em dashes, in the reply and in every button
 * label — applied BEFORE the reply is stored, so `/threads/:id/messages`, the
 * list's `last_message` and the SSE stream all read the same clean text.
 * Four live no-bold instructions were ignored on the 7 Sep build; the render
 * layer is the only place the rule cannot be argued with.
 */
export function scrubMechanicalForStorage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/\s+—\s+/g, ', ')
    .replace(/—/g, '-');
}

/**
 * A reply that ends by offering alternatives in words („X or Y?", „… თუ …?")
 * while no buttons were attached — the typed-choice class, logged server-side
 * so its size per day is a number, not an impression (Ticket 11 Task 1 (e)).
 */
export function looksLikeTypedChoice(text: string): boolean {
  const lastLine = text.trim().split('\n').pop() ?? '';
  return /\?\s*$/.test(lastLine) && /(\s|,)(or|თუ)\s/i.test(lastLine);
}

/** Reveal allowed spans at a display boundary: drop the markers, keep the content. */
export function stripAllowedSpans(text: string): string {
  return text.split(ALLOW_OPEN).join('').split(ALLOW_CLOSE).join('');
}

// "[hidden]" is plumbing, not prose: tool results reach the model already
// scrubbed, and the model sometimes copies the placeholder into its reply —
// "ილია წულაია ([hidden]): …" rendered to a user (ticket 6 item 13). At the
// display boundary the placeholder disappears entirely, wrapper included:
// a parenthesized/bracketed "( **[hidden]** )" goes as one unit, a bare
// "[hidden]" goes alone, and leftover doubled spaces / space-before-comma are
// tidied. Privacy is unchanged — the number was already gone.
const REDACTED_WRAPPED_RE = /\s*[([]\s*\*{0,2}\[hidden\]\*{0,2}\s*[)\]]/g;
// A QUOTED placeholder goes with its quotes (Ticket 10 Task 3): on 3 Sep the
// reply „ვნახოთ ნომრები: ერთია "[hidden]", მეორე "[hidden]"" reached Lika as
// „ერთია "", მეორე """ — the placeholder gone, the empty quotes left behind to
// be read as a blank number. Straight, Georgian and guillemet quotes alike.
const REDACTED_QUOTED_RE = /\s*["„“'«]\s*\*{0,2}\[hidden\]\*{0,2}\s*["”'»]/g;
const REDACTED_BARE_RE = /\s*\*{0,2}\[hidden\]\*{0,2}/g;
// Ticket 16 Task 47 (Ticket 10 [3.1]): the other road to the same blank. A
// field that is EMPTY — a removed number, an employer nobody filled in — is
// quoted by the model and reaches the screen as „" with nothing inside. The
// tool results no longer carry empty fields (dietToolResult), and anything
// that still slips through loses its quotes here rather than reading as a
// value the user cannot see. A pair with content is never touched.
const EMPTY_QUOTES_RE = /\s*(?:["„“]\s*["”]|'\s*'|«\s*»|\(\s*\))/g;

export function stripRedactionArtifactsForDisplay(text: string): string {
  return text
    .replace(REDACTED_WRAPPED_RE, '')
    .replace(REDACTED_QUOTED_RE, '')
    .replace(REDACTED_BARE_RE, '')
    .replace(EMPTY_QUOTES_RE, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.:;!?])/g, '$1');
}

/**
 * Recursively scrubs a JSON-serializable value: drops phone-named keys,
 * redacts phone-shaped substrings in every string.
 */
export function scrubDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (PHONE_KEY_RE.test(key)) continue;
      out[key] = scrubDeep(entry);
    }
    return out;
  }
  return value;
}

// Private saved emails are masked like phone numbers — but ONLY on contact-data
// reads (profiles, saved facts, insights), never globally: a PUBLIC business
// email arriving from the model's own web search is legitimate to show. Callers
// therefore apply this at the contact-payload source, not at the SSE boundary.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REDACTED_EMAIL = '[email hidden]';

export function scrubEmailsText(text: string): string {
  return text.replace(EMAIL_RE, REDACTED_EMAIL);
}

/** Recursively masks email addresses in a JSON-serializable value. */
export function scrubEmailsDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubEmailsText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(scrubEmailsDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = scrubEmailsDeep(entry);
    }
    return out;
  }
  return value;
}

/** Leak check used by tests and defensive assertions — true if anything phone-like survives. */
export function containsPhoneLike(value: unknown): boolean {
  const serialized = JSON.stringify(value) ?? '';
  const matches = serialized.match(new RegExp(PHONE_LIKE_PATTERN, 'g')) ?? [];
  return matches.some((m) => redactCandidate(m) === REDACTED);
}
