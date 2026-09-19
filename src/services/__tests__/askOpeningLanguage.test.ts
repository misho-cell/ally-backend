import {
  askCancelledNote,
  askOpeningParts,
  buildAskOpening,
  unknownSenderName,
} from '../askOpening';
import { RunLanguage } from '../runLanguage';

/**
 * The seat's 289 and 290 — the first thing a person ever reads from somebody
 * else's assistant, in a script they may not be able to decode.
 *
 * Test 2's account is entirely English and the incoming question arrived as
 * „Netai Test 1-ის ასისტენტი გეკითხება:" … „უბრალოდ მიპასუხე ამ თრედში…".
 * The second sighting was worse: the same wrapper around an INTRODUCTION,
 * which is the single most important message this product sends. A stranger's
 * question in an unreadable script is not a colleague's question, it is spam —
 * and D57's whole point is the difference between those two.
 *
 * It was never four strings to swap. The Georgian opening inflects the
 * sender's name into the genitive and no other language has anything to
 * inflect, so each one is its own construction around a bare name.
 */
const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

describe('the incoming-ask opening follows the RECIPIENT’s language', () => {
  it('carries no Georgian in any non-Georgian opening', () => {
    for (const language of LANGUAGES.filter((l) => l !== 'ka')) {
      const parts = askOpeningParts(language, 'Nino Beridze', 'Bank of Georgia');
      for (const line of [parts.first, parts.followUp, parts.added, parts.tail]) {
        expect(line).not.toMatch(/[Ⴀ-ჿ]/);
      }
    }
  });

  it('inflects the name in Georgian and leaves it alone everywhere else', () => {
    // „ნინოს ასისტენტი", not „ნინო ასისტენტი" — this is the reason the table
    // could not simply be four strings.
    expect(askOpeningParts('ka', 'ნინო', null).first).toContain('ნინოს');
    // A Latin name is not mangled by the other languages.
    expect(askOpeningParts('en', 'Nino', null).first).toContain("Nino's assistant");
    expect(askOpeningParts('ru', 'Nino', null).first).toContain('Ассистент Nino');
  });

  it('names the shared roster in every language, because that is what D57 is for', () => {
    // Two members of one network who never saved each other's number: saying so
    // is what makes a stranger's question a colleague's.
    expect(askOpeningParts('en', 'Nino', 'TBC').first).toContain('a TBC member, like you');
    expect(askOpeningParts('ru', 'Nino', 'TBC').first).toContain('участник TBC');
    expect(askOpeningParts('es', 'Nino', 'TBC').first).toContain('miembro de TBC');
    expect(askOpeningParts('ka', 'ნინო', 'TBC').first).toContain('TBC-ის წევრი');
  });

  it('keeps the three situations distinct in every language', () => {
    // „Wrote AGAIN" is true only of somebody who has already replied. Said to
    // someone who has not, forty-one seconds later, it reads as being chased.
    for (const language of LANGUAGES) {
      const parts = askOpeningParts(language, 'Nino', null);
      expect(parts.first).not.toBe(parts.followUp);
      expect(parts.followUp).not.toBe(parts.added);
      expect(parts.added).not.toBe(parts.first);
    }
  });

  it('builds the whole message with the question quoted and the tail last', () => {
    const text = buildAskOpening('en', 'Nino', null, 'Can you recommend a dentist?', 'first');
    expect(text).toBe(
      "Nino's assistant is asking:\n\n" +
        '"Can you recommend a dentist?"\n\n' +
        'Just reply in this thread and I will pass your answer on.',
    );
  });

  it('names an unknown sender in the reader’s language too', () => {
    // A sender with no stored name used to be „Netai-ს მომხმარებელი" for
    // everybody — the fallback was the one part guaranteed to be Georgian.
    expect(unknownSenderName('en')).toBe('A Netai member');
    expect(unknownSenderName('ka')).toMatch(/[Ⴀ-ჿ]/);
    for (const language of LANGUAGES.filter((l) => l !== 'ka')) {
      expect(unknownSenderName(language)).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});

/**
 * The seat's fourth locale sighting, and the second that is the server's: the
 * note that lets a stranger off arrived in Georgian on an account whose
 * interface is English end to end. Being let off in a script you cannot read
 * is worse than not being told.
 */
describe('the note a recipient gets when the question is withdrawn', () => {
  it('exists in every language and says both halves: over, and thank you', () => {
    for (const language of LANGUAGES) {
      const note = askCancelledNote(language);
      expect(note.length).toBeGreaterThan(20);
      // „No longer needed" on its own reads as a brush-off. The thanks is the
      // point: somebody was asked for a favour and did nothing wrong.
      expect(note).toMatch(/მადლობა|Thank you|Спасибо|Gracias/);
    }
  });

  it('carries no Georgian in the non-Georgian notes', () => {
    for (const language of LANGUAGES.filter((l) => l !== 'ka')) {
      expect(askCancelledNote(language)).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });
});
