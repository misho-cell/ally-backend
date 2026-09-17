import { relativeDayNote, resolveRelativeDays } from '../relativeDay';

/**
 * Ticket 20 row 141 — „tomorrow" in a goal title, read a week later.
 *
 * Thread 15815: goal 2971 was listed as „ლიკა ოსეფაშვილთან შეხვედრა (ხვალ,
 * 19:00)". That meeting was on 14 September. A relative day word frozen into a
 * title does not merely age — it names a future that has already happened.
 */

// 13 September 2026, 21:00 Tbilisi — when the goal was written.
const WRITTEN = new Date('2026-09-13T17:00:00Z');
// 17 September, the morning this was read.
const NOW = new Date('2026-09-17T08:00:00Z');

describe('resolveRelativeDays', () => {
  it('resolves the reported title to the day the meeting really was', () => {
    const out = resolveRelativeDays('ლიკა ოსეფაშვილთან შეხვედრა (ხვალ, 19:00)', WRITTEN, NOW);

    expect(out).toHaveLength(1);
    expect(out[0]?.word).toBe('ხვალ');
    expect(out[0]?.date).toContain('14');
    expect(out[0]?.past).toBe(true);
  });

  it('resolves each word against the day it was written, not today', () => {
    const words = resolveRelativeDays('დღეს და ხვალ და ზეგ და გუშინ', WRITTEN, NOW);

    expect(words.map((w) => w.word)).toEqual(['გუშინ', 'დღეს', 'ხვალ', 'ზეგ']);
    expect(words.map((w) => w.date.match(/\d+/)?.[0])).toEqual(['12', '13', '14', '15']);
  });

  it('knows a date that has not arrived yet is not past', () => {
    const soon = resolveRelativeDays('შეხვედრა ხვალ', NOW, NOW);

    expect(soon[0]?.past).toBe(false);
  });

  it('says nothing about a title with no day word in it', () => {
    expect(resolveRelativeDays('ნოტარიუსი ბინის ხელშეკრულებისთვის', WRITTEN, NOW)).toEqual([]);
  });

  /**
   * The defect family this codebase has met five times: a substring standing
   * in for a word. Both of these stems are the start of ordinary vocabulary,
   * and annotating them would be a confident wrong answer about somebody's
   * meeting.
   */
  describe('whole words only', () => {
    it('does not read „ზეგავლენა" (influence) as the day after tomorrow', () => {
      expect(resolveRelativeDays('მედიაზე ზეგავლენა', WRITTEN, NOW)).toEqual([]);
    });

    it('does not read „დღესასწაული" (a holiday) as today', () => {
      expect(resolveRelativeDays('დღესასწაულის ორგანიზება', WRITTEN, NOW)).toEqual([]);
    });

    it('does not fire inside an English word either', () => {
      expect(resolveRelativeDays('todays-plan yesterdays', WRITTEN, NOW)).toEqual([]);
    });

    it('still catches the word when punctuation follows it', () => {
      // The reported title is „(ხვალ, 19:00)" — a bracket before and a comma
      // after. A rule that needed whitespace would have missed the one case
      // this row is about.
      expect(resolveRelativeDays('(ხვალ, 19:00)', WRITTEN, NOW)).toHaveLength(1);
    });
  });
});

describe('the clause put beside a title', () => {
  it('names the date and says plainly that it has gone', () => {
    const note = relativeDayNote('შეხვედრა (ხვალ, 19:00)', WRITTEN, NOW);

    expect(note).toContain('ხვალ');
    expect(note).toContain('14');
    // Stated rather than left to arithmetic: „14 სექტემბერი" alone still needs
    // the reader to know today's date and compare, and comparing is the step
    // that went wrong.
    expect(note).toContain('უკვე გასული');
  });

  it('adds nothing at all to an ordinary title', () => {
    // Most goals carry no date, and they must not grow a clause explaining so.
    expect(relativeDayNote('ელექტრიკოსი რუსთავში', WRITTEN, NOW)).toBe('');
  });

  it('does not call a future date past', () => {
    expect(relativeDayNote('შეხვედრა ხვალ', NOW, NOW)).not.toContain('გასული');
  });
});
