import { readFileSync } from 'fs';
import { join } from 'path';
import { OWNER_CONSENT_TOOL_NAMES } from '../chat.service';

/**
 * THE SECOND DOOR ON THE OWNER'S CONSENT, AND NOTHING HELD IT SHUT.
 *
 * Multi-line sabotage sweep, 22 September: the condition of
 * `if (ownerAbsent && OWNER_CONSENT_TOOL_NAMES.has(name))` in `executeToolCall`
 * replaced with `false` — 3,858 tests passed.
 *
 * Its own comment says what it is for: „The tools are already absent from a
 * wake run's list, so reaching here means a call arrived for one anyway — a
 * replayed block, a future caller that forgets the flag, a model that names a
 * tool it was not given. The owner's consent is not something to record on any
 * of those."
 *
 * So it is the SECOND door, and a second door is exactly the kind that nobody
 * notices has come off its hinges: the first door hides the tools, and as long
 * as the first door holds, removing this one changes nothing anybody can see.
 * Until the day it does, and then an engine run — nobody at the keyboard —
 * records that the owner approved a plan, and the product starts writing to
 * the people in it.
 *
 * TWO THINGS ARE TESTED, and the second matters more than the first.
 */
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const GUARD = 'if (ownerAbsent && OWNER_CONSENT_TOOL_NAMES.has(name)) {';

describe('a run with no owner in it cannot record the owner saying yes', () => {
  it('finds the guard at all', () => {
    expect(chat).toContain(GUARD);
  });

  /**
   * FIRST, BEFORE ANY TOOL RUNS. The switch that dispatches all sixty tools is
   * below it; so is the phone-keyed exclusion lookup. A consent call must not
   * even get as far as a database read.
   */
  it('refuses before the dispatch, not inside it', () => {
    const guardAt = chat.indexOf(GUARD);
    const switchAt = chat.indexOf("case 'lookup_contact_by_phone'", guardAt);

    expect(guardAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(guardAt);
  });

  /**
   * AND IT TELLS THE MODEL NOT TO LIE ABOUT IT. „approved: false" on its own
   * invites „I have approved it for you"; the sentence is what stops the run
   * reporting a yes that never happened.
   */
  it('tells the model not to report an approval that did not happen', () => {
    const at = chat.indexOf(GUARD);
    const block = chat.slice(at, at + 900);

    expect(block).toContain('approved: false');
    expect(block).toContain('granted: false');
    expect(block).toContain('Do not tell them it was approved.');
  });

  it('says so in the log, naming the tool and the reason', () => {
    expect(chat).toContain('refused: no owner in this run (wake/engine)');
  });
});

/**
 * THE PARITY, AND THIS IS THE HALF THAT WILL FAIL ONE DAY.
 *
 * The guard is only as wide as its list. A third tool that records the owner's
 * consent, added without a line in `OWNER_CONSENT_TOOL_NAMES`, is a tool an
 * engine run may call — and the guard above will pass it through while looking
 * exactly as correct as it does now.
 *
 * So the list is checked against the code rather than against itself: every
 * tool whose handler calls `approveTaskPlan` or `grantTaskPermission` must be
 * named in it. Today that is two tools and two entries.
 */
describe('the list is as wide as the thing it guards', () => {
  /** Which `case '<tool>':` a given call sits under, by position in the file. */
  function toolCasesCalling(fn: string): string[] {
    const cases = [...chat.matchAll(/case '([a-z_]+)':/g)].map((m) => ({
      at: m.index ?? 0,
      name: m[1],
    }));
    const out = new Set<string>();
    for (const call of chat.matchAll(new RegExp(`\\b${fn}\\(`, 'g'))) {
      const at = call.index ?? 0;
      const owner = [...cases].filter((c) => c.at < at).pop();
      if (owner) out.add(owner.name);
    }
    return [...out];
  }

  it('finds the consent calls at all', () => {
    // The control. An empty list would make the parity below pass over nothing.
    expect(toolCasesCalling('approveTaskPlan').length).toBeGreaterThan(0);
    expect(toolCasesCalling('grantTaskPermission').length).toBeGreaterThan(0);
  });

  it('names every tool that records the owner’s consent', () => {
    const recording = new Set([
      ...toolCasesCalling('approveTaskPlan'),
      ...toolCasesCalling('grantTaskPermission'),
    ]);
    const missing = [...recording].filter((t) => !OWNER_CONSENT_TOOL_NAMES.has(t));

    // A THIRD CONSENT TOOL LANDS HERE. Add it to OWNER_CONSENT_TOOL_NAMES —
    // not to this test.
    expect(missing).toEqual([]);
  });

  it('is exactly those two today, so a silent widening is visible too', () => {
    expect([...OWNER_CONSENT_TOOL_NAMES].sort()).toEqual([
      'approve_task_plan',
      'grant_task_permission',
    ]);
  });
});
