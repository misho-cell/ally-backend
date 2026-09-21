import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `prompt_mode` → `run_mode`, cleared by the frontend („rename whenever, no
 * warning needed").
 *
 * The old name was not merely ugly, it was misread: it describes the RUN and
 * sits on the ROW, and the seat's 377/378 read it as a row attribute and
 * concluded that 52 of the engine's own step rows were reaching the client as
 * messages. Their counts were exact; the name did the misleading.
 *
 * BOTH NAMES SHIP FOR NOW. A hard rename makes the field silently undefined on
 * a client that has not deployed yet, and two deploy orders are not worth
 * gambling a display on. The old one is deprecated and goes the moment they
 * say they read the new one — because two names for one thing is the fault
 * `req_<id>` against the UUID has cost the tester all week, and shipping it on
 * purpose and forever would be doing knowingly what that did by accident.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the run is named after the run', () => {
  it('selects the mode as run_mode', () => {
    expect(code).toContain('s.mode AS run_mode');
  });

  it('still sends the old name while the client switches', () => {
    expect(code).toContain('s.mode AS prompt_mode');
  });

  /** Both keys, one source — they cannot disagree. */
  it('reads them from the same column, so they can never drift apart', () => {
    const select = code.slice(code.indexOf('s.mode AS run_mode'));
    expect(select.slice(0, 120)).toContain('s.mode AS prompt_mode');
  });

  it('carries both on the message type, with the old one marked', () => {
    expect(SOURCE).toContain('run_mode?: string | null;');
    expect(SOURCE).toContain('@deprecated');
  });
});
