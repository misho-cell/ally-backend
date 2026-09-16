import {
  georgianFirstNameOf,
  georgianSpellingNote,
  resetGeorgianNameIndex,
} from '../ownerNameGeorgian';

beforeEach(() => resetGeorgianNameIndex());

/**
 * Ticket 20 row 146, found 1 — the founder's name spelled two ways inside one
 * goal.
 *
 * Goal 3895: the saved plan's solved-when line said „ტორნიკეს" and the reply
 * above the buttons said „თორნიკეს". Neither came from us — his account stores
 * „Tornike Abuladze" in Latin, so every Georgian rendering was a model
 * transliterating on the spot, and „t" is two Georgian letters.
 */
describe('the Georgian spelling of a Latin-registered name', () => {
  it('resolves the t that is two letters', () => {
    // The whole bug in one assertion: ტორნიკე and თორნიკე both transliterate
    // to "tornike", and only one of them is a name anybody is called.
    expect(georgianFirstNameOf('Tornike Abuladze')).toBe('თორნიკე');
  });

  it('takes the first name and ignores the rest', () => {
    expect(georgianFirstNameOf('Giorgi Kapanadze')).toBe(georgianFirstNameOf('Giorgi'));
  });

  it('is case-insensitive, because a registered name is typed by a person', () => {
    expect(georgianFirstNameOf('TORNIKE abuladze')).toBe('თორნიკე');
  });

  it('answers nothing for a name already written in Georgian', () => {
    // There is nothing to fix: the model is being handed the spelling already.
    expect(georgianFirstNameOf('თორნიკე აბულაძე')).toBeNull();
  });

  it('answers nothing for a name the list does not hold, rather than guessing', () => {
    // A wrong spelling asserted by the server is worse than a model varying:
    // it would be wrong the same way every single time.
    expect(georgianFirstNameOf('Wolfgang Amadeus')).toBeNull();
  });

  it('answers nothing for an empty or blank name', () => {
    expect(georgianFirstNameOf('')).toBeNull();
    expect(georgianFirstNameOf('   ')).toBeNull();
  });
});

describe('the line added to the prompt', () => {
  it('names the spelling and demands it everywhere', () => {
    const note = georgianSpellingNote('Tornike Abuladze');

    expect(note).toContain('თორნიკე');
    expect(note).toContain('არც ერთ ტექსტში სხვაგვარად');
  });

  it('adds nothing when there is nothing to say', () => {
    // A prompt must not grow a line that carries no fact — and row 130's
    // lesson is that everything in the per-account block is paid for again
    // whenever it changes.
    expect(georgianSpellingNote('Wolfgang Amadeus')).toBe('');
    expect(georgianSpellingNote('თორნიკე აბულაძე')).toBe('');
    expect(georgianSpellingNote('')).toBe('');
  });
});
