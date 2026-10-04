import { isFreeAnswerLine, RUN_STRINGS, thisOneWasOnUs } from '../runLanguage';

/**
 * The tester's 37621: two token bubbles ten seconds apart — the free answer's
 * „(ეს პასუხი ჩვენზეა — ტოკენები ნულზეა…)" and the engine's „work is paused".
 */
describe('a free answer’s token line', () => {
  it('is recognised in each language, and with the dash the storage scrub rewrites', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(isFreeAnswerLine(thisOneWasOnUs(language, 'Monday'))).toBe(true);
    }
    expect(isFreeAnswerLine('(ეს პასუხი ჩვენზეა, ტოკენები ნულზეა.)')).toBe(true);
  });

  it('is not the engine’s own pause, or an ordinary answer', () => {
    expect(isFreeAnswerLine(RUN_STRINGS.ka.goalPausedNoTokens)).toBe(false);
    expect(isFreeAnswerLine('ვიპოვე ირმა ფეიქრიშვილი.')).toBe(false);
  });
});
