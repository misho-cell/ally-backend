import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 44654 (six-turn case, turn 5): „ზაზას სახელოსნო შაბათსაც
 * მუშაობს?" reached the helper as „do you work on Saturdays?". Rule 1 said
 * „you" with no exception. Misho's yes, 7 Oct.
 */
describe("the editor's rule 1", () => {
  it('keeps a third person the owner named in the third person', () => {
    const editor = readFileSync(join(__dirname, '..', 'askEditor.service.ts'), 'utf8');
    expect(editor).toContain('A third person the owner');
    expect(editor).toContain('stays in the third person, by name');
  });
});
