import { withoutEchoedOriginal } from '../askTranslation.service';

/** The tester's 44659 (ask 15159): both languages and a label reached the reader. */
describe('a translation that echoes the original', () => {
  const ORIGINAL = 'დათოს პატარა მაღაზიისთვის ბუღალტერი სჭირდება, ვინმეს ურჩევდი?';

  it('keeps only the translated part, without the label or quotes', () => {
    const reply = `${ORIGINAL}\n\nTranslation: "Dato needs an accountant for his small shop, could you recommend someone?"`;
    expect(withoutEchoedOriginal(reply, ORIGINAL)).toBe(
      'Dato needs an accountant for his small shop, could you recommend someone?',
    );
  });

  it('is empty when the reply is only the original', () => {
    expect(withoutEchoedOriginal(ORIGINAL, ORIGINAL)).toBe('');
  });

  it('leaves an ordinary translation alone', () => {
    const plain = 'Dato needs an accountant for his small shop. Could you recommend someone?';
    expect(withoutEchoedOriginal(plain, ORIGINAL)).toBe(plain);
  });
});
