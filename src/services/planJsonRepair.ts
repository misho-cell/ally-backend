/**
 * 4522 (daily check, 10 Oct 18:43Z): propose_task_plan refused six plans in
 * four days as „not valid JSON", and the run lost each one. The tool log shows
 * the parse failing in the MIDDLE of the text („Unexpected token p at position
 * 148" of 270), not at its end — so not a cut-off: a slip in an otherwise
 * whole plan. The one fully visible case:
 *
 *   "routes": [{"name": "პირადი კონტაქტი", "status": "waiting"}, "], "people_to_involve": …
 *
 * Only these slips are mended, and only after a parse has failed; what comes
 * out is used only if it parses, and it goes through every check a plan sent
 * as an object goes through.
 */
const REPLACEMENT_CHAR_RE = /�/gu;
/**
 * Ops' daily check (12 Oct, two plans of 11 Oct, 2,844 and 1,474 chars): the plan
 * came as \\u-escaped Georgian with a „�" mid-text, where an escape was cut in
 * two. Dropping the „�" alone leaves the half escape (`\\u10`), still invalid —
 * so the half escape goes with it.
 */
const BROKEN_ESCAPE_RE = /\\u[0-9a-fA-F]{0,3}�/gu;
/** A lone quote right before a closing bracket: `}, "]` → `}]`. */
const STRAY_QUOTE_RE = /([,{[\]}])\s*"\s*(?=[\]}])/gu;
/** A comma right before a closing bracket: `}, ]` → `}]`. */
const TRAILING_COMMA_RE = /,\s*(?=[\]}])/gu;
/** A Georgian „ closed with an ASCII quote, which ends the JSON string early. */
const GEORGIAN_QUOTE_RE = /„([^"“\n]{0,200})"(?=[^,:}\]\s])/gu;

const REPAIRS: readonly ((text: string) => string)[] = [
  (text) => text.replace(BROKEN_ESCAPE_RE, ''),
  (text) => text.replace(REPLACEMENT_CHAR_RE, ''),
  (text) => text.replace(GEORGIAN_QUOTE_RE, '„$1“'),
  (text) => text.replace(STRAY_QUOTE_RE, '$1'),
  (text) => text.replace(TRAILING_COMMA_RE, ''),
];

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The plan object behind slightly broken JSON text; undefined when it cannot be mended. */
export function repairedPlanJson(text: string): unknown {
  let mended = text;
  for (const repair of REPAIRS) {
    mended = repair(mended);
    const value = parsed(mended);
    if (value !== undefined) return value;
  }
  return undefined;
}
