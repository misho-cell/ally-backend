import { readFileSync } from 'fs';
import { join } from 'path';
import { notInThePhonebook } from '../chat.service';

/**
 * #1387 (Tornike, Pr1): Lika asked about a director Tornike has saved; her run
 * searched only her own phonebook by name and answered „not found".
 */
describe('a name not in the owner’s phonebook is looked for one ring out', () => {
  it('sends the run further when nothing matched', () => {
    expect(notInThePhonebook({ found: false, query: 'X' })).toBe(true);
  });

  it('sends it further when every row is only a near-match', () => {
    expect(
      notInThePhonebook({ found: true, results: [{ approximate: true }, { approximate: true }] }),
    ).toBe(true);
  });

  it('stops when the person is saved', () => {
    expect(
      notInThePhonebook({ found: true, results: [{ approximate: true }, { name: 'X' }] }),
    ).toBe(false);
  });

  it('leaves a search that could not run alone', () => {
    expect(notInThePhonebook({ error: 'did not finish' })).toBe(false);
  });

  it('tells the model to search the second circle and the web before answering', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('look_further: LOOK_ONE_RING_OUT');
    expect(chat).toContain('search_second_degree with the full name');
    expect(chat).toContain('Never answer „not found" from the phonebook alone.');
  });
});

/** #1849 (the tester's world Z, 2 of 3): an empty tag search ended on the web. */
describe('an empty tag search walks the network too', () => {
  it('walks further and says to search the second circle', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'search_by_tag': {")).slice(0, 1200);
    expect(handler).toContain('notInThePhonebook(searched)');
    expect(handler).toContain('withFurtherOut(');
    expect(handler).toContain('look_further: LOOK_INTO_THE_NETWORK');
    expect(chat).toContain('search_second_degree with the same words');
  });
});
