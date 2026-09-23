import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE HELPER WAS MADE TO WAIT FOR A STRANGER'S ASSISTANT TO THINK.
 *
 * Found by asking `tool_call_log` a question nobody had asked it: which tools
 * are slow. `send_answer_to_asker` — the one act in this product that is pure
 * generosity, answering a stranger's question for them — answered in:
 *
 *     17 Sep   p50 23,454 ms
 *     18 Sep   p50 32,800 ms   worst 51,528
 *     22 Sep   p50 32,351 ms   worst 53,004
 *     23 Sep   p50 30,062 ms   worst 53,167
 *
 * Half a minute of spinner after pressing „send", every time, for a week. The
 * cause was one `await`: `wakeTask` is a whole run on the ASKER's side —
 * model, tools, reply — and it sat inside the tool call the HELPER's phone was
 * waiting on.
 *
 * I checked it was not mine before saying anything: it has been like this
 * since 17 September, days before anything I shipped today.
 *
 * WHY A SOURCE TEST AND NOT A TIMING ONE. A timing test would need the whole
 * engine and would measure this machine's speed rather than the shape of the
 * code. What went wrong is structural — one keyword — and the structure is
 * what must not come back. The three properties below are the whole fix.
 */
const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const deliver = source.slice(
  source.indexOf('async function deliverCapturedAnswer'),
  source.indexOf('interface RelayShape'),
);

describe('sending an answer does not wait for the asker’s run', () => {
  /**
   * The wake is still awaited — INSIDE the background block, where it must be
   * or nothing could mark the delivery. What must never come back is the await
   * at the FUNCTION's own level, which is what the caller waits on. Indentation
   * is the honest way to say that in a source test: eight spaces is inside the
   * block, four is the function body.
   */
  it('fires the wake without the caller waiting on it', () => {
    expect(deliver).toContain('void (async () => {');
    expect(deliver).toMatch(/^ {8}const delivered = await wakeTask\(/m);
    expect(deliver).not.toMatch(/^ {4}(const \w+ = )?await wakeTask\(/m);
  });

  /**
   * AND IT STILL MARKS DELIVERY. Dropping the await must not drop the record:
   * `wake_delivered_at` is what keeps the five-minute sweep from waking the
   * same goal a second time.
   */
  it('still records the delivery when the wake succeeds', () => {
    expect(deliver).toContain("if (delivered === 'woken') await markAskWakeDelivered(");
  });

  /**
   * AND IT STILL CATCHES. A background promise that throws with no catch is an
   * unhandled rejection, which in this process is a different kind of outage
   * from the one I was fixing.
   */
  it('catches its own failure and leaves it to the sweep', () => {
    expect(deliver).toContain('[ask-wake] failed (sweep will retry)');
  });
});

/**
 * THE BACKSTOP THIS CHANGE LEANS ON, ASSERTED RATHER THAN BELIEVED.
 *
 * The comment above the old code claimed „the 5-minute unwoken-answer sweep
 * stays as the backstop". Today has been a long lesson in checking the claim
 * instead of the comment, so: the sweep exists, it runs on a timer, and its
 * worklist is every answered ask with no delivery recorded.
 */
describe('the sweep that makes it safe', () => {
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('runs on a timer', () => {
    expect(engine).toContain('void sweepUnwokenAnswers()');
    expect(engine).toMatch(/UNWOKEN_SWEEP_INTERVAL_MS\s*=\s*5 \* 60_000/);
  });

  it('picks up exactly the answers whose wake never landed', () => {
    expect(source).toContain('ta.wake_delivered_at IS NULL');
    expect(source).toContain("ta.status = 'answered'");
  });
});
