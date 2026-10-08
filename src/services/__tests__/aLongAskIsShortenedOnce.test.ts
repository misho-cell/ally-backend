jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../costLedger.service', () => ({ recordClaudeUsage: jest.fn(() => Promise.resolve()) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { SHORTEN_BRIEF, usableShortening } from '../askEditor.service';

/** 1687 (A4) second part, §106: a body over 400 characters is shortened once. */
describe('the shortening pass', () => {
  it('is §106 word for word', () => {
    const doc = readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'ADMIN_WRITE_OPERATIONS.md'),
      'utf8',
    );
    const approved = doc
      .slice(doc.indexOf('**§106'))
      .split('\n')
      .find((line) => line.startsWith('> Rewrite this question shorter'));
    expect(approved?.slice(2)).toBe(SHORTEN_BRIEF);
  });

  it('is used only when shorter, with every number kept and one question', () => {
    const original =
      'ნინოს სჭირდება 2 ოთახიანი ბინა ვაკეში, 800 დოლარამდე, 1 ნოემბრიდან — ხომ არ იცი ვინმე?';
    expect(
      usableShortening(
        original,
        'ნინოს სჭირდება 2 ოთახიანი ბინა ვაკეში, 800$-მდე, 1 ნოემბრიდან. იცი ვინმე?',
      ),
    ).not.toBeNull();
    expect(usableShortening(original, 'ნინოს სჭირდება ბინა ვაკეში. იცი ვინმე?')).toBeNull();
    expect(usableShortening(original, original + ' დიდი მადლობა!')).toBeNull();
    expect(
      usableShortening(original, 'ნინოს სჭირდება 2 ოთახიანი, 800, 1 ნოემბრიდან? იცი? ვინმე?'),
    ).toBeNull();
  });

  it('runs before the disclosure line, only over 400 characters', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    const at = asks.indexOf('1687 (A4): the body is measured');
    expect(asks.slice(at, at + 700)).toContain(
      'const shorter = await shortenedQuestion(edited.question);',
    );
  });
});
