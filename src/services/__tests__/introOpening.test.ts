import {
  incomingRequestOpening,
  incomingRequestTitle,
  outgoingRequestOpening,
  outgoingRequestTitle,
} from '../introOpening';
import { RunLanguage } from '../runLanguage';

/**
 * The ask wrapper was localised on 19 September and the INTRODUCTION was named
 * in the same breath as still Georgian. The seat's 290 had sighted it there
 * first and called it „the single most important message this product sends",
 * which is right: it is the one where a stranger decides whether to put their
 * name behind you.
 *
 * Every word of both threads was hardcoded Georgian — including THE TITLE,
 * which an English account sees in its sidebar without opening anything.
 */
const GEORGIAN = /[Ⴀ-ჿ]/;
const OTHERS: RunLanguage[] = ['en', 'ru', 'es'];

describe('the introduction arrives in the reader’s own language', () => {
  describe.each(OTHERS)('%s', (language) => {
    it('the mediator’s title carries no Georgian', () => {
      expect(incomingRequestTitle(language, 'Nino', 'Dato', false)).not.toMatch(GEORGIAN);
      expect(incomingRequestTitle(language, 'Nino', 'Dato', true)).not.toMatch(GEORGIAN);
    });

    it('the mediator’s opening carries no Georgian, with a message and without', () => {
      expect(incomingRequestOpening(language, 'Nino', 'Dato', null, false)).not.toMatch(GEORGIAN);
      expect(incomingRequestOpening(language, 'Nino', 'Dato', 'hello', true)).not.toMatch(GEORGIAN);
    });

    it('the requester’s title and opening carry no Georgian', () => {
      expect(outgoingRequestTitle(language, 'Nino', 'Dato', false)).not.toMatch(GEORGIAN);
      expect(outgoingRequestTitle(language, 'Nino', 'Dato', true)).not.toMatch(GEORGIAN);
      expect(outgoingRequestOpening(language, 'Nino', 'Dato', false)).not.toMatch(GEORGIAN);
      expect(outgoingRequestOpening(language, 'Nino', 'Dato', true)).not.toMatch(GEORGIAN);
    });

    it('both names survive into every sentence that should carry them', () => {
      const viaMediator = incomingRequestOpening(language, 'Nino', 'Dato', null, false);
      expect(viaMediator).toContain('Nino');
      expect(viaMediator).toContain('Dato');
    });

    it('the requester’s own message is quoted when there is one, and nothing is quoted when there is not', () => {
      expect(incomingRequestOpening(language, 'Nino', 'Dato', 'we met at Axel', false)).toContain(
        'we met at Axel',
      );
      expect(incomingRequestOpening(language, 'Nino', 'Dato', null, false)).not.toContain('_"');
    });
  });

  /**
   * Task 18's distinction, and it is not cosmetic: in the direct case the
   * reader IS the person being introduced, so „X wants you to introduce them
   * to Y" would be asking somebody to introduce a stranger to themselves
   * (live row #793).
   */
  it('a direct request never asks the reader to introduce somebody to themselves', () => {
    for (const language of [...OTHERS, 'ka' as const]) {
      const direct = incomingRequestOpening(language, 'Nino', 'Dato', null, true);
      expect(direct).toContain('Nino');
      expect(direct).not.toContain('Dato');
    }
  });

  /** Georgian is unchanged, inflection and all — it is what every reader got until today. */
  describe('ka', () => {
    it('still inflects the names, which is the reason this is not a string table', () => {
      // „ნინოს შენი გაცნობა უნდა" — the dative, not the bare name.
      expect(incomingRequestOpening('ka', 'ნინო', 'დათო', null, true)).toContain('ნინოს');
      expect(outgoingRequestOpening('ka', 'ნინო', 'დათო', false)).toContain('ნინოსთვის');
    });

    it('keeps the wording every Georgian reader has had all along', () => {
      expect(incomingRequestOpening('ka', 'ნინო', 'დათო', null, false)).toContain('დაეხმარები?');
      expect(incomingRequestTitle('ka', 'ნინო', 'დათო', true)).toBe('ნინო → შენ');
      expect(outgoingRequestTitle('ka', 'ნინო', 'დათო', true)).toBe('გაცნობა: დათო');
    });
  });

  /**
   * The two readers need not share a language: the mediator may write English
   * and the requester Georgian. They get one thread each, in their own.
   */
  it('the two sides are asked separately', () => {
    expect(incomingRequestTitle('en', 'Nino', 'Dato', true)).toBe('Nino → you');
    expect(outgoingRequestTitle('ka', 'Nino', 'Dato', true)).toBe('გაცნობა: Dato');
  });
});
