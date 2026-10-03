import { readFileSync } from 'fs';
import { join } from 'path';
import { ALSO_SEARCH_NOTE, relatedProfessionWords } from '../professionFamilies';

/**
 * Board #510 (conversation 30467): the real programmer, saved as a CTO and
 * software engineer, was found only after the owner pushed back twice. A tag
 * search for one word of a profession now names the family's other words.
 */
describe('relatedProfessionWords', () => {
  it('names the other words people use for a programmer', () => {
    const also = relatedProfessionWords('პროგრამისტი');
    expect(also).toEqual(expect.arrayContaining(['software', 'IT', 'CTO', 'დეველოპერი']));
    expect(also).not.toContain('პროგრამისტი');
  });

  it('matches whatever case and spacing the model used', () => {
    expect(relatedProfessionWords('  Programmer ')).toContain('software');
    expect(relatedProfessionWords('it')).toContain('პროგრამისტი');
  });

  it('keeps a different job out of the family', () => {
    expect(relatedProfessionWords('იურისტი')).not.toContain('ნოტარიუსი');
    expect(relatedProfessionWords('lawyer')).toContain('ადვოკატი');
  });

  it('names nothing for a word in no family', () => {
    expect(relatedProfessionWords('სანტექნიკოსი')).toEqual([]);
    expect(relatedProfessionWords('')).toEqual([]);
  });

  it('asks for the words in the same turn, once each', () => {
    expect(ALSO_SEARCH_NOTE).toContain('Before you answer');
    expect(ALSO_SEARCH_NOTE).toContain('that you have not searched yet');
  });

  it('is attached to the tag search result', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'search_by_tag': {"));
    expect(handler.slice(0, 700)).toContain('relatedProfessionWords(');
    expect(handler.slice(0, 700)).toContain('also_search: alsoSearch');
  });
});
