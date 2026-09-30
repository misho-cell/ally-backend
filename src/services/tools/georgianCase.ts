/**
 * ROW 277 — A CONTACT SAVED IN CAPITAL GEORGIAN LETTERS COULD NOT BE FOUND.
 *
 * ⚠️ JAVASCRIPT FOLDS MTAVRULI AND POSTGRES DOES NOT. That one sentence is the
 * whole bug, and it is invisible from either side alone.
 *
 * Georgian has a capital form, MTAVRULI (U+1C90–U+1CBF), which Unicode defines
 * as the uppercase of the ordinary Mkhedruli letters (U+10D0–U+10FF). Phones
 * store what the owner typed, so a name entered in caps arrives in Mtavruli and
 * is stored that way.
 *
 * MEASURED, 28 September, on the live database:
 *
 *     node:      'ᲗᲐᲛᲐᲠ'.toLowerCase()  →  'თამარ'     ✅ folded
 *     postgres:  lower('ᲗᲐᲛᲐᲠ')         →  'ᲗᲐᲛᲐᲠ'     ❌ unchanged
 *
 * So the QUERY side lowercases in JavaScript and comes out Mkhedruli, while the
 * STORED side lowercases in SQL and stays Mtavruli. The two can never meet, and
 * BOTH directions fail: searching in ordinary letters misses the stored capital
 * name, and searching in capitals is folded to ordinary letters by JavaScript
 * and then misses it too.
 *
 * The tester found it the way it would find a real person: three searches for a
 * contact that was demonstrably in the phonebook, all `found:false`. Any real
 * phone with a capitalised Georgian contact hits exactly this.
 *
 * ════════ WHY `translate` AND NOT A COLLATION OR AN EXTENSION ════════
 *
 * Mtavruli → Mkhedruli is a flat 1:1 map with no context and no expansion:
 * every one of the 46 letters has exactly one lowercase letter, one code point
 * each. `translate` therefore expresses it exactly, runs on any build, needs no
 * extension, and cannot change under an ICU upgrade — which matters because
 * `lower()` not folding this is itself a collation behaviour we do not control.
 *
 * The pairs are not hand-typed. They were generated from JavaScript's own
 * `toLowerCase` over U+1C90–U+1CBF, so the SQL fold and the JS fold agree by
 * construction rather than by somebody checking a chart.
 */

/** The 46 Mtavruli letters that have a lowercase form. */
const MTAVRULI = 'ᲐᲑᲒᲓᲔᲕᲖᲗᲘᲙᲚᲛᲜᲝᲞᲟᲠᲡᲢᲣᲤᲥᲦᲧᲨᲩᲪᲫᲬᲭᲮᲯᲰᲱᲲᲳᲴᲵᲶᲷᲸᲹᲺᲽᲾᲿ';

/** Their Mkhedruli counterparts, in the same order. */
const MKHEDRULI = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶჷჸჹჺჽჾჿ';

/**
 * Lowercase a stored text column the way the query side already lowercases the
 * query — Georgian capitals included.
 *
 * ⚠️ USE THIS WHEREVER STORED TEXT IS LOWERCASED FOR MATCHING. A bare `LOWER()`
 * left anywhere in a search path reopens this hole for that one field only,
 * which is worse than the original bug because the search then works for a name
 * and fails for a tag.
 */
export function foldedLower(expr: string): string {
  return `LOWER(TRANSLATE(${expr}, '${MTAVRULI}', '${MKHEDRULI}'))`;
}

/**
 * The other direction: Mkhedruli → Mtavruli, for a query word that must also
 * be looked up in its capital form (row 278 — the second circle's trigram
 * prefilter reads LOWER(col), which leaves stored capitals as they are).
 */
export function toMtavruli(text: string): string {
  let out = '';
  for (const char of text) {
    const at = MKHEDRULI.indexOf(char);
    out += at === -1 ? char : [...MTAVRULI][at];
  }
  return out;
}

/**
 * The same fold in JavaScript, for anywhere a value is compared in memory
 * rather than in SQL.
 *
 * `toLowerCase` already does this correctly — the function exists so the two
 * sides are visibly the same rule, and so the next person does not have to
 * rediscover that one half of the pair needed help and the other did not.
 */
export function foldGeorgianCase(text: string): string {
  return text.toLowerCase();
}
