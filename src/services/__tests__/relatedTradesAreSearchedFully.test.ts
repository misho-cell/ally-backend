jest.mock('../researchWeb', () => ({
  __esModule: true,
  webLevel: jest.fn().mockResolvedValue({ web_results: [], companies: [] }),
  webCounts: jest.fn().mockReturnValue('companies 0'),
}));
jest.mock('../tools/relatedTrades', () => ({
  __esModule: true,
  relatedTrades: jest.fn(),
  relatedFromModel: jest.requireActual('../tools/relatedTrades').relatedFromModel,
}));
jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));
jest.mock('../tools/searchByInsight', () => ({ __esModule: true, searchByInsight: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../farCircles.service', () => ({
  __esModule: true,
  FarDepth: { Labels: 'labels', Everything: 'everything' },
  farMembersHolding: jest.fn(),
}));
jest.mock('../tools/searchNeeds', () => ({ __esModule: true, searchNeeds: jest.fn() }));
jest.mock('../tools/findCompaniesForNeed', () => ({
  __esModule: true,
  findCompaniesForNeed: jest.fn(),
}));
jest.mock('../tools/findPeopleInBase', () => ({ __esModule: true, findPeopleInBase: jest.fn() }));
jest.mock('../tools/searchMeanings', () => ({ __esModule: true, searchMeanings: jest.fn() }));

import { ResearchDepth } from '../researchDepth';
import { query } from '../../db/postgres/client';
import { farMembersHolding } from '../farCircles.service';
import { forgetResearch, runFullResearch, takeResearch } from '../fullResearch.service';
import { webLevel } from '../researchWeb';
import { findCompaniesForNeed } from '../tools/findCompaniesForNeed';
import { findPeopleInBase } from '../tools/findPeopleInBase';
import { relatedFromModel, relatedTrades } from '../tools/relatedTrades';
import { searchByInsight } from '../tools/searchByInsight';
import { searchByTag } from '../tools/searchByTag';
import { searchMeanings } from '../tools/searchMeanings';
import { searchNeeds } from '../tools/searchNeeds';
import { searchSecondDegree } from '../tools/searchSecondDegree';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;

const OWNER = '186272';
const THREAD = 701;
const WORDS = 'ბრენდირებული თერმოსი';
const LINE = '30 ბრენდირებული თერმოსი მჭირდება გუნდისთვის';
const PRINTING = 'ბეჭდვა';
const PROMO = 'სარეკლამო სუვენირები';
const PRINT_SHOP = { phone: '+995599000111', name: 'Mariam Lomidze', label: 'ბეჭდვა' };

/**
 * Misho, 16 Nov (the tester's thermos case): her own contact saved as a print
 * shop was never offered — nothing searched for printing. „If related words
 * are searched, the search on them must be enough too."
 */
function aNetworkWithAPrintShop(): void {
  mocked(relatedTrades).mockResolvedValue([PRINTING, PROMO]);
  mocked(searchMeanings).mockImplementation(async (_u: string, w: string) =>
    w === WORDS
      ? new Map([['თერმოსი', ['thermos']]])
      : new Map([[PRINTING.toLowerCase(), ['printing', 'печать']]]),
  );
  mocked(searchByTag).mockImplementation(async (_u: string, w: string) => ({
    results: w === PRINTING ? [PRINT_SHOP] : [],
  }));
  mocked(searchByInsight).mockResolvedValue({ results: [] });
  mocked(searchSecondDegree).mockResolvedValue({ results: [] });
  mocked(farMembersHolding).mockResolvedValue([]);
  mocked(searchNeeds).mockResolvedValue({ results: [] });
  mocked(findCompaniesForNeed).mockResolvedValue({ companies: [] });
  mocked(findPeopleInBase).mockResolvedValue({ results: [] });
  mocked(query).mockResolvedValue({ rows: [] } as never);
}

const request = (ownerLine: string = LINE) => ({
  userId: OWNER,
  threadId: THREAD,
  taskId: 1,
  words: WORDS,
  ownerLine,
  withheld: new Set<string>(),
  askedAt: new Date(0),
  depth: ResearchDepth.Deep,
});

describe('the related trades of a request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetResearch();
    aNetworkWithAPrintShop();
  });

  it('are searched at every network level, each with its own meanings', async () => {
    await runFullResearch(request());
    const searched = (fn: unknown): unknown[] => mocked(fn).mock.calls.map(([, w]) => w);
    for (const fn of [searchByTag, searchSecondDegree]) {
      expect(searched(fn)).toEqual(expect.arrayContaining([PRINTING, PROMO]));
    }
    expect(mocked(farMembersHolding).mock.calls.map(([, w]) => w)).toEqual(
      expect.arrayContaining([PRINTING, PROMO]),
    );
    const meanings = mocked(searchByTag).mock.calls[0][2] as Map<string, string[]>;
    expect(meanings.get(PRINTING)).toEqual(['printing', 'печать']);
  });

  it('are asked of the company and people bases, and given to the web', async () => {
    await runFullResearch(request());
    expect(mocked(findCompaniesForNeed).mock.calls[0][1]).toContain(PRINTING);
    expect(mocked(findPeopleInBase).mock.calls[0][1]).toContain(PROMO);
    expect(mocked(webLevel).mock.calls[0][0]).toMatchObject({ related: [PRINTING, PROMO] });
  });

  it('bring the print shop to the model, with the trades named', async () => {
    await runFullResearch(request(), () => 0);
    const section = (await takeResearch(OWNER, THREAD, 1))?.section ?? '';
    expect(section).toContain(PRINT_SHOP.name);
    expect(section).toContain(
      `searched as fully as the request’s own words: ${PRINTING}, ${PROMO}`,
    );
  });

  it('are not asked for when the request names a person', async () => {
    await runFullResearch(request('დამაკავშირე ნინო ბერიძესთან'));
    expect(relatedTrades).not.toHaveBeenCalled();
  });
});

describe('the related trades the model gives', () => {
  it('are short, distinct, never the search’s own words, at most four', () => {
    expect(
      relatedFromModel(
        '{"related": ["ბეჭდვა", "ბეჭდვა", "თერმოსი", "ერთი ძალიან გრძელი აღწერა აქ", "სტამბა", "საჩუქრები", "ბრენდინგი", "პრომო"]}',
        'ბრენდირებული თერმოსი',
      ),
    ).toEqual(['ბეჭდვა', 'სტამბა', 'საჩუქრები', 'ბრენდინგი']);
  });

  it('are none when the reply is not JSON', () => {
    expect(relatedFromModel('no', 'x')).toEqual([]);
  });
});
