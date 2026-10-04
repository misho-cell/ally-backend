import {
  BUTTONS_MARK,
  buttonSpellingNote,
  correctedLabels,
  editDistance,
  splitButtons,
  withoutButtonsLine,
} from '../buttonSpelling';

/** The tester's 1118 (5), the founder's yes in 1120: labels ride in the final writer's call. */
const keepNone = (): boolean => false;

describe('the buttons line in the final answer', () => {
  it('lists the labels for the writer, in order', () => {
    const note = buttonSpellingNote(['შევაჩყოთ', 'ფასუხს ველოდები']);
    expect(note).toContain('1. შევაჩყოთ');
    expect(note).toContain('2. ფასუხს ველოდები');
    expect(note).toContain(BUTTONS_MARK);
  });

  it('splits the answer from the labels', () => {
    const out = splitButtons(`პასუხი აქ არის.\n${BUTTONS_MARK} შევაჩეროთ | პასუხს ველოდები`);
    expect(out.text).toBe('პასუხი აქ არის.');
    expect(out.labels).toEqual(['შევაჩეროთ', 'პასუხს ველოდები']);
  });

  it('leaves an answer without the marker whole', () => {
    expect(splitButtons('მხოლოდ პასუხი.')).toEqual({ text: 'მხოლოდ პასუხი.', labels: null });
  });
});

describe('which corrected labels are kept', () => {
  it('takes a spelling fix', () => {
    expect(
      correctedLabels(['შევაჩყოთ', 'ფასუხს ველოდები'], ['შევაჩეროთ', 'პასუხს ველოდები'], keepNone),
    ).toEqual(['შევაჩეროთ', 'პასუხს ველოდები']);
  });

  it('takes a fix for one garbled word in a short label (1133, 36530)', () => {
    expect(
      correctedLabels(['მაიას ვაქვანაქრ გაცნობა'], ['მაიას ვთხოვ გაცნობას'], keepNone),
    ).toEqual(['მაიას ვთხოვ გაცნობას']);
  });

  it('refuses a rewording', () => {
    expect(correctedLabels(['შევაჩყოთ'], ['მოდი ყველაფერი გავაუქმოთ ახლავე'], keepNone)).toEqual([
      'შევაჩყოთ',
    ]);
  });

  it('keeps every original when the count differs', () => {
    expect(correctedLabels(['ა', 'ბ'], ['ა'], keepNone)).toEqual(['ა', 'ბ']);
    expect(correctedLabels(['ა', 'ბ'], null, keepNone)).toEqual(['ა', 'ბ']);
  });

  it('never touches a label the server protects', () => {
    const keep = (label: string): boolean => label === 'დამტკიცება';
    expect(correctedLabels(['დამტკიცება'], ['დამტკიცებაა'], keep)).toEqual(['დამტკიცება']);
  });

  it('refuses a foreign letter', () => {
    expect(correctedLabels(['დიახ'], ['დიაႮ'], keepNone)).toEqual(['დიახ']);
  });

  it('counts edits by letter', () => {
    expect(editDistance('შევაჩყოთ', 'შევაჩეროთ')).toBe(2);
    expect(editDistance('', 'აბ')).toBe(2);
  });
});

describe('the stream', () => {
  it('never shows the buttons line, even split across deltas', () => {
    const shown: string[] = [];
    const filter = withoutButtonsLine((d) => shown.push(d));
    for (const delta of ['პასუხი.', '\n⟦BUT', 'TONS⟧ ა | ბ', ' და კიდევ']) filter(delta);
    expect(shown.join('')).toBe('პასუხი.\n');
  });

  it('passes an ordinary answer through', () => {
    const shown: string[] = [];
    const filter = withoutButtonsLine((d) => shown.push(d));
    filter('ერთი ');
    filter('ორი');
    expect(shown.join('')).toBe('ერთი ორი');
  });
});
