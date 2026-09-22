/**
 * TWO SENTENCES THE PRODUCT SAID TO REAL PEOPLE AND NOTHING KEPT, measured on
 * the live build on 22 September and changed on Misho's word the same day.
 *
 * They are held in one file because they are one fault. Each names a condition
 * the owner can check — „when it is back", „you will not be asked" — and in
 * each case the condition arrived and nothing happened.
 */
import { RUN_STRINGS, RunLanguage } from '../runLanguage';
import { NOTE_SCOPE } from '../userNotes.service';

const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

/**
 * ONE — „Trying again now will not help; I WILL CARRY ON THE MOMENT IT IS BACK."
 *
 * Anthropic was dark from 11:15:21 to 13:40:27. Two goals died inside it,
 * threads 21784 and 21789. At 13:49 — an hour and three quarters after the
 * service returned — both were still `failed`, still two messages long, and
 * `next_wake_at` was NULL. The condition the sentence named arrived, and the
 * sentence was false.
 *
 * Nothing retries a dead run and nothing should: `messageHeldNoTokens` decided
 * this same question for the empty wallet — „re-running somebody's message
 * hours later, unasked, could send real messages to real people on a decision
 * they have had all night to change their mind about."
 *
 * So the sentence asks for something the owner can actually cause.
 */
describe('the outage sentence asks instead of promising', () => {
  it.each(LANGUAGES)('%s tells them to send it again', (lang) => {
    const text = RUN_STRINGS[lang].serviceUnavailable;
    const asks = {
      ka: 'გამომიგზავნე ხელახლა',
      en: 'send it to me again',
      ru: 'отправь мне сообщение ещё раз',
      es: 'envíamelo otra vez',
    }[lang];

    expect(text).toContain(asks);
  });

  /**
   * The clause that was measured false, in the words each language used for
   * it. A regression here is not a style change: it is the product telling
   * somebody to wait for something that will not come.
   */
  it.each(LANGUAGES)('%s no longer promises to carry on by itself', (lang) => {
    const text = RUN_STRINGS[lang].serviceUnavailable;
    const promise = {
      ka: 'დაუყოვნებლივ გავაგრძელებ',
      en: 'I will carry on the moment it is back',
      ru: 'как только он вернётся, я сразу продолжу',
      es: 'en cuanto vuelva, sigo de inmediato',
    }[lang];

    expect(text).not.toContain(promise);
  });

  /** The half that was always right: it takes the blame and it stops the hammering. */
  it.each(LANGUAGES)('%s still says it is our fault and that retrying now is useless', (lang) => {
    const text = RUN_STRINGS[lang].serviceUnavailable;
    const ours = {
      ka: 'ჩვენი მხრიდანაა',
      en: 'that is on us',
      ru: 'на нашей стороне',
      es: 'es cosa nuestra',
    }[lang];

    expect(text).toContain(ours);
    expect(text.length).toBeGreaterThan(60);
  });

  /**
   * `restartedMidRun` has asked rather than promised since the day it was
   * written. The two describe the same experience — an answer that will not
   * arrive — and a reader who meets both should not be told two different
   * things about what to do next.
   */
  it.each(LANGUAGES)('%s agrees with the restart sentence about what to do next', (lang) => {
    const strings = RUN_STRINGS[lang];
    const again = { ka: 'ხელახლა', en: 'again', ru: 'ещё раз', es: 'otra vez' }[lang];

    expect(strings.serviceUnavailable).toContain(again);
    expect(strings.restartedMidRun).toContain(again);
  });
});

/**
 * TWO — „Noted and saved, no plumbing-related questions will be sent your way
 * going forward."
 *
 * The tester timed it twice. A user tells their own assistant not to be asked
 * about plumbers at 14:11:49; a different user's plan names her at 14:13:43;
 * the ask is in her chat at 14:14:52. Two minutes thirty, nothing capped.
 *
 * The note is real and reaches nobody else: every read of `user_notes` is
 * `WHERE user_id = $1`, and `text` is free prose with no topic in it. The
 * boundary needs a store the database does not have, which is the founder's
 * decision and is not taken here. The promise is what is fixed here.
 */
describe('a saved note does not claim to stop anything', () => {
  it('says plainly that no other assistant can see it', () => {
    expect(NOTE_SCOPE).toContain('own assistant only');
    expect(NOTE_SCOPE).toContain('No other person’s assistant can see it');
  });

  it('forbids the promise in the words the model actually used', () => {
    expect(NOTE_SCOPE).toContain('Do NOT tell them it will stop');
    expect(NOTE_SCOPE).toContain('no longer be asked');
  });

  /**
   * The note IS saved, and a confirmation is owed. „Say nothing" would be a
   * second false impression — that the line was not recorded — so the scope
   * asks for the confirmation and bounds it.
   */
  it('still asks for the save to be confirmed', () => {
    expect(NOTE_SCOPE).toMatch(/^Saved\./);
    expect(NOTE_SCOPE).toContain('Confirm in one short line');
  });
});
