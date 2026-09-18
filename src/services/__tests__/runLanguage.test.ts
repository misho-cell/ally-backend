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

/**
 * An engine event must never decide the run's language — thread 17393,
 * 18 September.
 *
 * The owner typed his need in ENGLISH, the split gave it its own conversation,
 * and the opening line landed there in English at 09:09:48. The plan turn then
 * woke it with „[მოვლენა] მიზანი ახლახან შეინახა…" — the server's own
 * scaffolding, Georgian by design because it is addressed to the model — and
 * from 09:12:54 the plan card, the answer and the web block were all Georgian.
 * The owner had not written a word of it.
 *
 * These test the RULE rather than the wiring: a message carrying a script
 * signal wins as the latest, which is right for the owner's words and wrong
 * for ours.
 */
describe('a server-written wake event is not the conversation', () => {
  const WAKE = '[მოვლენა] მიზანი ახლახან შეინახა და გეგმა ჯერ არ არსებობს.';

  it('would hijack the language if it were treated as the latest message', () => {
    // The bug, stated as a test so nobody reintroduces it by "simplifying"
    // the caller: the event alone reads as Georgian, whatever came before.
    expect(languageOfConversation(WAKE, ['I need a dentist in Tbilisi for my child'])).toBe('ka');
  });

  it('reads the thread instead, once the event is set aside', () => {
    // What the caller now passes on an engine run: the newest REAL message.
    expect(
      languageOfConversation('I opened this as a goal of its own.', [
        'I need a dentist in Tbilisi for my child',
      ]),
    ).toBe('en');
  });

  it('leaves a Georgian thread Georgian, which is the common case', () => {
    expect(languageOfConversation('ეს ცალკე მიზნად გავიტანე.', ['ფოტოგრაფი მჭირდება'])).toBe('ka');
  });
});

/**
 * Thread 17726, 18 September, from the run-language log:
 *
 *   „I approve" reads as en, the conversation is ka — using the conversation's
 *
 * An English goal, English from its first word, and the server declared the
 * conversation Georgian on the owner's approval.
 *
 * „I approve" is nine characters, under the 25 that let a short Latin line move
 * a conversation, so the search went behind it for the newest message carrying
 * a script — and the list it searched held the ASSISTANT's messages too. The
 * assistant's English reply an hour earlier had quoted two Georgian SHOP NAMES,
 * correctly, because that is how their owners wrote them. One Georgian
 * character inside a quoted name was enough.
 *
 * A raw script test cannot tell the model WRITING Georgian from the model
 * QUOTING it. The fix is not to make the test cleverer — it is to stop asking
 * the assistant's messages what language the OWNER speaks.
 */
describe('what the owner has said, and only the owner', () => {
  it('keeps a short yes in the language of the owner’s own earlier words', () => {
    // The whole thread is the owner's, all English. Nothing to argue with.
    expect(languageOfConversation('I approve', ['I need a good tiler in Tbilisi'])).toBe('en');
  });

  it('is not moved by a Georgian name quoted inside an English sentence', () => {
    // This is the assistant's line from 17726's shape. If it ever reaches the
    // list again, this is what it would do.
    const assistantQuotingAName = 'I found two: „ბათუმი ფლაზა" and one more nearby.';

    expect(languageOfConversation('I approve', [assistantQuotingAName])).toBe('ka');
    // ^ Still ka, deliberately: this function cannot tell a quote from prose,
    // and it should not try. The caller must not hand it the assistant's words
    // — which is the fix, and this test records why the fix is at the caller.
  });

  it('still lets a real Georgian message behind a short yes decide', () => {
    // Row 155's original case, thread 16539: a Georgian ask, the owner answers
    // „Ok", and the reply must stay Georgian. Unchanged.
    expect(languageOfConversation('Ok', ['გამარჯობა, ხვალ როდის შეგიძლია?'])).toBe('ka');
  });

  it('lets a long Latin sentence switch on its own, without looking behind it', () => {
    expect(
      languageOfConversation('Actually let us do this in English from now on please', [
        'გამარჯობა',
      ]),
    ).toBe('en');
  });
});
