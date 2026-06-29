// Sanitizes untrusted external data (contact names, tags, web results, etc.)
// before it reaches the model inside tool results — a prompt-injection guard.

const MAX_FIELD_LENGTH = 2000;

// Control characters (keeps \t \n \r) that can smuggle hidden payloads.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Attempts to override the assistant's instructions from inside data.
const OVERRIDE_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /forget\s+(everything|all|previous)/gi,
  /you\s+are\s+now\b/gi,
  /new\s+instructions?\s*:/gi,
  /system\s+prompt/gi,
  /<\/?(system|assistant|user)>/gi,
];

function sanitizeString(value: string): string {
  let s = value.replace(CONTROL_CHARS, '');
  for (const re of OVERRIDE_PATTERNS) {
    s = s.replace(re, '[filtered]');
  }
  if (s.length > MAX_FIELD_LENGTH) {
    s = s.slice(0, MAX_FIELD_LENGTH) + '…';
  }
  return s;
}

/**
 * Recursively sanitize every string in a tool result. Non-string values
 * (numbers, booleans, ids) pass through unchanged so structured data the
 * model relies on (target_user_id, counts, flags) stays intact.
 */
export function sanitizeToolResult(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeToolResult);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeToolResult(v);
    }
    return out;
  }
  return value;
}
