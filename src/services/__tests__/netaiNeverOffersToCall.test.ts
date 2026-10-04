import { readFileSync } from 'fs';
import { join } from 'path';
import { relatedProfessionWords } from '../professionFamilies';
import { withoutCallOffer } from '../replyGuards';

/**
 * The tester's 1133 (V1, 36539): three plumbers with phones, then „გინდა,
 * რომელიმეს დავურეკო დღესვე?" — Netai cannot place a call. And the owner's own
 * „ვანო ხელოსანი" was never searched for a dripping tap.
 */
const LIST = 'დავითი, სანტექნიკოსი, ვაკე.';

describe('a closing offer to place a call', () => {
  it('is replaced with the truth, and what came before stays', () => {
    const reply = `${LIST}\n\nგინდა, რომელიმეს დავურეკო დღესვე თუ თვითონ შეუკავშირდები?`;
    expect(withoutCallOffer(reply, 'ka')).toBe(
      `${LIST}\n\nდარეკვა ჩემგან არ შეიძლება — ტელეფონები ზემოთაა და შეგიძლია თვითონ დაუკავშირდე.`,
    );
  });

  it('is caught in English', () => {
    expect(withoutCallOffer('Two plumbers are listed. Shall I call one of them today?', 'en')).toBe(
      'Two plumbers are listed.\n\nI cannot place calls myself — the numbers are above, so you can call them directly.',
    );
  });

  it('leaves the owner calling, and a call offer earlier in the reply, alone', () => {
    const ownerCalls = `${LIST} შეგიძლია თვითონ დაურეკო.`;
    expect(withoutCallOffer(ownerCalls, 'ka')).toBe(ownerCalls);
    const earlier = 'I will call it a day here. Here are two plumbers.';
    expect(withoutCallOffer(earlier, 'en')).toBe(earlier);
  });

  /** The tester's 1137 (37101): the owner's own „რომ გელას დავურეკო" echoed back. */
  it('leaves a reminder that repeats the owner’s own words alone', () => {
    const reply =
      'ხვალ 10:00-ზე შეხსენებას ვერ დაგიგეგმავ. ტელეფონში დააყენე შეხსენება, რომ გელას დავურეკო.';
    expect(withoutCallOffer(reply, 'ka')).toBe(reply);
  });

  it('still catches a promise to call that does not ask', () => {
    expect(withoutCallOffer('სამივე ზემოთაა. დღესვე დავურეკავ ერთ-ერთს.', 'ka')).toContain(
      'დარეკვა ჩემგან არ შეიძლება',
    );
  });

  it('runs on every final reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('effectiveFinal = withoutCallOffer(effectiveFinal, language);');
  });
});

describe('a plumber search', () => {
  it('also asks for the handyman the owner saved', () => {
    expect(relatedProfessionWords('სანტექნიკოსი')).toContain('ხელოსანი');
    expect(relatedProfessionWords('plumber')).toContain('სანტექნიკოსი');
  });
});
