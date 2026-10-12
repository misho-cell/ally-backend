import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * D647 / 4687 (box 54550): the architect request reached the helper almost
 * word for word. The editor's rule 8, Misho's yes word for word (§133).
 */
describe('a question is said in the editor\u2019s own words', () => {
  const source = readFileSync(join(__dirname, '..', 'askEditor.service.ts'), 'utf8');

  it('carries rule 8 exactly as approved, inside the brief', () => {
    expect(source).toContain(
      '"8. It never copies the owner\'s sentences word for word: it says what they need in its own " +',
    );
    expect(source).toContain(
      "'words, in at most two short sentences, keeping every fact the reader needs to answer.'",
    );
    const brief = source.slice(source.indexOf('function editorBrief'));
    expect(brief.indexOf('OWN_WORDS_RULE,')).toBeGreaterThan(brief.indexOf('7. Every name'));
  });
});
