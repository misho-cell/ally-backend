import { dayOneEvent } from '../taskEngine.events';

/**
 * Tester 82699: every send was held by the recipients' daily limit, and the
 * reply still closed „როგორც კი ვინმე უპასუხებს, მაშინვე მოგწერ" — day one told
 * it to, in those exact words, whether anything went or not.
 */
describe('day one closes on „as soon as anyone answers" only when a question went', () => {
  const events = dayOneEvent();

  it.each([
    ['ka', 'მხოლოდ თუ კითხვა მართლა გაიგზავნა'],
    ['en', 'only if a question really went'],
    ['ru', 'только если вопрос действительно ушёл'],
    ['es', 'solo si una pregunta salió de verdad'],
  ] as const)('%s', (language, condition) => {
    expect(events[language]).toContain(condition);
  });
});
