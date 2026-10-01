/**
 * Plate v301 G5 (the tester's 992): „sent" reached both sides twice — the
 * server's line, then the model's restatement seconds later.
 */
import { SentSide, withoutSentRestatement } from '../sentLineGuard';

describe('withoutSentRestatement', () => {
  it('drops the restatement and keeps what else the reply says', () => {
    const reply = 'მოთხოვნა გაიგზავნა ნინოსთვის. სანამ პასუხს ველოდებით, ვებშიც მოვძებნი.';

    expect(withoutSentRestatement(reply, SentSide.Asker, 'ka')).toBe(
      'სანამ პასუხს ველოდებით, ვებშიც მოვძებნი.',
    );
  });

  it('puts one line in place of a reply that was only the repeat', () => {
    expect(withoutSentRestatement('გადაცემულია.', SentSide.Mediator, 'ka')).toBe(
      'თუ კიდევ რამე დაგჭირდება, აქ ვარ.',
    );
    expect(withoutSentRestatement('Your request was sent.', SentSide.Asker, 'en')).toBe(
      'I will tell you the moment the answer comes.',
    );
  });

  it('leaves a reply that says nothing went exactly as it was', () => {
    const reply = 'კარგი.\n\nსხვა რამეში დაგეხმარო?';

    expect(withoutSentRestatement(reply, SentSide.Asker, 'ka')).toBe(reply);
  });

  it('keeps a paragraph break around a dropped sentence', () => {
    const reply = 'გადავეცი შენი პასუხი.\n\nპირველი.\n\nმეორე.';

    expect(withoutSentRestatement(reply, SentSide.Mediator, 'ka')).toBe('პირველი.\n\nმეორე.');
  });
});
