import {
  incomingRequestOpening,
  incomingRequestTitle,
  introAnsweredLine,
  introAnsweredPush,
  introMediatorFollowUp,
  introOutcomeLine,
  introRequesterExtra,
  introSnoozedLine,
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

/**
 * The two captions the introduction writes when a thread MOVES — snoozed on
 * the mediator's side, answered on the requester's.
 *
 * They were the last Georgian in this flow and they were invisible until
 * 20 September, when the client started drawing `status_line` instead of its
 * own generic label. Everything beside them had been in the reader's language
 * since the morning; these had not, so a mediator reading English would have
 * had „გადადებულია" under an English thread.
 */
describe('the captions, once the client started drawing them', () => {
  it.each(OTHERS)('%s carries no Georgian', (language) => {
    expect(introSnoozedLine(language)).not.toMatch(GEORGIAN);
    expect(introAnsweredLine(language)).not.toMatch(GEORGIAN);
  });

  it('says two different things — one is a wait, the other is news', () => {
    for (const language of [...OTHERS, 'ka' as const]) {
      expect(introSnoozedLine(language)).not.toBe(introAnsweredLine(language));
    }
  });

  it('ka keeps the words it already had', () => {
    expect(introSnoozedLine('ka')).toBe('გადადებულია');
    expect(introAnsweredLine('ka')).toBe('პასუხი მოვიდა');
  });
});

/**
 * The rest of the accept path — what the REQUESTER and the MEDIATOR read once
 * the answer is in. Found by reading ahead while the seat was mid-test, after
 * the same read caught three Georgian buttons in the channel refusal.
 *
 * `introduction.service.ts` now has NO Georgian text and no `geoName` import
 * at all: every sentence it writes comes from this file, in the reader's own
 * language. Three readers, three languages, none required to share one.
 */
describe('the accept path, on all three sides', () => {
  describe.each(OTHERS)('%s', (language) => {
    it('the requester is told the outcome without Georgian', () => {
      for (const accepted of [true, false]) {
        for (const direct of [true, false]) {
          expect(introOutcomeLine(language, 'Dato', accepted, direct, null)).not.toMatch(GEORGIAN);
        }
      }
    });

    it('the requester’s extra carries the number and no Georgian', () => {
      const withNumber = introRequesterExtra(
        language,
        'Nino',
        'Dato',
        '+995555000005',
        false,
        true,
      );
      expect(withNumber).toContain('+995555000005');
      expect(withNumber).not.toMatch(GEORGIAN);
    });

    it('the mediator’s closing line carries no Georgian', () => {
      expect(introMediatorFollowUp(language, 'Nino', 'Dato', '+9955', false, true)).not.toMatch(
        GEORGIAN,
      );
      expect(introMediatorFollowUp(language, 'Nino', 'Dato', null, true, false)).not.toMatch(
        GEORGIAN,
      );
    });

    it('the push carries no Georgian either — it is all they see', () => {
      const push = introAnsweredPush(language, 'Dato', true);
      expect(push.title).not.toMatch(GEORGIAN);
      expect(push.body).not.toMatch(GEORGIAN);
    });
  });

  /**
   * „We could not find a number" and „they chose to stay in the middle"
   * produce the same silence and mean opposite things. A reader who cannot
   * tell them apart chases the mediator for a contact deliberately withheld.
   */
  it('never lets a withheld number read like a missing one', () => {
    for (const language of [...OTHERS, 'ka' as const]) {
      const withheld = introRequesterExtra(language, 'Nino', 'Dato', null, true, false);
      const notFound = introRequesterExtra(language, 'Nino', 'Dato', null, false, false);
      expect(withheld).not.toBe(notFound);
    }
  });

  it('a quoted answer survives into every language, and absence stays absent', () => {
    for (const language of [...OTHERS, 'ka' as const]) {
      expect(introOutcomeLine(language, 'Dato', true, true, 'any time this week')).toContain(
        'any time this week',
      );
      expect(introOutcomeLine(language, 'Dato', true, true, null)).not.toContain('„');
    }
  });

  it('ka keeps its inflection on every one of them', () => {
    // 'on' — „დათოზე გაცნობის მოთხოვნა", not the bare name.
    expect(introOutcomeLine('ka', 'დათო', true, false, null)).toContain('დათოზე');
    expect(introRequesterExtra('ka', 'ნინო', 'დათო', null, true, false)).toContain('ნინომ');
    expect(introMediatorFollowUp('ka', 'ნინო', 'დათო', null, true, false)).toContain('ნინოს');
  });
});
