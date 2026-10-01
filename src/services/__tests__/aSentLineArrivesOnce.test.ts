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

/** The tester's 995 / 996: each side restated the server line in other words. */
describe('a restatement in other words', () => {
  it('drops „Done, they will be connected" on the mediator side', () => {
    expect(
      withoutSentRestatement("Done, they'll be connected directly.", SentSide.Mediator, 'en'),
    ).toBe('If you need anything else, I am here.');
    expect(
      withoutSentRestatement(
        "Done, you're connecting them directly with Sandro.",
        SentSide.Mediator,
        'en',
      ),
    ).toBe('If you need anything else, I am here.');
  });

  it("drops the mediator's notification setting on the asker side", () => {
    const reply =
      'ვინაიდან მას შეტყობინებები გამორთული აქვს, პასუხს მაშინვე ვერ ვნახავთ, მაგრამ Netai-ს გახსნისას დაინახავს. სანამ ველოდებით, ვებშიც ვეძებ.';

    expect(withoutSentRestatement(reply, SentSide.Asker, 'ka')).toBe(
      'სანამ ველოდებით, ვებშიც ვეძებ.',
    );
  });

  it('keeps a connection sentence on the asker side, where no close line says it', () => {
    const reply = 'They will be connected once Nino agrees.';

    expect(withoutSentRestatement(reply, SentSide.Asker, 'en')).toBe(reply);
  });
});
