import { readFileSync } from 'fs';
import { join } from 'path';

/** 2183 (§98.7): „Orbisi" for „ორბიში", a changed surname, „introduce me" — the editor's rules. */
describe('theEditorKeepsNamesPlain', () => {
  const source = readFileSync(join(__dirname, '..', 'askEditor.service.ts'), 'utf8');

  it('names first-person introduction forms as failures', () => {
    expect(source).toContain('„introduce me", „get me introduced"');
    expect(source).toContain('„გამაცნობ"');
  });

  it('keeps every name in its plain form, unchanged, in Latin letters outside Georgian', () => {
    expect(source).toContain('a Georgian case ending is not part of a name');
    expect(source).toContain('A name or surname is never changed.');
    expect(source).toContain('names are written in Latin letters');
  });
});
