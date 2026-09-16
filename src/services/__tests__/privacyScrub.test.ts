import { scrubText } from '../privacyScrub';

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
