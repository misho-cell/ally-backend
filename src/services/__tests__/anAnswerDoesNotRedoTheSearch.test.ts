import {
  ArrivedAnswer,
  buildShownAnswersWakeEvent,
  buildShownRelayAnswerWakeEvent,
} from '../taskAsks.service';

/**
 * 1489 (the master test run's RW-015, conv 43247; §99.2): after a helper's
 * „no", the answer-event run searched the owner's contacts again for the same
 * word and wrote „nobody there either". The note now says not to.
 */
const NO_SEARCH_AGAIN = 'რაც ამ მიზანზე უკვე მოძებნე, თავიდან ნუ მოძებნი და ნუ ახსენებ';

describe('the note under an answer shown on the card', () => {
  it('asks for the next step, not the search again', () => {
    const answer: ArrivedAnswer = {
      answer: 'სამწუხაროდ, სანტექნიკოსს არ იცნობს.',
      fromName: 'ბახვა',
      verbatim: false,
    };
    const shown = buildShownAnswersWakeEvent([answer]);
    expect(shown).toContain(NO_SEARCH_AGAIN);
    expect(shown).toContain('შემდეგ გააგრძელე დავალება.');
    const relayed = buildShownRelayAnswerWakeEvent('ბახვა', 'ნინო');
    expect(relayed).toContain(NO_SEARCH_AGAIN);
    expect(relayed.endsWith('შემდეგ გააგრძელე დავალება.')).toBe(true);
  });
});
