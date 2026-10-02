import { buildRawWordGroups, splitIntoWords, toWordStartPattern } from '../transliterate';

/**
 * Team task #373: a contact saved only as an emoji was not found by asking
 * about that emoji. Two causes, both on the query side: the word was trimmed
 * to nothing as „punctuation", and a symbol behind `\m` (word start) can never
 * match in PostgreSQL — measured on prod: '💙' ~ '\m💙' is false.
 */
describe('a query that is an emoji', () => {
  it('keeps the emoji as a word instead of trimming it to nothing', () => {
    expect(splitIntoWords('💙')).toEqual(['💙']);
    expect(splitIntoWords('who is 💙?')).toEqual(['who', 'is', '💙']);
    expect(buildRawWordGroups('💙')).toEqual([['💙']]);
  });

  it('still drops a word that is only punctuation', () => {
    expect(splitIntoWords('Nino ? —')).toEqual(['Nino']);
  });

  it('matches the emoji where it stands, with or without the emoji-style selector', () => {
    const pattern = new RegExp(toWordStartPattern('❤️'), 'u');
    expect(pattern.test('❤️')).toBe(true);
    expect(pattern.test('❤')).toBe(true);
    expect(pattern.test('Mom ❤️')).toBe(true);
    expect(toWordStartPattern('💙')).not.toContain('\\m');
  });

  it('leaves word terms anchored as before', () => {
    expect(toWordStartPattern('nino')).toBe('\\mnino\\M');
    expect(toWordStartPattern('c++')).toBe('\\mc\\+\\+');
  });
});
