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

  it('streams ordinary prose with NO lag — nothing is held back', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);

    s.push('გამარჯობა');

    // The flat 40-char margin used to swallow six or seven Georgian words, so
    // the answer visibly stopped mid-word and caught up later (Lika, 12 Aug).
    expect(sink.text()).toBe('გამარჯობა');
  });

  it('holds a trailing run that could still become a number, and only that', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);

    s.push('დარეკე ნომერზე 599');
    // The digits are withheld: they may still be growing into a full number.
    expect(sink.text()).toBe('დარეკე ნომერზე');

    s.push(' და მკითხე');
    // Proven safe by what followed — released, with the prose that came after.
    expect(sink.text()).toBe('დარეკე ნომერზე 599 და მკითხე');
  });

  it('holds a bare "+" too — scrubbing rewrites from there once the digits land', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);

    s.push('write to +');

    expect(sink.text()).toBe('write to');
  });

  it('reports what the user actually saw, for narration that must move to the steps panel', () => {
    const sink = collect();
    const s = createSafeTextStreamer(sink.emit);

    s.push('ვეძებ სტომატოლოგს');
    s.flush();

    expect(s.emittedText()).toBe('ვეძებ სტომატოლოგს');
    expect(s.emittedText()).toBe(sink.text());
  });
});
