import { readFileSync } from 'fs';
import { join } from 'path';
import { titleSnippetFrom } from '../taskAsks.service';

/** #6903 (Giorgi, G-166): „გიორგ თბილისში სახლის" — a word cut, a phrase left unfinished. */
describe('the title of a question someone receives', () => {
  const long = 'გიორგი ტურაშვილი თბილისში სახლის აშენებას გეგმავს და სანდო მშენებელს ეძებს';

  it('ends at a whole word', () => {
    const title = titleSnippetFrom(long);
    expect(title.endsWith('…')).toBe(true);
    const words = title.slice(0, -1).split(' ');
    expect(long.split(' ').slice(0, words.length)).toEqual(words);
  });

  it('is the whole question when it is short', () => {
    expect(titleSnippetFrom('სანდო მშენებელი ხომ არ იცი?')).toBe('სანდო მშენებელი ხომ არ იცი?');
  });

  it('drops a greeting before it', () => {
    expect(titleSnippetFrom('გამარჯობა ლიკა! სანდო მშენებელი ხომ არ იცი?')).toBe(
      'სანდო მშენებელი ხომ არ იცი?',
    );
  });

  it('has its short title made from the whole question, not the cut one', () => {
    const source = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(source).toContain('title: askThreadTitle(senderName, titleBodyOf(safeQuestion)),');
  });
});
