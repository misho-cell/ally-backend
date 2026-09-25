import { goalTitleFrom, collapseARepeatedWall } from '../goalIntent';

/**
 * ⚠️ A WALL OF ONE REPEATED WORD IS NOT A TITLE — the founder's own account.
 *
 * Android's Chrome does not UPDATE one dictation entry as a sentence grows; it
 * ADDS one per update, each carrying a longer prefix of the same words. Read
 * faithfully and joined, it builds a wall — and two of them became GOALS on
 * the founder's own account on 25 September:
 *
 *   goal 10133  „პოლიტიკური პოლიტიკური პოლიტიკური პოლიტიკური …"
 *   goal 10132  „ინტერნეტის ინტერნეტის ინტერნეტის ინტერნეტის …"
 *
 * The app team has fixed the microphone and that closes the SOURCE. It does
 * not close this. The server took a forty-word repetition, wrote it into the
 * column the sidebar shows and the stop line quotes back, and asked nothing.
 * Any other client, or a paste, does it again.
 *
 * Three exist on the live base, all on one account, 16 to 25 September. The
 * number is small; the point is that nothing was watching.
 */
describe('a repeated word collapses to the word', () => {
  it('collapses the founder’s own two', () => {
    const wall = 'პოლიტიკური '.repeat(12).trim();

    expect(collapseARepeatedWall(wall)).toBe('პოლიტიკური');
  });

  it('collapses it through the title builder, which is what is stored', () => {
    const wall = 'ინტერნეტის '.repeat(10).trim();

    expect(goalTitleFrom(wall)).toBe('ინტერნეტის');
    expect(goalTitleFrom(wall)).not.toContain('…');
  });

  /** A growing dictation leaves the word AND a filler; keep the one with meaning. */
  it('keeps the word that carries the meaning, not the article', () => {
    const wall = 'a electrician '.repeat(9).trim();

    expect(collapseARepeatedWall(wall)).toBe('electrician');
  });
});

describe('what it must not touch', () => {
  /**
   * The direction that matters. Collapsing a real sentence would destroy a
   * goal, which is far worse than a wall — so the rule needs a LONG string
   * made of at most two distinct words before it does anything.
   */
  it('leaves a real goal alone', () => {
    const real = 'I need a reliable electrician in Vake for rewiring an old flat';

    expect(collapseARepeatedWall(real)).toBe(real);
    expect(goalTitleFrom(real)).toBe(real);
  });

  it('leaves a short repetition alone — people do say things twice', () => {
    const emphasis = 'ძალიან ძალიან მჭირდება';

    expect(collapseARepeatedWall(emphasis)).toBe(emphasis);
  });

  it('leaves a long sentence that merely repeats one word', () => {
    const real = 'I need a plumber because the plumber I had before was a bad plumber';

    expect(collapseARepeatedWall(real)).toBe(real);
  });

  /** Three distinct words is a sentence, however long and however repetitive. */
  it('needs at most two distinct words before it acts', () => {
    const three = 'alpha beta gamma '.repeat(8).trim();

    expect(collapseARepeatedWall(three)).toBe(three);
  });
});
