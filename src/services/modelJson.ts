/**
 * Parse a JSON payload out of a model's TEXT reply.
 *
 * Live-caught (1 Sep, Lika's phone session): every call site did a bare
 * `JSON.parse(text)` on the raw reply — and the model wraps its answer in a
 * ```json fence. The parse threw, each catch returned its fail-closed default,
 * and four engines produced NOTHING for two months while their model calls
 * were billed as successful:
 *
 *   note moderation      606 calls  →   0 public notes
 *   fact crowd matching  (per save) →   0 public facts, ever
 *   T1 extraction sweep  165 calls  →   0 facts written
 *   AI enrichment        8,014 rows →   0 industry / seniority values
 *
 * Three shapes are tried in order: the reply as-is, the body of a markdown
 * fence, and the first balanced {...} / [...] block (a reply with a sentence
 * before the JSON). Returns null instead of throwing — every caller already
 * has a fail-closed default and must keep it for a truly unparseable reply.
 */

const FENCE_RE = /^```(?:[a-z]+)?\s*([\s\S]*?)\s*```$/i;
const JSON_OPENER_RE = /[[{]/;

function tryParse<T>(candidate: string): T | null {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Not this shape — the caller falls through to the next candidate.
    return null;
  }
}

/** The first {...} or [...] block, for a reply that carries prose around it. */
function firstJsonBlock(text: string): string | null {
  const start = text.search(JSON_OPENER_RE);
  if (start === -1) return null;
  const closer = text[start] === '{' ? '}' : ']';
  const end = text.lastIndexOf(closer);
  if (end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseModelJson<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const asIs = tryParse<T>(trimmed);
  if (asIs !== null) return asIs;

  const fenced = FENCE_RE.exec(trimmed);
  if (fenced) {
    const inside = tryParse<T>(fenced[1].trim());
    if (inside !== null) return inside;
  }

  const block = firstJsonBlock(trimmed);
  return block === null ? null : tryParse<T>(block);
}
