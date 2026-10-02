import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #499 / #500 — Ninia, thread 30487: „(სახელი ვერ დავადასტურე ოფიციალურ
 * გვერდზე) (Paysera Bank Georgia-ს ხელმძღვანელი)". A second-circle row whose
 * name is withheld (row 296) was written up with a placeholder in brackets.
 */
describe('the note on a person whose name is withheld', () => {
  const source = readFileSync(join(__dirname, '..', 'tools', 'searchSecondDegree.ts'), 'utf8');
  const at = source.indexOf('const NAME_WITHHELD_NOTE =');
  const note = source.slice(at, source.indexOf(';', at));

  it('says how to say it — in words, by who knows them and what they do', () => {
    expect(note).toContain('Say it in words');
    expect(note).toContain('one more person through Tornike');
  });

  it('forbids a placeholder or a bracket where the name would be', () => {
    expect(note).toContain('never write a placeholder, a bracket or „name not confirmed"');
  });

  it('is still attached to every row that has no name to show', () => {
    expect(source).toContain('{ name_note: NAME_WITHHELD_NOTE }');
  });
});
