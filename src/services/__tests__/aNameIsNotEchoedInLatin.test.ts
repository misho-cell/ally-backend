import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutLatinEchoOfNames } from '../latinNameEcho';

/** The tester's 1145 (37876): „თემო ("Temo Eleqtrikosi")" in a Georgian reply. */
describe('the owner’s Latin label echoed in brackets', () => {
  it('goes after the Georgian name it repeats', () => {
    expect(withoutLatinEchoOfNames('თემო ("Temo Eleqtrikosi") ელექტრიკოსად გაქვს შენახული.')).toBe(
      'თემო ელექტრიკოსად გაქვს შენახული.',
    );
    expect(withoutLatinEchoOfNames('ქეთი („Keti Notarius") გიცნობს.')).toBe('ქეთი გიცნობს.');
  });

  it('stays when it is not an echo of the word before it', () => {
    const studio = 'გიორგი სოლომნიშვილი (სტუდია "solomongraphy")';
    expect(withoutLatinEchoOfNames(studio)).toBe(studio);
    const unquoted = 'სტუდია (Solomongraphy) მუშაობს.';
    expect(withoutLatinEchoOfNames(unquoted)).toBe(unquoted);
    const other = 'ფირმა ("Madart") ცხობს.';
    expect(withoutLatinEchoOfNames(other)).toBe(other);
  });

  it('is applied to Georgian replies only', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "if (language === 'ka') effectiveFinal = withoutLatinEchoOfNames(effectiveFinal);",
    );
  });
});
