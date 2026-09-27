import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE ROW THAT STARTS A RUN DID NOT CARRY THE RUN IT STARTED.
 *
 * ⚠️ 27 SEPTEMBER, and the number is the whole argument: 118 silent-day wake
 * events in ten days, `run_id NULL` on every one of them. So the two halves of
 * the only question worth asking about a wake —
 *
 *     which wake fired?        the event row
 *     what did the run do?     tool_call_log, keyed by run_id
 *
 * — could not be joined at all. The only way to ask was thread plus a
 * five-minute window, and nobody had, which is why row 268 was read by hand,
 * one goal at a time, until the tester did it.
 *
 * WHAT THE JOIN SAID THE MOMENT IT EXISTED: 84 of those 118 wakes made no
 * outward act — no new ask, no search, no proposed plan. Seven in ten. That
 * number could not have been produced from this table the day before, and it
 * turned a ticket about one goal into a ticket about the rule.
 *
 * `runId` was in scope the whole time and sits three lines below in the
 * `runToolLoop` call. It was never passed. That is the entire fix.
 *
 * THIS IS A SOURCE TEST AND I WOULD RATHER IT WERE NOT. `processChat` cannot
 * be driven far enough to watch the insert without standing up a run, and the
 * property is one argument. What it holds is that the argument stays.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const STORE = CHAT.slice(CHAT.indexOf('  if (!storedAhead) {'));
const CALL = STORE.slice(0, STORE.indexOf('\n  }'));

describe('the incoming row carries its run', () => {
  it('passes runId to saveMessage', () => {
    expect(CALL).toContain(
      "userMessage.startsWith(RUN_EVENT_PREFIX) ? 'event' : 'message',\n      runId,",
    );
  });

  /**
   * The ordering matters and is easy to get wrong later: `saveMessage`'s sixth
   * parameter is `runId` and the fifth is `kind`. A future edit that inserts an
   * argument between them would typecheck if both were strings, and would file
   * every event under a run id of „event".
   */
  it('puts it in the position saveMessage reads as the run', () => {
    const signature = CHAT.slice(CHAT.indexOf('async function saveMessage('));
    const head = signature.slice(0, signature.indexOf('): Promise<number>'));

    expect(head.indexOf("kind: 'message'")).toBeLessThan(head.indexOf('runId: string | null'));
  });

  /**
   * And the reason it is safe, asserted rather than remembered: both places
   * that read `run_id` off `conversations` filter on `kind = 'step'`, so a
   * user row carrying one cannot reach either. If somebody later writes a
   * reader without that filter, this test will not catch it — but the comment
   * it is pinned to says what to check.
   */
  it('does not disturb the two readers, which are step-only', () => {
    const readers = CHAT.match(/run_id = \$2[^`]*/g) ?? [];

    expect(readers.length).toBeGreaterThan(0);
    for (const reader of readers) expect(reader).toContain("kind = 'step'");
  });
});
