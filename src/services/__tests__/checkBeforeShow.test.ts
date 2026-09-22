/**
 * Ticket 19 [22] / D217 — check first, then show.
 *
 * The final turn's text streamed to the screen and the content check ran after
 * it, so a blocked reply was shown and then withdrawn (Run 38, thread 14792).
 *
 * The founder was asked whether to close that at "2-4 seconds per such reply".
 * I put the real price to him through the tester before building it, because
 * the question and the change are not the same size: EVERY answer stops typing
 * out, not only the blocked ones. His answer, 15 September, 22:27 Tbilisi:
 * "yes".
 */
import { answerChunkHandler, answerStreamingSuppressed } from '../chat.service';

function spyHandler(suppressed: boolean, stopped?: () => boolean) {
  const seen = { text: 0, signal: 0, visible: [] as string[] };
  const handle = answerChunkHandler({
    suppressed,
    stopped,
    onText: () => (seen.text += 1),
    onSignal: () => (seen.signal += 1),
    onVisible: (c) => seen.visible.push(c),
  });
  return { seen, handle };
}

describe('a reply the checker has not seen yet', () => {
  it('does not reach the screen', () => {
    const { seen, handle } = spyHandler(true);

    handle('თორნიკე');
    handle(' აბულაძე');

    expect(seen.visible).toEqual([]);
  });

  it('keeps the heartbeat alive while the answer is being made', () => {
    // This is the half that makes it a fix rather than a silent screen. The
    // heartbeat fires only when nothing has reached the client recently, so a
    // suppressed chunk must NOT reset its clock — otherwise a long answer is
    // written in complete silence, which is not what was approved. The
    // tester's condition: the step line keeps showing.
    const { seen, handle } = spyHandler(true);

    handle('a');
    handle('b');
    handle('c');

    expect(seen.signal).toBe(0);
  });

  it('still tells the run that the turn produced text', () => {
    // A turn that ends up wanting tools moves its narration to the steps
    // panel, and that only happens if the run knows text was produced.
    const { seen, handle } = spyHandler(true);

    handle('ვნახავ ეკეს პროფილს');

    expect(seen.text).toBe(1);
  });
});

describe('with streaming switched back on', () => {
  it('behaves exactly as it did before', () => {
    const { seen, handle } = spyHandler(false);

    handle('ერთი');
    handle(' ორი');

    expect(seen.visible).toEqual(['ერთი', ' ორი']);
    expect(seen.signal).toBe(2);
    expect(seen.text).toBe(2);
  });
});

/**
 * THE STOP IS READ HERE TOO, AND NOTHING HELD IT.
 *
 * Sabotage, 22 September: `if (opts.stopped?.() === true) return;` removed —
 * 3,746 tests passed. The line's own comment is an incident report, which is
 * what makes its being untested worth a file of its own.
 *
 * Thread 16840, the tester: at 19:07:59 the server correctly wrote „there is
 * no goal to stop in this conversation", and ten seconds later the model said
 * „now you have only one open goal left … I am closing it." It closed nothing
 * — the write was refused and 3433 is still open. But the owner READ it.
 *
 * The withholding that already existed runs where the reply is STORED, and the
 * answer reaches the screen token by token long before that. Stored and shown
 * are two different acts, and only one of them was covered. This is the other
 * one, and it is the one the owner's eyes are on.
 */
describe('after the owner has stopped it, the rest of the answer is not shown', () => {
  const STOPPED = (): boolean => true;
  const RUNNING = (): boolean => false;

  it('shows nothing once the run is stopped', () => {
    const { seen, handle } = spyHandler(false, STOPPED);

    handle('ახლა ერთი ღია მიზანი გაქვს');
    handle(' — ვხურავ');

    expect(seen.visible).toEqual([]);
  });

  it('raises no heartbeat either, because nothing reached the client', () => {
    // onSignal means „something got to the screen". Saying so when the chunk
    // was withheld would make the silence look like a reply in progress.
    const { seen, handle } = spyHandler(false, STOPPED);

    handle('a');
    handle('b');

    expect(seen.signal).toBe(0);
  });

  it('still counts that the turn produced text', () => {
    // Same reason as suppression: a turn that turns out to want tools moves
    // its narration to the steps panel, and that needs the run to know text
    // was made. Stopping the SHOWING must not corrupt the bookkeeping.
    const { seen, handle } = spyHandler(false, STOPPED);

    handle('ვხურავ');

    expect(seen.text).toBe(1);
  });

  /**
   * THE ONE THAT MATTERS MOST. The stop arrives mid-answer — that is the only
   * way it ever arrives. So the flag is read per chunk, and the words written
   * before it are kept while everything after it is dropped. A check made once
   * at the start would pass every test above and fail the only real case.
   */
  it('cuts at the moment of the stop, keeping what was already read', () => {
    let stopped = false;
    const { seen, handle } = spyHandler(false, () => stopped);

    handle('ვნახავ');
    handle(' ეკეს');
    stopped = true;
    handle(' პროფილს');
    handle(' და ვხურავ');

    expect(seen.visible).toEqual(['ვნახავ', ' ეკეს']);
  });

  /** The control. Without it „nothing shown" would pass for a broken handler. */
  it('shows everything while the run is still going', () => {
    const { seen, handle } = spyHandler(false, RUNNING);

    handle('ერთი');

    expect(seen.visible).toEqual(['ერთი']);
  });

  /**
   * A caller that passes no stop at all — the engine's own runs — must behave
   * exactly as before. `stopped?.() === true` is written that way on purpose:
   * absent is not stopped, and neither is a callback that answers anything but
   * a literal true.
   */
  it('treats an absent stop as not stopped', () => {
    const { seen, handle } = spyHandler(false, undefined);

    handle('ერთი');

    expect(seen.visible).toEqual(['ერთი']);
  });
});

describe('the switch', () => {
  const original = process.env.ANSWER_STREAMING;
  afterEach(() => {
    if (original === undefined) delete process.env.ANSWER_STREAMING;
    else process.env.ANSWER_STREAMING = original;
  });

  it('checks first by default — that is what the founder approved', () => {
    delete process.env.ANSWER_STREAMING;
    expect(answerStreamingSuppressed()).toBe(true);
  });

  it('reverts on one variable, with no deploy', () => {
    process.env.ANSWER_STREAMING = 'on';
    expect(answerStreamingSuppressed()).toBe(false);
  });

  it('only that one word turns it back on', () => {
    // A typo must fail SAFE — towards the approved behaviour, not away from it.
    process.env.ANSWER_STREAMING = 'true';
    expect(answerStreamingSuppressed()).toBe(true);
    process.env.ANSWER_STREAMING = '';
    expect(answerStreamingSuppressed()).toBe(true);
  });
});
