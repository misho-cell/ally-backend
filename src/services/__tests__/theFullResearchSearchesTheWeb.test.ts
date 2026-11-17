jest.mock('../tools/webSearch', () => ({
  __esModule: true,
  webSearch: jest.fn(),
  fetchPage: jest.fn(),
}));
jest.mock('../tools/webSearchProvider', () => ({
  __esModule: true,
  webSearchLedger: jest.fn().mockResolvedValue({ provider: 'test', priceKey: 'test' }),
  pageFetchLedger: jest.fn().mockResolvedValue({ provider: 'test', priceKey: 'page' }),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../wayInNames.service', () => ({
  __esModule: true,
  wayInNamesFrom: jest.fn(),
  wayInNamesFromAll: jest.fn(),
}));
jest.mock('../openingSearch.service', () => ({
  __esModule: true,
  findWaysIn: jest.fn(),
  firmInTheOtherScript: jest.requireActual('../openingSearch.service').firmInTheOtherScript,
}));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../farCircles.service', () => ({
  __esModule: true,
  FarDepth: { Labels: 'labels', Everything: 'everything' },
  farMembersHolding: jest.fn(),
}));
jest.mock('../researchBridges', () => ({
  __esModule: true,
  firmSpellings: jest.requireActual('../researchBridges').firmSpellings,
  firmPeopleThroughContacts: jest.fn(),
  namedPeopleThroughContacts: jest.fn(),
}));

import { recordFixedUsage } from '../costLedger.service';
import { farMembersHolding } from '../farCircles.service';
import { findWaysIn } from '../openingSearch.service';
import { firmPeopleThroughContacts, namedPeopleThroughContacts } from '../researchBridges';
import {
  allWebQueries,
  pageWords,
  readingOf,
  siteNameOf,
  webCounts,
  webLevel,
  webQueries,
} from '../researchWeb';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { fetchPage, webSearch } from '../tools/webSearch';
import { wayInNamesFrom, wayInNamesFromAll } from '../wayInNames.service';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;

const WORDS = 'ბრენდირებული თერმოსი';
const MEANINGS = new Map([
  ['ბრენდირებული', ['branded', 'брендированный']],
  ['თერმოსი', ['thermos', 'термос']],
]);
const COLIBRI = {
  title: 'Colibri — branded thermoses',
  url: 'https://colibri.example',
  snippet: 'x',
};
const PROMO = { title: 'Promo Gifts', url: 'https://promo.example', snippet: 'y' };
const NINO = { phone: '+995599000111', name: 'Nino Beridze', via: ['Levan Japaridze'] };
const REQUEST = {
  userId: '186272',
  threadId: 1,
  words: WORDS,
  ownerLine: 'I need branded thermoses',
  meanings: MEANINGS,
};

/**
 * Misho, 16 Nov: „the detailed search should search the web too — find the
 * many companies that do this, and then the owner's people at each of them".
 * Misho, 17 Nov: search much more, take up to half an hour.
 */
describe('the full research’s web level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked(webSearch).mockImplementation(async (q: string) => ({
      results: q === WORDS ? [COLIBRI, PROMO] : [COLIBRI],
    }));
    mocked(fetchPage).mockResolvedValue({ content: 'We print logos on thermoses and mugs.' });
    mocked(wayInNamesFromAll).mockResolvedValue(['Colibri', 'Promo Gifts']);
    mocked(wayInNamesFrom).mockResolvedValue([]);
    mocked(findWaysIn).mockResolvedValue(
      new Map([
        ['Colibri', { kind: 'none' }],
        ['Promo Gifts', { kind: 'first_circle', who: 'Mariam Lomidze' }],
      ]),
    );
    mocked(searchSecondDegree).mockResolvedValue({ results: [] });
    mocked(farMembersHolding).mockResolvedValue([NINO]);
    mocked(firmPeopleThroughContacts).mockResolvedValue(new Map());
    mocked(namedPeopleThroughContacts).mockResolvedValue(new Map());
  });

  it('searches the web in the request’s words, its meanings’ other scripts and other words', () => {
    expect(webQueries(WORDS, MEANINGS)).toEqual([
      WORDS,
      'branded thermos',
      'брендированный термос',
    ]);
    const more = new Map([
      ['ბრენდირებული', ['branded', 'custom', 'ლოგოიანი']],
      ['თერმოსი', ['thermos', 'flask', 'თერმობოთლი']],
    ]);
    expect(webQueries(WORDS, more)).toEqual([
      WORDS,
      'branded thermos',
      'ლოგოიანი თერმობოთლი',
      'custom flask',
    ]);
    expect(webQueries(WORDS, new Map())).toEqual([WORDS]);
  });

  it('searches every related trade too', () => {
    expect(
      allWebQueries({
        ...REQUEST,
        meanings: new Map(),
        related: ['ბეჭდვა', 'სტამბა', 'სუვენირები'],
      }),
    ).toEqual([WORDS, 'ბეჭდვა', 'სტამბა', 'სუვენირები']);
  });

  it('charges every search and every page read, and keeps each result once', async () => {
    const result = (await webLevel(REQUEST)) as { web_results: unknown[] };
    // Three for the request, one head search for each of the two firms.
    expect(webSearch).toHaveBeenCalledTimes(5);
    // Each firm's own page.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(recordFixedUsage).toHaveBeenCalledTimes(7);
    expect(result.web_results).toHaveLength(2);
  });

  /** The tester, 17 Nov: 60 results, and the companies were named from the first eight. */
  it('names the companies from every result, not the first few', async () => {
    await webLevel(REQUEST);
    expect(wayInNamesFromAll).toHaveBeenCalledWith(
      { results: expect.any(Array) },
      20,
      expect.objectContaining({ userId: '186272' }),
    );
  });

  /**
   * The tester's cases: on 16 Nov a found firm's head was her own contact, on
   * 17 Nov he was a friend's — and the head searches read other firms' chiefs.
   */
  it('reads a head only from results naming the firm, and finds him in a friend’s phone', async () => {
    const head = { title: 'Levan Japaridze — CEO, Colibri', url: 'https://in.example/l' };
    mocked(webSearch).mockImplementation(async (q: string) => ({
      results: q.startsWith('Colibri ')
        ? [head, { title: 'Some Other Firm CEO', url: 'https://other.example' }]
        : [COLIBRI],
    }));
    mocked(wayInNamesFrom).mockImplementation(async (r: { results: { title: string }[] }) =>
      r.results.some((h) => h.title.includes('Japaridze')) ? ['Levan Japaridze', 'Colibri'] : [],
    );
    const via = { saved_by_your_contact_as: 'Levan Japaridze', your_contact: 'Nino Beridze' };
    mocked(namedPeopleThroughContacts).mockResolvedValue(new Map([['Levan Japaridze', [via]]]));
    const result = await webLevel(REQUEST);
    const read = mocked(wayInNamesFrom).mock.calls.map((c) => c[0].results);
    expect(read).toContainEqual([head]);
    expect(findWaysIn).toHaveBeenCalledWith(
      '186272',
      ['Levan Japaridze'],
      { threadId: 1 },
      undefined,
      { everyNameIsAPerson: true },
    );
    expect(result).toMatchObject({
      companies: [
        {
          name: 'Colibri',
          heads_on_the_web: [{ name: 'Levan Japaridze', through_your_contacts: [via] }],
        },
        { name: 'Promo Gifts' },
      ],
    });
  });

  it('looks for the owner’s people at every company, through their contacts too', async () => {
    const mariam = {
      saved_by_your_contact_as: 'Mariam',
      your_contact: 'Levan Japaridze',
      labelled_with_the_firm_by: 3,
    };
    mocked(firmPeopleThroughContacts).mockResolvedValue(new Map([['Colibri', [mariam]]]));
    const result = await webLevel(REQUEST);
    expect(findWaysIn).toHaveBeenCalledWith('186272', ['Colibri', 'Promo Gifts'], { threadId: 1 });
    expect(firmPeopleThroughContacts).toHaveBeenCalledWith(
      '186272',
      new Map([
        ['Colibri', ['colibri']],
        ['Promo Gifts', []],
      ]),
    );
    expect(searchSecondDegree).toHaveBeenCalledWith(
      '186272',
      // Both alphabets: members save a firm as it sounds (ops, 16 Nov: „brendhendi").
      'Colibri Promo Gifts ცოლიბრი პრომო გიფც',
      'I need branded thermoses',
    );
    expect(result).toMatchObject({
      companies: [
        {
          name: 'Colibri',
          owner_contact_there: 'none',
          people_your_contacts_hold_there: [mariam],
          its_page: { url: 'https://colibri.example', mentions: expect.arrayContaining(['therm']) },
        },
        { name: 'Promo Gifts', owner_contact_there: 'the owner’s own contact: Mariam Lomidze' },
      ],
      people_saved_under_these_companies: { further_out: [NINO] },
    });
    expect(webCounts(result)).toBe(
      'results 2, companies 2, own contact there 1, through contacts 1, pages read 2, ' +
        'pages saying it 2, heads 0, heads reachable 0',
    );
  });

  it('looks for nobody when the web names no company', async () => {
    mocked(wayInNamesFromAll).mockResolvedValue([]);
    const result = await webLevel(REQUEST);
    expect(result).toMatchObject({ companies: [] });
    expect(findWaysIn).not.toHaveBeenCalled();
    expect(searchSecondDegree).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('reading a company’s own page (the tester, 17 Nov)', () => {
  it('looks for the request’s words in their shared forms, and quotes where', () => {
    const words = pageWords({ ...REQUEST, words: 'თერმოსების დამზადება' });
    expect(words).toEqual(expect.arrayContaining(['თერმოს']));
    const page = 'Hello. ჩვენ ვამზადებთ თერმოსებს ლოგოთი.';
    const reading = readingOf('https://x.example', page, words);
    expect(reading.mentions).toContain('თერმოს');
    expect(reading.excerpt).toContain('თერმოსებს');
    expect(readingOf('https://x.example', 'Only mugs here.', words).mentions).toEqual([]);
  });

  it('takes the site’s name as the firm’s when it spells the same name', () => {
    expect(siteNameOf('https://brandhand.ge/ka', 'ბრენდჰენდი')).toBe('brandhand');
    expect(siteNameOf('https://www.facebook.com/brandhand', 'ბრენდჰენდი')).toBe('');
    expect(siteNameOf(undefined, 'ბრენდჰენდი')).toBe('');
  });
});
