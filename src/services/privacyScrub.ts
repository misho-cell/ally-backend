// Phone-number scrubber shared by every surface that can emit free text to a
// client or model: the MCP connector's tool results and the in-app agent's
// streamed narration / final answers. Phone-shaped runs of digits are redacted
// server-side so they can never reach Claude's context or the chat UI. ISO
// dates and short numeric runs (ages, counts, house numbers) are spared.

const PHONE_LIKE_PATTERN = '\\+?\\d[\\d\\s\\-().]{5,}\\d';
const PHONE_KEY_RE = /phone|msisdn/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REDACTED = '[hidden]';
// Georgian numbers are 9+ digits; ISO dates hold 8. Sequences shorter than
// this are ages, counts, house numbers — not phones.
const MIN_PHONE_DIGITS = 8;

function redactCandidate(match: string): string {
  if (ISO_DATE_RE.test(match)) return match;
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

/** Reveal allowed spans at a display boundary: drop the markers, keep the content. */
export function stripAllowedSpans(text: string): string {
  return text.split(ALLOW_OPEN).join('').split(ALLOW_CLOSE).join('');
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
