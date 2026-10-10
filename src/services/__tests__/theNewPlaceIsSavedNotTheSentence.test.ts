import { whereNowValue } from '../whereNowValue';

/** The tester's 49931 (1690 SMALL): the whole „where now?" answer was saved as the employer. */
describe('the answer to „where now?"', () => {
  it('keeps the place from the tester’s own sentence', () => {
    expect(whereNowValue('ახლა მზიანი სამართლის ბიუროშია.')).toBe('მზიანი სამართლის ბიურო');
  });

  it('gives a consonant stem its nominative back', () => {
    expect(whereNowValue('თიბისი ბანკში მუშაობს')).toBe('თიბისი ბანკი');
    expect(whereNowValue('უკვე თბილისშია')).toBe('თბილისი');
  });

  it('leaves a plain name as written, without the stop', () => {
    expect(whereNowValue('მწვანე ფინანსები')).toBe('მწვანე ფინანსები');
    expect(whereNowValue('„ბლუსქაი აუდიტი".')).toBe('ბლუსქაი აუდიტი');
  });

  it('reads the English answers too', () => {
    expect(whereNowValue('Now at Acme Ltd.')).toBe('Acme Ltd');
    expect(whereNowValue('She works at Bank of Georgia')).toBe('Bank of Georgia');
    expect(whereNowValue('Acme')).toBe('Acme');
  });

  it('never empties an answer it cannot read', () => {
    expect(whereNowValue('ახლა')).toBe('ახლა');
    expect(whereNowValue('...')).toBe('...');
  });
});
