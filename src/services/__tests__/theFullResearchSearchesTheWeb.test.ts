jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/webSearchProvider', () => ({
  __esModule: true,
  webSearchLedger: jest.fn().mockResolvedValue({ provider: 'test', priceKey: 'test' }),
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../wayInNames.service', () => ({ __esModule: true, wayInNamesFrom: jest.fn() }));
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

import { recordFixedUsage } from '../costLedger.service';
import { farMembersHolding } from '../farCircles.service';
import { findWaysIn } from '../openingSearch.service';
import { allWebQueries, webLevel, webQueries } from '../researchWeb';
import { searchSecondDegree } from '../tools/searchSecondDegree';
import { webSearch } from '../tools/webSearch';
import { wayInNamesFrom } from '../wayInNames.service';

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

/**
 * Misho, 16 Nov: „the detailed search should search the web too — find the
 * many companies that do this, and then the owner's people at each of them".
 */
describe('the full research’s web level', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked(webSearch).mockImplementation(async (q: string) => ({
      results: q === WORDS ? [COLIBRI, PROMO] : [COLIBRI],
    }));
    mocked(wayInNamesFrom).mockResolvedValue(['Colibri', 'Promo Gifts']);
    mocked(findWaysIn).mockResolvedValue(
      new Map([
        ['Colibri', { kind: 'none' }],
        ['Promo Gifts', { kind: 'first_circle', who: 'Mariam Lomidze' }],
      ]),
    );
    mocked(searchSecondDegree).mockResolvedValue({ results: [] });
    mocked(farMembersHolding).mockResolvedValue([NINO]);
  });

  it('searches the web in the request’s words and in its meanings’ other scripts', () => {
    expect(webQueries(WORDS, MEANINGS)).toEqual([
      WORDS,
      'branded thermos',
      'брендированный термос',
    ]);
    expect(webQueries(WORDS, new Map())).toEqual([WORDS]);
  });

  it('charges each search, and keeps each page once', async () => {
    const result = (await webLevel({
      userId: '186272',
      threadId: 1,
      words: WORDS,
      ownerLine: '',
      meanings: MEANINGS,
    })) as { web_results: unknown[] };
    // Three for the request, one for the head of the firm the owner has nobody at.
    expect(webSearch).toHaveBeenCalledTimes(4);
    expect(recordFixedUsage).toHaveBeenCalledTimes(4);
    expect(result.web_results).toHaveLength(2);
  });

  it('searches the related trades too, two at most', () => {
    expect(
      allWebQueries({
        userId: '186272',
        threadId: 1,
        words: WORDS,
        ownerLine: '',
        meanings: new Map(),
        related: ['ბეჭდვა', 'სტამბა', 'სუვენირები'],
      }),
    ).toEqual([WORDS, 'ბეჭდვა', 'სტამბა']);
  });

  /**
   * The tester's case, 16 Nov: a found firm's head was her own contact, and the
   * web names him as its head when the head is searched.
   */
  it('looks up the head of a firm the owner has nobody at, and matches them as a person', async () => {
    mocked(wayInNamesFrom).mockImplementation(async (result: { results: { title: string }[] }) =>
      result.results.some((r) => r.title.includes('CEO'))
        ? ['Colibri', 'Levan Japaridze']
        : ['Colibri', 'Promo Gifts'],
    );
    mocked(webSearch).mockImplementation(async (q: string) => ({
      results: q.startsWith('Colibri ') ? [{ title: 'Levan Japaridze — CEO, Colibri' }] : [COLIBRI],
    }));
    mocked(findWaysIn).mockImplementation(async (_u: string, names: string[]) =>
      names.includes('Levan Japaridze')
        ? new Map([['Levan Japaridze', { kind: 'first_circle', who: 'Levan Japaridze' }]])
        : new Map([
            ['Colibri', { kind: 'none' }],
            ['Promo Gifts', { kind: 'first_circle', who: 'Mariam Lomidze' }],
          ]),
    );
    const result = await webLevel({
      userId: '186272',
      threadId: 1,
      words: WORDS,
      ownerLine: '',
      meanings: new Map(),
    });
    expect(webSearch).toHaveBeenCalledWith(expect.stringMatching(/^Colibri CEO director founder/));
    expect(webSearch).not.toHaveBeenCalledWith(expect.stringMatching(/^Promo Gifts CEO/));
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
          heads_on_the_web: [
            { name: 'Levan Japaridze', owner_contact: 'the owner’s own contact: Levan Japaridze' },
          ],
        },
        { name: 'Promo Gifts' },
      ],
    });
  });

  it('looks for the owner’s people at every company, in their own contacts and further out', async () => {
    const result = await webLevel({
      userId: '186272',
      threadId: 1,
      words: WORDS,
      ownerLine: 'I need branded thermoses',
      meanings: MEANINGS,
    });
    expect(findWaysIn).toHaveBeenCalledWith('186272', ['Colibri', 'Promo Gifts'], { threadId: 1 });
    expect(searchSecondDegree).toHaveBeenCalledWith(
      '186272',
      // Both alphabets: members save a firm as it sounds (ops, 16 Nov: „brendhendi").
      'Colibri Promo Gifts ცოლიბრი პრომო გიფც',
      'I need branded thermoses',
    );
    expect(result).toMatchObject({
      companies: [
        { name: 'Colibri', owner_contact_there: 'none' },
        { name: 'Promo Gifts', owner_contact_there: 'the owner’s own contact: Mariam Lomidze' },
      ],
      people_saved_under_these_companies: { further_out: [NINO] },
    });
  });

  it('looks for nobody when the web names no company', async () => {
    mocked(wayInNamesFrom).mockResolvedValue([]);
    const result = await webLevel({
      userId: '186272',
      threadId: 1,
      words: WORDS,
      ownerLine: '',
      meanings: new Map(),
    });
    expect(result).toMatchObject({ companies: [] });
    expect(findWaysIn).not.toHaveBeenCalled();
    expect(searchSecondDegree).not.toHaveBeenCalled();
  });
});
