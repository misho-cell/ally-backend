import { readFileSync } from 'fs';
import { join } from 'path';
import { assistantNameSection } from '../assistantName';

const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/** 0316 + Misho's yes (15 Oct): the owner's own name for the assistant reaches the model. */
describe('the assistant answers to the name the owner gave it', () => {
  it('says Misho’s sentence word for word when a name is set', () => {
    expect(assistantNameSection('მარიამი', 'ნინო')).toBe(
      '\n\nThe owner calls you „მარიამი". Answer to that name in the owner\'s own conversations; ' +
        'in messages to other people you are still „ნინო\'s assistant".',
    );
  });

  it('adds nothing when no name is set', () => {
    expect(assistantNameSection(null, 'ნინო')).toBe('');
    expect(assistantNameSection('   ', 'ნინო')).toBe('');
  });

  it('is read with the owner’s name, in the same query, and sits beside it', () => {
    expect(chat).toContain('\'SELECT name, assistant_name FROM "User" WHERE id = $1 LIMIT 1\'');
    expect(chat).toContain('nameSection +\n      assistantNameNote +');
  });
});
