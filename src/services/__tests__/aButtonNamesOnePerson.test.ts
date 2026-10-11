import { namesakesIn, phoneForButton, tappedButtonIndex } from '../namesakeButtons';

/** 3466 (box 52934): which namesake a button stands for, or nobody when it cannot be told. */
const found = namesakesIn({
  results: [
    { phone: 'p-other', name: 'დათო გამოგონილი' },
    { phone: 'p-plumber', name: 'დათო გამოგონილი', note: 'საბურთალოს სანტექნიკი' },
  ],
});
const OTHER_BUTTON = 'სხვა, მე დავწერ';

describe('3466: a button names one person, or nobody', () => {
  it('reads the namesakes a search offered, with what it showed about each', () => {
    expect(found.map((n) => n.phone)).toEqual(['p-other', 'p-plumber']);
    expect(found[1].text).toContain('საბურთალოს');
  });

  it('matches a button by its own words, in another case ending too', () => {
    const buttons = ['დათო გამოგონილი (საბურთალო, სანტექნიკოსი)', 'დათო გამოგონილი', OTHER_BUTTON];
    expect(phoneForButton(buttons, 0, found)).toBe('p-plumber');
  });

  it('gives the one button nothing names to the one person nothing named', () => {
    const buttons = ['დათო გამოგონილი (საბურთალოს სანტექნიკი)', 'დათო გამოგონილი (მეორე ჩანაწერი)'];
    expect(phoneForButton(buttons, 1, found)).toBe('p-other');
  });

  it('names nobody when two buttons say nothing that tells them apart', () => {
    const buttons = ['დათო გამოგონილი (1)', 'დათო გამოგონილი (2)', OTHER_BUTTON];
    expect(phoneForButton(buttons, 0, found)).toBeNull();
    expect(phoneForButton(buttons, 1, found)).toBeNull();
  });

  it('names nobody when a button points at both, or the buttons do not match the people', () => {
    expect(
      phoneForButton(['დათო გამოგონილი (დათო)', 'დათო გამოგონილი (საბურთალო)'], 2, found),
    ).toBeNull();
    expect(phoneForButton(['დათო გამოგონილი (საბურთალო)'], 0, found)).toBeNull();
    expect(phoneForButton([OTHER_BUTTON], 0, found)).toBeNull();
  });
});

// Box 53065, pair 4: the buttons did not carry the name, and the helper tapped the first one.
describe('3466: buttons without the name', () => {
  const plumbers = namesakesIn({
    results: [
      { phone: 'p-any', name: 'დათო გამოგონილი', tags: ['სანტექნიკი'] },
      { phone: 'p-sab', name: 'დათო გამოგონილი', tags: ['სანტექნიკი'], note: 'საბურთალო' },
    ],
  });
  const buttons = ['სანტექნიკის ნომერი', 'საბურთალოს სანტექნიკის ნომერი', OTHER_BUTTON];

  it('reads the tapped button’s own text as its position', () => {
    expect(tappedButtonIndex('სანტექნიკის ნომერი', buttons, plumbers)).toBe(0);
    expect(tappedButtonIndex('საბურთალოს სანტექნიკის ნომერი', buttons, plumbers)).toBe(1);
    expect(tappedButtonIndex(OTHER_BUTTON, buttons, plumbers)).toBe(-1);
  });

  it('gives each button its person, the plain one by elimination', () => {
    expect(phoneForButton(buttons, 1, plumbers)).toBe('p-sab');
    expect(phoneForButton(buttons, 0, plumbers)).toBe('p-any');
  });
});
