import { createSafeTextStreamer } from '../answerStream';
import { scrubText } from '../privacyScrub';

// Collect everything the streamer emits, in order.
function collect(): { emit: (c: string) => void; text: () => string } {
  const chunks: string[] = [];
  return { emit: (c: string): void => void chunks.push(c), text: (): string => chunks.join('') };
}

describe('createSafeTextStreamer', () => {
  it('emits plain text progressively and in full after flush', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);
    const answer = 'Here are three people who could introduce you to the bank director.';
    for (const ch of answer) s.push(ch);
    s.flush();
    expect(sink.text()).toBe(answer);
  });

  it('is append-only — the concatenated chunks equal the scrubbed full text', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);
    const raw = 'call me on +995 599 12 34 56 tomorrow';
    for (const ch of raw) s.push(ch);
    s.flush();
    expect(sink.text()).toBe(scrubText(raw));
  });

  it('never streams a phone number split across deltas unscrubbed', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);
    // A phone arriving digit-by-digit across many deltas must never surface raw.
    const deltas = ['reach him at +', '995', '599', '12', '34', '56', ' — he expects you'];
    for (const d of deltas) s.push(d);
    s.flush();
    const out = sink.text();
    expect(out).not.toContain('995599123456');
    expect(out).not.toContain('+995');
    // The safe words around it still come through.
    expect(out).toContain('reach him at');
    expect(out).toContain('he expects you');
  });

  it('holds back the trailing margin until more text proves it safe (no premature emit)', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);
    s.push('short'); // shorter than the holdback → nothing emitted yet
    expect(sink.text()).toBe('');
    s.flush(); // flush releases the remainder
    expect(sink.text()).toBe('short');
  });
});
