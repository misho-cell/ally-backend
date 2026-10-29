import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ONE_WORD_TITLE_MAX_CHARS,
  parseShortTitles,
  SHORT_TITLE_MAX_CHARS,
  SHORT_TITLES_ON,
  shortTitlesPrompt,
  withWholeNames,
} from '../shortTitles';

/** 4919 (Giorgi, 13 Oct): 2–3 words on a desktop, one on a phone, naming the case. */
describe('the short titles', () => {
  it('are read from the model’s two lines', () => {
    expect(parseShortTitles('სანტექნიკოსი ვაკეში\nსანტექნიკოსი')).toEqual({
      short_title: 'სანტექნიკოსი ვაკეში',
      one_word_title: 'სანტექნიკოსი',
    });
  });

  it('drop numbering, quotes and a trailing period, and keep at most three words and one', () => {
    expect(parseShortTitles('1. „3 movers, Vake, 25 Sep."\n2) Movers.')).toEqual({
      short_title: 'movers Vake Sep',
      one_word_title: 'Movers',
    });
  });

  it('are nothing when a line is missing or too long to fit', () => {
    expect(parseShortTitles('only one line')).toBeNull();
    expect(parseShortTitles(`ok title\n${'ა'.repeat(ONE_WORD_TITLE_MAX_CHARS + 1)}`)).toBeNull();
    expect(parseShortTitles(`${'ა'.repeat(SHORT_TITLE_MAX_CHARS + 1)}\nok`)).toBeNull();
  });

  it('name the language and ask for two lines only', () => {
    const prompt = shortTitlesPrompt('Georgian');
    expect(prompt).toContain('Write in Georgian only');
    expect(prompt).toContain('exactly two lines');
  });
});

describe("after Misho's yes (§140)", () => {
  it('new titles get their short ones', () => {
    expect(SHORT_TITLES_ON).toBe(true);
  });

  it('a new title clears the short ones made from the old, and the list returns both', () => {
    const threads = readFileSync(join(__dirname, '..', 'threads.service.ts'), 'utf8');
    expect(threads).toContain('SET title = $1, short_title = NULL, one_word_title = NULL');
    expect(threads).toContain('t.short_title,\n       t.one_word_title,');
  });
});

/**
 * #6903 reopened (Giorgi, G-203, 29 Oct): the model drops a name's last letter
 * now and then; the full title has the name whole, and it is put back.
 */
describe('a name the model cut (#6903)', () => {
  it('gets its last letter back from the full title', () => {
    expect(
      parseShortTitles(
        'კარგი მზარეული გიორგ რესტორნისთვის\nმზარეული',
        'გიორგი ტურაშვილი: იცნობ კარგ მზარეულს?',
      )?.short_title,
    ).toBe('კარგი მზარეული გიორგი რესტორნისთვის');
  });

  it('leaves a word that is a name itself, and words that are not names', () => {
    expect(withWholeNames('ოთარ და გიორგ', 'ოთარი და გიორგი')).toBe('ოთარ და გიორგი');
    expect(withWholeNames('ახალ რესტორანს', 'ახალი რესტორანი')).toBe('ახალ რესტორანს');
  });
});
