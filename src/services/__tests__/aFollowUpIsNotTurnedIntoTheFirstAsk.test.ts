import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tester's 44650 (turn 5): the editor turned a follow-up back into the
 * goal's first ask, because it was given the owner's older lines too.
 */
describe('the words the editor keeps a question to', () => {
  it("are the owner's newest line only", () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('const OWNER_WORDS_LIMIT = 1;');
    expect(asks).toMatch(/ORDER BY c\.created_at DESC\s+LIMIT \$2/u);
  });
});
