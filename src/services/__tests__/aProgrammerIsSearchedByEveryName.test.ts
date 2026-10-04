import { readFileSync } from 'fs';
import { join } from 'path';
import { ALSO_SEARCHED_NOTE, relatedProfessionWords } from '../professionFamilies';
import { mergeFamilyResults, searchProfessionFamily } from '../professionSearch';

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
    expect(relatedProfessionWords('მზარეული')).toEqual([]);
    expect(relatedProfessionWords('')).toEqual([]);
  });

  it('tells the run the words were already searched', () => {
    expect(ALSO_SEARCHED_NOTE).toContain('were searched together with yours');
    expect(ALSO_SEARCHED_NOTE).toContain('Do not search them again');
  });

  it('is searched by the server inside the tag search', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'search_by_tag': {")).slice(0, 900);
    expect(handler).toContain('relatedProfessionWords(');
    expect(handler).toContain('await searchProfessionFamily(found, related, (word) =>');
    expect(handler).toContain('searchByTag(userId, word)');
  });
});

/**
 * The tester's 1086: the model searched five of eleven words, never „CTO", and
 * answered „no programmer" twice. The server now searches the family itself.
 */
describe('searchProfessionFamily', () => {
  const sandro = { phone: 'phone-id-1', name: 'Sandro CTO', tags: ['CTO'] };

  it('finds the CTO when the owner asked for a programmer', async () => {
    const search = jest.fn(async (word: string) =>
      word === 'CTO' ? { found: true, results: [sandro] } : { found: false },
    );
    const merged = await searchProfessionFamily(
      { found: false, query: 'პროგრამისტი' },
      relatedProfessionWords('პროგრამისტი'),
      search,
    );
    expect(search).toHaveBeenCalledWith('CTO');
    expect(merged).toMatchObject({
      found: true,
      count: 1,
      results: [{ ...sandro, matched_word: 'CTO' }],
    });
    expect((merged as { also_searched: string[] }).also_searched).toContain('CTO');
  });

  it('lists a person found by two words once', () => {
    const merged = mergeFamilyResults({ found: true, results: [sandro] }, [
      { word: 'CTO', result: { results: [{ ...sandro, phone: 'phone-id-1' }] } },
    ]);
    expect(merged).toMatchObject({ count: 1 });
  });

  it('leaves out approximate matches of the other words', () => {
    const merged = mergeFamilyResults({ found: false }, [
      { word: 'IT', result: { results: [{ phone: '1', name: 'Mitya', approximate: true }] } },
    ]);
    expect(merged).toMatchObject({ found: false, count: 0 });
  });

  it('skips a word whose search failed and keeps the rest', async () => {
    const search = jest.fn(async (word: string) => {
      if (word === 'IT') throw new Error('timeout');
      return word === 'CTO' ? { results: [sandro] } : { results: [] };
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const merged = await searchProfessionFamily({ found: false }, ['IT', 'CTO'], search);
    expect(merged).toMatchObject({ found: true, count: 1, also_searched: ['CTO'] });
    warn.mockRestore();
  });
});

/** The tester's 1111 (34175): „ცეკვა" missed a friend's „ცეკვის მასწავლებელი". */
describe('the dance family', () => {
  it('reaches the saved label from every word asked with, the saved label first', () => {
    expect(relatedProfessionWords('ცეკვა')[0]).toBe('ცეკვის მასწავლებელი');
    expect(relatedProfessionWords('ქორეოგრაფია').slice(0, 3)).toContain('ცეკვის მასწავლებელი');
    expect(relatedProfessionWords('ცეკვის მასწავლებელი')).toContain('ქორეოგრაფი');
  });
});

/** The tester's 1131 (V3, 36320): the asked word and its family go at once. */
describe('the family search does not wait for the first word', () => {
  it('starts every family word before the first answer comes back', async () => {
    const started: string[] = [];
    let releaseFirst: (v: unknown) => void = () => undefined;
    const first = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const search = (word: string): Promise<unknown> => {
      started.push(word);
      return Promise.resolve({ found: false });
    };
    const merging = searchProfessionFamily(first, ['designer', 'UX'], search);
    await Promise.resolve();
    expect(started).toEqual(['designer', 'UX']);
    releaseFirst({ found: false });
    await merging;
  });
});
