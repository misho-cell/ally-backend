import { detectRunLanguage, languageOfConversation } from '../runLanguage';

/**
 * Ticket 20 row 155 — „Ok" turned a Georgian conversation English.
 *
 * Thread 16539, Lika's meeting request, read end to end:
 *
 *   11:41:19  the ask, in Georgian, 174 characters
 *   12:06:46  the owner replies „Ok"
 *   12:07:13  gpt-5.6-terra: „I would send: “Yes, tomorrow, 18 September at
 *             13:00 online works for me.” Send it, and should I handle similar
 *             meeting requests this way in future?" — 148 characters, not one
 *             Georgian letter
 *   12:09:06  the owner writes „გაუგზავნე"
 *   12:09:40  and the next reply is Georgian again
 *
 * The script guard in finalAnswer.service refuses a Latin-only reply in a
 * Georgian thread and would have refused this one. It was never asked: the
 * run's language came from the latest message alone, and „Ok" is two Latin
 * characters.
 */
describe('languageOfConversation', () => {
  const GEORGIAN_ASK =
    'Lika Ose-ის ასისტენტი გეკითხება: ხვალ, 18 სექტემბერს, 13:00 საათზე შევხვდეთ ონლაინ?';

  it('does not let „Ok" make a Georgian conversation English — thread 16539', () => {
    expect(detectRunLanguage('Ok')).toBe('en');

    expect(languageOfConversation('Ok', [GEORGIAN_ASK])).toBe('ka');
  });

  it('is right in the other direction too, which is why it is a fallback', () => {
    // „Ok" in an English thread finds English behind it. Nothing here is a
    // Georgian special case.
    expect(languageOfConversation('Ok', ['Could you introduce me to someone at TBC?'])).toBe('en');
  });

  it('lets a real English sentence switch the conversation', () => {
    expect(
      languageOfConversation('Please answer me in English from now on, thank you', [GEORGIAN_ASK]),
    ).toBe('en');
  });

  it('lets any Georgian word switch it back, however short', () => {
    // A positive script signal needs no length: „გაუგზავნე" is nine letters
    // and it is unambiguous.
    expect(languageOfConversation('გაუგზავნე', ['Could you introduce me to someone?'])).toBe('ka');
  });

  it('reads past the assistant’s own turns to the last message carrying a language', () => {
    // History arrives newest first; an empty or Latin-only assistant line must
    // not be mistaken for the conversation's language.
    expect(languageOfConversation('yes', ['', 'Sent.', GEORGIAN_ASK])).toBe('ka');
  });

  it('falls back to the message itself when nothing before it carries a language', () => {
    expect(languageOfConversation('ok', [])).toBe('en');
    expect(languageOfConversation('ok', ['', 'hi'])).toBe('en');
  });

  it('keeps Russian and Spanish working the same way', () => {
    expect(languageOfConversation('ok', ['Привет, мне нужен юрист'])).toBe('ru');
    expect(languageOfConversation('ok', ['Necesito un abogado, ¿puedes ayudarme?'])).toBe('es');
  });
});
