/**
 * A GOAL ID THAT IS NOT A GOAL ID IDENTIFIES NO GOAL — the rule, on its own,
 * in a file that imports nothing.
 *
 * ════════ WHY IT IS NOT IN taskStore.service.ts ANY MORE ════════
 *
 * It started there, with a comment saying the check belonged there „because
 * every door meets there". That was wrong within the day: `taskPlans` and
 * `goalFeedback` take the same `Number(input['task_id'])` from the model and
 * never touch the store. Exporting it from `taskStore` would have fixed the
 * first and created a REQUIRE CYCLE for the second — `taskStore` already
 * imports `queueGoalFeedback` from `goalFeedback`, so an import back the other
 * way is a loop, and a loop resolves to `undefined` at the wrong moment rather
 * than failing at build time.
 *
 * A rule that four modules need belongs to none of them. This file has no
 * imports and never will.
 *
 * ════════ WHAT IT IS FOR ════════
 *
 * Every task id a model supplies arrives as `Number(input['task_id'])`, and
 * `Number(undefined)` is `NaN`. `pg`'s `prepareValue` serialises that as the
 * STRING „NaN", so `WHERE id = $1` makes Postgres raise `invalid input syntax
 * for type integer` — and, since the tool wrapper of 27 September, that no
 * longer ends the run. The model is told the tool failed, apologises, and the
 * owner sees a step that silently did not happen.
 *
 * A WORD is the other half and the one that gets forgotten: `Number('the vet
 * one')` is also `NaN`, while a missing field can also arrive as `undefined`,
 * which `pg` sends as NULL and which merely matches nothing. Three inputs, one
 * rule.
 *
 * ⚠️ IT IS NOT A PROOF THAT EVERY DOOR HAS BEEN FOUND. It is the answer to use
 * at a door once you are standing at one. The doors are found by sweeping
 * `chat.service.ts` for `Number(input[` and `as number`, which is how the two
 * in `taskPlans` and the two in `goalFeedback` were found — not by anybody
 * reporting them.
 */
export function isARealId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}
