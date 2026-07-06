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

export function scrubText(text: string): string {
  return text.replace(new RegExp(PHONE_LIKE_PATTERN, 'g'), redactCandidate);
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

/** Leak check used by tests and defensive assertions — true if anything phone-like survives. */
export function containsPhoneLike(value: unknown): boolean {
  const serialized = JSON.stringify(value) ?? '';
  const matches = serialized.match(new RegExp(PHONE_LIKE_PATTERN, 'g')) ?? [];
  return matches.some((m) => redactCandidate(m) === REDACTED);
}
