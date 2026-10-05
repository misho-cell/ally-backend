import { readFileSync } from 'fs';
import { join } from 'path';
import { OWNERS_LINE_QUOTED_REFUSAL, ownersLineQuoted } from '../factKeeping';

/** D648 in the asker's direction (the tester's 1152, 38572). */
describe('a question that repeats the owner’s own message', () => {
  const owner = ['ხუთშაბათს ვერ ვახერხებ. პარასკევს 12 საათზე შეიძლება?'];

  it('is found when the owner’s line is inside it whole', () => {
    expect(
      ownersLineQuoted(
        'ხუთშაბათს ვერ ვახერხებ. პარასკევს 12 საათზე შეიძლება? გთხოვ, მითხარი.',
        owner,
      ),
    ).toBe('ხუთშაბათს ვერ ვახერხებ.');
  });

  it('is not found when the assistant says it in its own words with the same facts', () => {
    expect(
      ownersLineQuoted('ხუთშაბათი არ გამოუვა — პარასკევს 12 საათზე თუ შეძლებ შეხვედრას?', owner),
    ).toBeNull();
    expect(ownersLineQuoted('კი, ვკითხავ.', ['კი'])).toBeNull();
  });

  it('is held back with a rewrite, before the ask goes', () => {
    expect(OWNERS_LINE_QUOTED_REFUSAL).toContain('never a quotation');
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      "return { sent: false, reason: 'owner_quoted', error: OWNERS_LINE_QUOTED_REFUSAL };",
    );
  });
});
