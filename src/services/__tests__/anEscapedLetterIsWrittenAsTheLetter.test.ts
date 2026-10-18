import { labelWithForeignLetter, withEscapesAsLetters } from '../buttonLetters';

/** Ops' daily check, 18 Oct 18:41Z: a button carried „\u10d8" instead of „ი". */
describe('a button letter written as its escape', () => {
  it('is written as the letter it names', () => {
    expect(withEscapesAsLetters('დ\\u10d8ახ, გაუგზავნე')).toBe('დიახ, გაუგზავნე');
  });

  it('then passes the letter guard it used to fail', () => {
    const raw = 'დ\\u10d8ახ';
    expect(labelWithForeignLetter([raw])).not.toBeNull();
    expect(labelWithForeignLetter([withEscapesAsLetters(raw)])).toBeNull();
  });

  it('leaves a label with no escape exactly as it was', () => {
    expect(withEscapesAsLetters('ვადასტურებ')).toBe('ვადასტურებ');
    expect(withEscapesAsLetters('C:\\users')).toBe('C:\\users');
  });
});
