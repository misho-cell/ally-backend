import { informalGeorgianForDisplay, scrubText } from '../privacyScrub';

describe('scrubText — real phones are masked', () => {
  it.each([
    '+995599123456',
    '+995 599 12 34 56',
    '995-599-12-34-56',
    '599 123 456 დაურეკე ამ ნომერზე', // spaced local number inside prose
  ])('masks %s', (input) => {
    expect(scrubText(input)).toContain('[hidden]');
  });
});

describe('scrubText — counts, years and number lists survive', () => {
  it.each([
    ['2015-2017', '2015-2017'],
    ['FreeUni/ESM, 2015 - 2017', 'FreeUni/ESM, 2015 - 2017'],
    ['სულ 12 ადამიანი', 'სულ 12 ადამიანი'],
    // Adjacent standalone numbers used to be summed into one 9+ digit
    // "candidate" and masked — the "[hidden] ადამიანი" family.
    ['ფასები: 1500 2000 3000', 'ფასები: 1500 2000 3000'],
    ['2015-2017 2018-2020', '2015-2017 2018-2020'],
    ['ბიუჯეტი 25000 50000 75000 ლარი', 'ბიუჯეტი 25000 50000 75000 ლარი'],
  ])('%s stays intact', (input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it('still masks a real phone standing next to a year', () => {
    // One chunk alone crosses the phone threshold — the run is dangerous.
    expect(scrubText('599123456 2015')).toContain('[hidden]');
  });
});

import { stripRedactionArtifactsForDisplay } from '../privacyScrub';

// Ticket 10 Task 3: the placeholder went, its quotes stayed, and Lika read
// „ერთია "", მეორე """ as two blank numbers.
describe('a quoted placeholder disappears with its quotes', () => {
  it.each([
    ['ვნახოთ ნომრები: ერთია "[hidden]", მეორე "[hidden]".', 'ვნახოთ ნომრები: ერთია, მეორე.'],
    ['ნომერი „[hidden]" არის', 'ნომერი არის'],
    ['number «[hidden]» here', 'number here'],
    ["it's '[hidden]' ok", "it's ok"],
  ])('%s → %s', (input, expected) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(expected);
  });

  it('still strips the bare and bracketed forms', () => {
    expect(stripRedactionArtifactsForDisplay('ილია წულაია ([hidden]): კი')).toBe('ილია წულაია: კი');
    expect(stripRedactionArtifactsForDisplay('a [hidden] b')).toBe('a b');
  });
});

/**
 * Ticket 20 row 116 — the label the number left behind.
 *
 * Thread 15610, 16 September, twice: „ნომერი:." where a phone had been. Goal
 * 3466 the same morning: „☎ /". Removing the number is right; leaving its label
 * makes a careful product look broken.
 *
 * The same shape as the empty-quotes rule written on 3 September, for the same
 * reason: the placeholder goes, and whatever was holding its place goes with it.
 */
describe('a contact label with nothing left after it', () => {
  it.each([
    ['ავტოსერვისი „ლიდერი"\nნომერი: [hidden].', 'ავტოსერვისი „ლიდერი"'],
    ['- ავტოსერვისი, ნომერი: [hidden].', '- ავტოსერვისი.'],
    ['ოთახი 12 ☎ [hidden] / [hidden]', 'ოთახი 12'],
    ['სერვისი „ალფა"\nტელეფონი: [hidden]\nსერვისი „ბეტა"', 'სერვისი „ალფა"\nსერვისი „ბეტა"'],
    // The line existed only to carry the number, so the line goes too — a
    // blank gap where a phone used to be reads almost as badly as „ნომერი:.".
    ['Repair shop\nphone: [hidden]', 'Repair shop'],
  ])('%s', (input, expected) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(expected);
  });

  // The half that matters as much: a label with a real value is prose, not an
  // artefact, and must survive untouched.
  it.each([
    'ნომერი: 12',
    'რამდენი ნომერია? ნომერი: სამი.',
    'ტელეფონი: იხილეთ საიტზე',
    'ნომერი: ⟦own⟧+995599123456⟦/own⟧',
  ])('leaves „%s" alone', (input) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(input);
  });
});

/**
 * Ticket 20 row 116, SECOND shape — the tester's thread 15646, 10:42:13 UTC.
 *
 * My first fix took a LABEL away with its number. It did not touch a BARE
 * number that left a dangling separator: "ეკრანის შეკეთება [hidden],." came out
 * "ეკრანის შეკეთება,.". The comma and the full stop sat either side of the
 * placeholder and closed up when the middle vanished.
 */
describe('punctuation left touching itself where a number was', () => {
  it.each([
    ['ეკრანის შეკეთება [hidden],.', 'ეკრანის შეკეთება.'],
    ['ლეპტოპის შეკეთება, [hidden].', 'ლეპტოპის შეკეთება.'],
    ['ავტო შეკეთება [hidden], [hidden].', 'ავტო შეკეთება.'],
    ['სერვისი [hidden]; [hidden]!', 'სერვისი!'],
  ])('%s', (input, expected) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(expected);
  });

  // Ordinary punctuation is prose and must survive untouched — this rule runs
  // on every reply the product sends.
  it.each([
    'ერთი, ორი და სამი.',
    'ფასი: 20, 30 ლარი.',
    'მისამართი: რუსთაველი 12, მე-3 სართული.',
    'კითხვა: რომელი გირჩევნია?',
  ])('leaves „%s" alone', (input) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(input);
  });
});

/**
 * Ticket 20 row 116, THIRD shape, and a bug of my own found underneath it.
 *
 * The tester's report: „floristi.ge, მისამართი N5, თბილისი, ტელ." — the number
 * gone and „ტელ." left standing. „ტელ" was in the label list from the first
 * fix; what the inline rule demanded after it was a separator, and an
 * abbreviating full stop is not one. With a sentence-ending stop after the
 * number it came out worse still: „ტელ..".
 *
 * So a full stop now counts as the separator, but ONLY for abbreviations. For
 * a word written out in full the stop IS the sentence, and „მან დაკარგა
 * ტელეფონი." has to survive — that is the reason for the split and not a
 * detail of it.
 *
 * AND THE BUG UNDER IT, which is mine and shipped with row 116. The labels
 * were matched as bare substrings, so measured on the live code before this
 * change:
 *
 *   „Grand hotel: [hidden]"  →  „Grand ho"
 *   „The mob: [hidden]"      →  „The"
 *
 * The rule existed to stop the product looking careless and was quietly eating
 * words the user wrote, which is far worse than the artefact it removes. \b
 * cannot fix it — Georgian letters are not word characters in JavaScript, so
 * „\btel" still matches inside „hotel" in mixed-script text. A Unicode
 * lookbehind can.
 */
describe('row 116 third shape — an abbreviated label, and not the inside of a word', () => {
  it.each([
    ['floristi.ge, მისამართი N5, თბილისი, ტელ. [hidden]', 'floristi.ge, მისამართი N5, თბილისი'],
    // The stop after the number is the sentence's; the one after „ტელ" is the
    // abbreviation's. Both were being left behind, side by side, as „ტელ..".
    ['floristi.ge, მისამართი N5, თბილისი, ტელ. [hidden].', 'floristi.ge, მისამართი N5, თბილისი.'],
    ['floristi.ge, თბილისი, ტელ.: [hidden]', 'floristi.ge, თბილისი'],
    ['მაღაზია, ტელ. [hidden], მისამართი N5', 'მაღაზია, მისამართი N5'],
    ['Shop, tel. [hidden].', 'Shop.'],
    ['ყვავილების მაღაზია\nტელ. [hidden]\nმისამართი N5', 'ყვავილების მაღაზია\nმისამართი N5'],
  ])('%s', (input, expected) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(expected);
  });

  /** The words that were being eaten. Each of these is a real regression. */
  it.each([
    ['Grand hotel: [hidden]', 'Grand hotel:'],
    ['დავჯავშნე hotel: [hidden]', 'დავჯავშნე hotel:'],
  ])('„%s" keeps the word it was matching inside of', (input, expected) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(expected);
  });

  /**
   * The line the abbreviation rule must not cross: a label written out in
   * full, ending a sentence, with no number anywhere near it.
   */
  it.each([
    'მან დაკარგა ტელეფონი.',
    'დამირეკე ტელეფონით.',
    'ეს არის ჩემი ნომერი.',
    'ის ცხოვრობს ტელავში.',
    'მაღაზია, ტელ. 555123456',
    'დარეკე აქ, ნომერი: 555 12 34 56',
  ])('leaves „%s" alone', (input) => {
    expect(stripRedactionArtifactsForDisplay(input)).toBe(input);
  });
});

/**
 * The seat's 367 — a LinkedIn slug ending in digits was being eaten at the
 * display boundary, and they read the mask as a destroyed record.
 *
 * Their evidence: Nika Abramishvili's stored link read
 * `linkedin.com/in/nika-abramishvili-[hidden]/` in two separate facts months
 * apart, so they concluded the digits were scrubbed BEFORE the write and the
 * URL could never be recovered.
 *
 * THE RECORD WAS INTACT. `contact_facts` holds zero rows containing „[hidden]"
 * and four LinkedIn links whose slug ends in a nine-digit run, stored whole —
 * 957914321, 262049200, 741764199 twice. This function was doing it on the way
 * out. A rendering bug, not a data loss, and therefore reversible.
 *
 * The cost was real anyway: a link that arrives masked is a link nobody can
 * open, and the model cannot hand the owner a working profile.
 */
describe('a digit run welded into a word is an identifier, not a phone', () => {
  it.each([
    'https://www.linkedin.com/in/nika-abramishvili-123456789/',
    'linkedin.com/in/levan-kholuashvili-957914321',
    'https://www.linkedin.com/in/dato-mikeladzeee-262049200/',
    // Mixed letters and digits never tripped it, which is why only some links broke.
    'https://www.linkedin.com/in/misha-abaiadze-a099a36',
  ])('keeps the slug in %s', (url) => {
    expect(scrubText(url)).toBe(url);
  });

  /**
   * The boundary this protects has to hold exactly as before. A real phone is
   * delimited by a space, the start of the text, or punctuation like „:" — it
   * is never welded to the end of a word.
   */
  it.each([
    'call me on +995 599 12 34 56',
    '+995599123456',
    '995599123456',
    'tel:995599123456',
    'my number is 599 12 34 56 ok',
  ])('still redacts a real phone in %s', (text) => {
    expect(scrubText(text)).toContain('[hidden]');
  });

  it('leaves dates and year ranges alone, as it always did', () => {
    expect(scrubText('2015-2017')).toBe('2015-2017');
    expect(scrubText('2026-09-20')).toBe('2026-09-20');
  });
});

/**
 * Georgian formal address, unmade at the display boundary.
 *
 * Misho's rule is in the prompt TWICE and still fails. The seat's 356–358
 * found five formal messages in three threads on the founder's account —
 * including one informal and three formal inside thread 15874, which is the
 * failure the rule names happening within a single conversation.
 *
 * My own wider read, 5,192 assistant rows over ten days: 1,987 carry Georgian
 * and seventeen carry a `თქვენ` form. All seventeen were read, not counted —
 * every one addresses the owner and NOT ONE is a quotation, which is the only
 * thing that makes a blind replacement safe.
 */
describe('formal address is unmade for display, and only where it is safe', () => {
  it.each([
    ['ველოდები თქვენს პასუხს', 'ველოდები შენს პასუხს'],
    ['თქვენს კონტაქტებში', 'შენს კონტაქტებში'],
    ['თქვენი ახლო მეგობარი', 'შენი ახლო მეგობარი'],
    ['თქვენს შვილს შეეფერება', 'შენს შვილს შეეფერება'],
    ['ეს თქვენთვის მოვამზადე', 'ეს შენთვის მოვამზადე'],
  ])('%s becomes %s', (before, after) => {
    expect(informalGeorgianForDisplay(before)).toBe(after);
  });

  /**
   * THE THREE IT MUST NOT TOUCH. „თქვენ თავად გყავთ", „თქვენ თვითონ
   * დაურეკავთ" and „თქვენ თხოვეთ" carry verb agreement; swapping the pronoun
   * alone yields „შენ თავად გყავთ", which is broken Georgian. A regex cannot
   * conjugate, so it leaves them formal and visible — a partial fix that says
   * so beats a confident one that mangles the grammar.
   */
  it.each([
    'თქვენ თავად გყავთ პირდაპირი კონტაქტები',
    'თქვენ თვითონ დაურეკავთ',
    'რადგან თქვენ თხოვეთ არავისთვის მიწერა',
  ])('leaves the verb-agreement case alone: %s', (text) => {
    expect(informalGeorgianForDisplay(text)).toBe(text);
  });

  it('touches nothing in a message with no formal address', () => {
    const plain = 'ველოდები შენს პასუხს, ხვალ შევამოწმებ.';
    expect(informalGeorgianForDisplay(plain)).toBe(plain);
  });
});
