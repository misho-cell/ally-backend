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
jest.mock('../openingSearch.service', () => ({ __esModule: true, findWaysIn: jest.fn() }));
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
import { webLevel, webQueries } from '../researchWeb';
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
    expect(webSearch).toHaveBeenCalledTimes(3);
    expect(recordFixedUsage).toHaveBeenCalledTimes(3);
    expect(result.web_results).toHaveLength(2);
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
      'Colibri Promo Gifts',
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
