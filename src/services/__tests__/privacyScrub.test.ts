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
