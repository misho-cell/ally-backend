import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A TOOL THAT THROWS USED TO END THE PERSON'S RUN.
 *
 * `processToolBlocks` runs a turn's calls in a bare `Promise.all`, and there
 * was no `catch` anywhere between it and `executeToolCall`. One tool throwing
 * rejected the whole turn: the model call failed mid-run and the person got a
 * salvage artifact instead of the answer they asked for.
 *
 * ⚠️ SIX WAYS IN WERE FOUND AND FIXED ON 27 SEPTEMBER ALONE, every one of them
 * the model omitting a single field — `Number(input['task_id'])` is NaN and
 * `pg` sends it as the string "NaN"; the same for ask_id and request_id;
 * `.trim()` on an omitted field_type; `.replace()` on an omitted value; two
 * TEXT NOT NULL columns handed undefined. Each is refused at its own door now.
 * This is the floor under all six, and under the seventh nobody has found.
 *
 * WHAT IS HELD HERE IS THAT IT IS NOT A CATCH-ALL THAT CARRIES ON REGARDLESS,
 * which would be a worse bug than the one it replaces. Three separate things
 * have to stay true, and none of them is visible from "the run did not die":
 *
 *   1. The real exception is LOGGED, with the run id. Swallowing it would
 *      trade a loud failure for an invisible one — the exact shape this
 *      codebase has spent a week removing.
 *   2. The result is marked `is_error`.
 *   3. The model is TOLD NOT TO PRETEND. A tool result that only says "error"
 *      invites it to shrug and answer anyway, which is the whole failure.
 *
 * And the raw message is deliberately NOT handed to the model: it is usually a
 * database error, and a raw one carries table and column names — sometimes
 * values — somewhere they have no business being.
 *
 * Source-level, like `everyToolOfferedHasADoor` and for the same reason: this
 * is a wire inside a closure with no seam to call, and the thing worth holding
 * is that the wire is connected at all.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const WRAPPER = CHAT.slice(
  CHAT.indexOf('async function runOneToolBlockOrSayWhy('),
  CHAT.indexOf('async function processToolBlocks('),
);

describe('a tool that throws', () => {
  it('is caught, rather than rejecting the whole turn', () => {
    expect(WRAPPER).toContain(
      'return await runOneToolBlock(userId, threadId, runId, block, ownerAbsent);',
    );
    expect(WRAPPER).toContain('} catch (err) {');
  });

  it('is the wire the turn actually uses', () => {
    expect(CHAT).toContain(
      ': runOneToolBlockOrSayWhy(userId, threadId, runId, block, ownerAbsent),',
    );
  });

  it('leaves the real exception in the log, with the run it belongs to', () => {
    expect(WRAPPER).toContain('console.error(`[tool] ${block.name} threw in run ${runId}:`, why);');
  });

  it('marks the result as an error', () => {
    expect(WRAPPER).toContain('is_error: true');
  });

  /**
   * AND IT REACHES THE TABLE, not only the console. A deploy takes the
   * container's log with it, and `why.sh` — the routine whose whole job is to
   * notice a failure reason said for the first time — reads `tool_call_log`.
   * A thrown tool was invisible to it: the one class of failure nobody had to
   * explain away, because nobody could see it.
   */
  it('writes the failure into the table why.sh reads', () => {
    expect(WRAPPER).toContain('void logToolCall({');
    expect(WRAPPER).toContain('tool: block.name,');
  });

  /**
   * With the REAL message. That table is ours — `why.sh` and the admin window
   * read it, no person does — so it is the exact opposite of the note sent to
   * the model, and a generic string there would make the row worthless.
   */
  it('files the real exception there, not the generic note', () => {
    expect(WRAPPER).toContain('result: { failed: true, error: why },');
    expect(WRAPPER).not.toContain('result: { failed: true, error: TOOL_FAILED_NOTE }');
  });

  /**
   * The raw message must not travel to the model. Asserted as "the note is
   * what is sent" rather than as a list of things to avoid, because a
   * deny-list is how `(err as Error).message` gets added back one day by
   * somebody being helpful.
   */
  it('sends the written note and not the exception text', () => {
    expect(WRAPPER).toContain(
      'content: JSON.stringify({ failed: true, tool: block.name, error: TOOL_FAILED_NOTE }),',
    );
    expect(WRAPPER).not.toContain('error: (err as Error).message');
  });
});

describe('what the model is told', () => {
  const NOTE = CHAT.slice(
    CHAT.indexOf('const TOOL_FAILED_NOTE ='),
    CHAT.indexOf('/**\n * A TOOL THAT THROWS'),
  );

  it('forbids claiming the step happened', () => {
    expect(NOTE).toContain('Do NOT tell the person it worked');
    expect(NOTE).toContain('do not invent');
  });

  /**
   * And it says what to DO. Half of the six causes were a wrong argument the
   * model could have corrected itself, so a note that only forbids is a note
   * that wastes the one retry it had.
   */
  it('tells it to correct an argument and try once more', () => {
    expect(NOTE).toContain('call it once more');
  });

  it('tells it to say so plainly when the second attempt fails too', () => {
    expect(NOTE).toContain('could not be completed');
  });
});
