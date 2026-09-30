jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { ownerSaysSolved } from '../chat.service';

/**
 * Row 310. Giorgi on 29 Sep, and Test 47 on 30 Sep 20:48: the owner tapped
 * „მოგვარებულია" on a card the model drew itself, and finish_task refused —
 * „their last message was about something else" — until a second card was
 * shown and „გადაწყდა" was tapped. The first „solved", tap or words, closes it.
 */
describe("the owner's first solved closes the goal, whatever the model called the button", () => {
  const MODELS_OWN_CARD = ['მოგვარებულია', 'ჯერ არა'];

  it("closes on a tap of the model-written label (the seat's exact case)", () => {
    expect(ownerSaysSolved('მოგვარებულია', MODELS_OWN_CARD)).toBe(true);
  });

  it('closes on the malformed label row 313 caught', () => {
    expect(ownerSaysSolved('მოგვარდებულია', ['მოგვარდებულია', 'ჯერ არა'])).toBe(true);
  });

  it('closes on other labels the model writes, by the card they came from', () => {
    expect(ownerSaysSolved('✅ საკითხი მოგვარდა', ['✅ საკითხი მოგვარდა', 'ჯერ არა'])).toBe(true);
    expect(ownerSaysSolved('Yes, all resolved', ['Yes, all resolved', 'Not yet'])).toBe(true);
    expect(ownerSaysSolved('Решена', ['Решена', 'Ещё нет'])).toBe(true);
  });

  it("lets a bare yes through under the model's own solved card", () => {
    expect(ownerSaysSolved('კი', MODELS_OWN_CARD)).toBe(true);
  });

  it('still refuses the other buttons on that card', () => {
    expect(ownerSaysSolved('ჯერ არა', MODELS_OWN_CARD)).toBe(false);
    expect(ownerSaysSolved('Not yet', ['Yes, all resolved', 'Not yet'])).toBe(false);
  });

  /** Stems are read on a TAPPED label only — typed text keeps the exact-word rule. */
  it('does not read a stem into free typing', () => {
    expect(ownerSaysSolved('ხვალ მოგვარდება', MODELS_OWN_CARD)).toBe(false);
    expect(ownerSaysSolved('შენ გადაწყვიტე', ['შენ გადაწყვიტე', 'მე ავირჩევ'])).toBe(false);
  });

  it('treats a negated solved as not solved, in English and Russian too', () => {
    expect(ownerSaysSolved('Not solved yet', ['Solved', 'Not yet'])).toBe(false);
    expect(ownerSaysSolved('Не решено', ['Решено', 'Ещё нет'])).toBe(false);
    expect(ownerSaysSolved('Not solved', ['Not solved', 'Solved'])).toBe(false);
  });
});
