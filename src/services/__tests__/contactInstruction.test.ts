import { looksLikeContactInstruction } from '../goalIntent';

/**
 * Ticket 20 row 103/104 — an instruction naming one person is not a goal.
 *
 * LIKA, 18 September, thread 17623. She typed the whole thing at 12:57:
 *
 *   12:57:52  „ask Tornike Abuladze if he knows a good philosopher"
 *   13:00:27  „ask him"
 *   13:01:09  „I approve"
 *
 * She said it once and had to say it twice more, because the message became a
 * GOAL, and a new goal has its plan proposed — so she was asked to approve the
 * sentence she had just written.
 *
 * The founder's ruling: a short instruction naming one person and one action
 * IS the yes. It goes, with one line afterwards saying who it went to.
 *
 * This is the CHEAP half of the guard. The phonebook half lives in
 * nameMatch.messageNamesOwnContact and only runs when this returns true —
 * which is what keeps a query off every message that cannot need it.
 *
 * Measured against 56 real goals: the phonebook test alone caught all six
 * instructions and called 34 ordinary goals instructions too; with this half
 * in front of it, six of six and nothing wrong.
 */
describe('the cheap half — an un-negated instruction to contact somebody', () => {
  it('catches the six, in both languages and both verbs', () => {
    for (const message of [
      'ask Tornike Abuladze if he knows a good philosopher',
      'თორნიკე აბულაძეს ჰკითხე თუ იცნობს კარგ ფილოსოფოსს',
      'თორნიკე აბულაძეს ჰკითხე თუ იცნობს კარგ ფინანსისტს დიდი კორპორაციისთვის',
      'თიკო რატიანს მისწერე თუ იცნობს გაყიდვების სპეციალისტს',
      'Ask Lika to send me the screenshots',
      'tell X I can do Thursday',
    ]) {
      expect(looksLikeContactInstruction(message)).toBe(true);
    }
  });

  it('leaves an ordinary stated need alone — those ARE goals', () => {
    for (const message of [
      'მჭირდება კარგი სტომატოლოგი თბილისში',
      'I need a good photographer in Tbilisi for a wedding',
      'I need a reliable plumber in Vake',
      'ქორწილის ფოტოგრაფი მჭირდება ქუთაისში',
    ]) {
      expect(looksLikeContactInstruction(message)).toBe(false);
    }
  });

  /**
   * The one false positive the 56 produced, and it is the seat's own safety
   * phrasing: „Search only, write to nobody." It matched on „write to", inside
   * a negation — row 215's shape exactly, where „no goal" was read as naming
   * a goal.
   */
  it('is not fooled by a NEGATED contact verb — the seat types these to stay safe', () => {
    for (const message of [
      'I need a good bookshop in Tbilisi that sells English books. Search only, write to nobody.',
      'I need 3 movers, Vake, 25 September. Search in English only. Write to nobody.',
      '„ყვავილების მაღაზია მჭირდება ვაკეში. მხოლოდ მოძებნე — არავის არ მისწერო."',
      'find them but do not contact anyone',
    ]) {
      expect(looksLikeContactInstruction(message)).toBe(false);
    }
  });

  it('refuses a long message — a paragraph mentioning „ask" is not an instruction', () => {
    const long =
      'I am putting together a small advisory group for the new product line and I would like ' +
      'to understand who in my network has done this before, so please ask around and see what ' +
      'turns up, there is no hurry about any of it at all whatsoever';
    expect(long.length).toBeGreaterThan(160);
    expect(looksLikeContactInstruction(long)).toBe(false);
  });

  it('fails towards MAKING the goal on anything empty or unreadable', () => {
    // A goal that quietly does not appear is the mirror image of the bug being
    // fixed, and the harder one to notice — so every uncertain path is false.
    expect(looksLikeContactInstruction('')).toBe(false);
    expect(looksLikeContactInstruction('   ')).toBe(false);
    expect(looksLikeContactInstruction('...')).toBe(false);
  });
});
