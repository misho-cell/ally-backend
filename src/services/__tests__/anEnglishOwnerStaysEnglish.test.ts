jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { languageOfConversation } from '../runLanguage';
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
