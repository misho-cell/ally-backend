jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { carriesLanguage, detectRunLanguage, languageOfConversation } from '../runLanguage';
import { buildAnswerWakeEvent, buildRelayAnswerWakeEvent } from '../taskAsks.service';

/**
 * Row 260, the owner's side — goal 11155, thread 26700. Test 52 wrote English
 * throughout; the last line before the relays was „Yes, send to all six".
 * Every relay reached him in Georgian, because nothing behind that short line
 * carried a script signal and the fallback was the engine event's Georgian.
 */
describe('an English-writing owner is answered in English after a short line', () => {
  const OWNER_NEWEST_FIRST = [
    'Yes, send to all six',
    'I approve',
    'Their names: Netai Test 27, Netai Test 28, Netai Test 48. Ask all six.',
    'I need a good dentist in Tbilisi for my mother. Ask my contacts, please.',
  ];

  it("reads the owner's English behind a short newest line (the seat's case)", () => {
    // An engine wake: the newest owner line decides, the rest are behind it,
    // and the run's own fallback is the Georgian of the event text.
    expect(languageOfConversation(OWNER_NEWEST_FIRST[0], OWNER_NEWEST_FIRST.slice(1), 'ka')).toBe(
      'en',
    );
  });

  it('still keeps a Georgian thread Georgian behind a short Latin „ok"', () => {
    expect(languageOfConversation('ok', ['მჭირდება კარგი სანტექნიკოსი'], 'en')).toBe('ka');
  });

  it('takes the NEWEST evidence, whichever kind it is', () => {
    expect(
      languageOfConversation(
        'ok',
        ['Please write to them in English from now on.', 'მჭირდება ექიმი'],
        'ka',
      ),
    ).toBe('en');
  });

  it('keeps the fallback when nothing anywhere is evidence', () => {
    expect(languageOfConversation('ok', ['yes', 'send it'], 'ka')).toBe('ka');
  });
});

describe('the answer event says which way a translation goes', () => {
  it("into the owner's language, not the event's", () => {
    const events = [
      buildAnswerWakeEvent('Yes, Baxva is a good dentist.', 'Netai Test 27', true),
      buildRelayAnswerWakeEvent('Yes.', 'Netai Test 27', 'Netai Test 44', true),
    ];
    for (const event of events) {
      expect(event).toMatch(/თარგმანი დაურთე მფლობელის ენაზე/);
      expect(event).toMatch(/არა ამ შეტყობინების ენაზე/);
    }
  });
});

describe('a quoted Georgian name does not make an English sentence Georgian', () => {
  it("reads the seat's quick answer as English", async () => {
    const { detectRunLanguage } = await import('../runLanguage');
    expect(detectRunLanguage('Do I know anyone who knows თამარ გამოგონილი?')).toBe('en');
  });

  it('keeps a Georgian sentence with a company name Georgian', async () => {
    const { detectRunLanguage } = await import('../runLanguage');
    expect(detectRunLanguage('მჭირდება TBC Capital-ში ვინმე')).toBe('ka');
    expect(detectRunLanguage('კი')).toBe('ka');
  });

  it('still reads Russian and Spanish', async () => {
    const { detectRunLanguage } = await import('../runLanguage');
    expect(detectRunLanguage('Нужен хороший юрист')).toBe('ru');
    expect(detectRunLanguage('¿Conoces a un abogado?')).toBe('es');
  });
});

describe('Latin contact names inside a Georgian sentence do not make it English', () => {
  it("reads the seat's Test 53 sentence as Georgian", async () => {
    const { detectRunLanguage } = await import('../runLanguage');
    expect(
      detectRunLanguage(
        'მჭირდება კარგი ელექტრიკოსი ბინაში. ჰკითხე ჩემს კონტაქტებს — Netai Test 27, Netai Test 28, ' +
          'Netai Test 48, Netai Test 49, Netai Test 50, Netai Test 51 — ექვსივეს ერთდროულად.',
      ),
    ).toBe('ka');
  });

  it('still reads an English sentence with a Georgian name as English', async () => {
    const { detectRunLanguage } = await import('../runLanguage');
    expect(detectRunLanguage('Do I know anyone who knows ბახვა გამოგონილი?')).toBe('en');
    expect(detectRunLanguage('Please ask Netai Test 27')).toBe('en');
  });
});

/** The tester's 1162 (#1156): Spanish without an accent mark read as English. */
describe('Spanish without accents', () => {
  it('is told by its small words', () => {
    expect(
      detectRunLanguage('Preguntale a Netai Test 1 si conoce un buen dentista en Tbilisi.'),
    ).toBe('es');
  });

  it('leaves English with a Spanish-looking word English', () => {
    expect(detectRunLanguage('Ask Netai Test 1 if he could recommend a dentist in Tbilisi.')).toBe(
      'en',
    );
    expect(detectRunLanguage('Is there a good dentist in Tbilisi for my kid?')).toBe('en');
  });
});

/** The tester's 38809 (Lika): „." alone says no language. */
describe('a line that carries a language', () => {
  it('is a script or a sentence of Latin, never a lone stop', () => {
    expect(carriesLanguage('.')).toBe(false);
    expect(carriesLanguage('ok')).toBe(false);
    expect(carriesLanguage('ამ სიაზე იმუშავე')).toBe(true);
    expect(carriesLanguage('Please work this list for me today')).toBe(true);
  });
});
