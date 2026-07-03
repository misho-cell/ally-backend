// Caps what a tool result feeds back into the model. Search tools return up to
// 20 rows; over a 15-tool run that snowballs the context (every iteration
// re-sends all prior results), which is what pushed model calls past their
// timeout. The model only needs the top rows to decide the next step — the
// full count is kept so it can say "N found" and ask the user to refine.

const MODEL_RESULT_LIMIT = 8;

export function dietToolResult(result: unknown): unknown {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return result;

  const obj = result as Record<string, unknown>;
  if (!Array.isArray(obj.results) || obj.results.length <= MODEL_RESULT_LIMIT) return result;

  return {
    ...obj,
    results: obj.results.slice(0, MODEL_RESULT_LIMIT),
    results_shown: MODEL_RESULT_LIMIT,
    note: `showing top ${MODEL_RESULT_LIMIT} of ${obj.results.length}; refine the query to narrow down`,
  };
}
