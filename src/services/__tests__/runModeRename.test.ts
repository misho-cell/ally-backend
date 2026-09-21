import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `prompt_mode` → `run_mode`, cleared by the frontend („rename whenever, no
 * warning needed"), and the old name deleted the same evening once they
 * confirmed they read the new one.
 *
 * The old name was not merely ugly, it was misread: it describes the RUN and
 * sits on the ROW, and the seat's 377/378 read it as a row attribute and
 * concluded that 52 of the engine's own step rows were reaching the client as
 * messages. Their counts were exact; the name did the misleading.
 *
 * WHY THIS FILE OUTLIVES THE RENAME. Both names shipped for four hours so a
 * client that had not deployed yet could not see the field go undefined. That
 * overlap is over — the frontend hid the old column (build a1e858c) and said
 * deleting it breaks nothing — and the test now guards the opposite thing: the
 * old name must not come back. Two names for one thing is the fault `req_<id>`
 * against the UUID has been costing the tester all week.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the run is named after the run', () => {
  it('selects the mode as run_mode', () => {
    expect(code).toContain('s.mode AS run_mode');
  });

  it('no longer sends the old name', () => {
    expect(code).not.toContain('prompt_mode');
  });

  it('carries it on the message type', () => {
    expect(SOURCE).toContain('run_mode?: string | null;');
  });
});
