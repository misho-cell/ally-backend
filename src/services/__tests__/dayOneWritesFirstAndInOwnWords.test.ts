import {
  DAY_ONE_EVENT,
  DAY_ONE_FIRST_PASS,
  DAY_ONE_FIRST_PASS_ON,
  dayOneEvent,
} from '../taskEngine.events';

const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;

/** 3070: day one's first question is refused and rewritten in 31 of 71 runs. */
describe('day one writes first, in its own words (3070)', () => {
  it('is ON since Misho’s yes (§131): day one carries the sentences in every language', () => {
    expect(DAY_ONE_FIRST_PASS_ON).toBe(true);
    for (const lang of LANGUAGES) {
      expect(DAY_ONE_EVENT[lang].endsWith(DAY_ONE_FIRST_PASS[lang])).toBe(true);
    }
    expect(dayOneEvent(false).ka).not.toContain(DAY_ONE_FIRST_PASS.ka);
  });

  it('when ON, ends every language’s event with its own sentences', () => {
    const on = dayOneEvent(true);
    const off = dayOneEvent(false);
    for (const lang of LANGUAGES) {
      expect(on[lang]).toBe(`${off[lang]} ${DAY_ONE_FIRST_PASS[lang]}`);
    }
  });

  it('says questions before searches, nothing added, nothing copied', () => {
    expect(DAY_ONE_FIRST_PASS.ka).toContain('ჯერ კითხვები გაგზავნე');
    expect(DAY_ONE_FIRST_PASS.ka).toContain('არაფერი დაამატო');
    expect(DAY_ONE_FIRST_PASS.ka).toContain('სიტყვასიტყვით არ გადაიტანო');
  });
});
