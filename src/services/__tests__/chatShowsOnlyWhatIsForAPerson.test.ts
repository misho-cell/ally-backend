import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 204 — a sweep for rules that read part of the picture and answer with
 * confidence. This is one of them, and it had already cost something.
 *
 * `getThreadMessages` filtered with `kind NOT IN ('step', 'event')`: a denylist,
 * so any kind nobody remembered to add is drawn in every chat BY DEFAULT and
 * nothing fails until a person reads it.
 *
 * §20 of the admin register is what that costs: 26 engine turns sitting in the
 * founder's own chat as ordinary messages, written in the hour before the
 * `event` kind existed. The rows were internal, the filter had no word for
 * them, so they were shown.
 *
 * COUNTED BEFORE IT WAS TURNED ROUND, which is the only reason it is safe.
 * Every kind in `conversations` on 21 September:
 *
 *   message 36,544 · step 3,483 · event 960 · pending 218 · error 74
 *
 * Five, and the allowlist is exactly the three written FOR A PERSON —
 * `pending` is the updates card („6 more are waiting") and `error` is a
 * failure the owner is owed. Nothing that exists disappears.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the chat shows only what was written for a person', () => {
  it('asks what to SHOW, not what to hide', () => {
    expect(code).toContain('kind IN (');
    expect(code).not.toContain("kind NOT IN ('step', 'event')");
  });

  /**
   * The three that reach a person, named. If a fourth is ever added here it
   * should be because somebody decided a person should read it.
   */
  it('names message, pending and error, and nothing else', () => {
    const at = code.indexOf('SHOWN_TO_A_PERSON');
    const list = code.slice(at, code.indexOf(']', at));
    for (const kind of ['message', 'pending', 'error']) expect(list).toContain(`'${kind}'`);
    for (const kind of ['step', 'event']) expect(list).not.toContain(`'${kind}'`);
  });

  /** The admin window still reads everything — that is what includeSteps is. */
  it('still lets the admin window see all of it', () => {
    expect(code).toContain('opts.includeSteps');
    const at = code.indexOf('opts.includeSteps');
    expect(code.slice(at, at + 40)).toContain("''");
  });
});
