import { canonicalNameForm, nameFormVariants } from '../nameForms';

describe('nameFormVariants (Answers-12 Part B: people save names the way they speak)', () => {
  it('returns the word first, then every other form of that first name', () => {
    expect(nameFormVariants('bacho')).toEqual(['bacho', 'bachana']);
    expect(nameFormVariants('bachana')).toEqual(['bachana', 'bacho']);
    expect(nameFormVariants('vasil')).toEqual(['vasil', 'vasili', 'vasiko']);
    expect(nameFormVariants('temur')).toEqual(['temur', 'teimuraz', 'temo']);
  });

  it('returns a word it does not know unchanged, alone', () => {
    expect(nameFormVariants('khachidze')).toEqual(['khachidze']);
    expect(nameFormVariants('axel')).toEqual(['axel']);
  });
});

describe('canonicalNameForm (5908: labels read side by side)', () => {
  it('reads every form of a first name as one, and leaves other words alone', () => {
    expect(canonicalNameForm('gogita')).toBe('giorgi');
    expect(canonicalNameForm('goga')).toBe('giorgi');
    expect(canonicalNameForm('fiktadze')).toBe('fiktadze');
  });
});
