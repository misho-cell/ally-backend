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

function spyHandler(suppressed: boolean) {
  const seen = { text: 0, signal: 0, visible: [] as string[] };
  const handle = answerChunkHandler({
    suppressed,
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
