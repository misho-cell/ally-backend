// Caps what a tool result feeds back into the model. Search tools return up to
// 20 rows; over a 15-tool run that snowballs the context (every iteration
// re-sends all prior results), which is what pushed model calls past their
// timeout. The model only needs the top rows to decide the next step — the
// full count is kept so it can say "N found" and ask the user to refine.

const MODEL_RESULT_LIMIT = 8;

/**
 * Ticket 16 Task 47 (Ticket 10 [3.1]): an empty field is not information, and
 * the model quotes it — „ilia tsulaia (\"\")" reached a user as a blank where a
 * number should be. A field the scrubber emptied, or that nobody ever filled,
 * is dropped instead of travelling as "". Null and empty arrays go with it;
 * `false` and `0` are answers and stay. Applied to every tool result, so no
 * single tool has to remember.
 */
function withoutEmptyFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEmptyFields);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string' && entry.trim() === '') continue;
    if (Array.isArray(entry) && entry.length === 0) continue;
    out[key] = withoutEmptyFields(entry);
  }
  return out;
}

export function dietToolResult(result: unknown): unknown {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return result;

  const obj = withoutEmptyFields(result) as Record<string, unknown>;
  if (!Array.isArray(obj.results) || obj.results.length <= MODEL_RESULT_LIMIT) return obj;

  return {
    ...obj,
    results: obj.results.slice(0, MODEL_RESULT_LIMIT),
    results_shown: MODEL_RESULT_LIMIT,
    note: `showing top ${MODEL_RESULT_LIMIT} of ${obj.results.length}; refine the query to narrow down`,
  };
}
