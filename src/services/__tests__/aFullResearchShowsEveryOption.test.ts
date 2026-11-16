jest.mock('../tools/relatedTrades', () => ({
  __esModule: true,
  relatedTrades: jest.fn().mockResolvedValue([]),
}));
jest.mock('../researchWeb', () => ({
  __esModule: true,
  webLevel: jest.fn().mockResolvedValue({ web_results: [], companies: [] }),
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

import { query } from '../../db/postgres/client';
import { farMembersHolding } from '../farCircles.service';
import {
  forgetResearch,
  LevelFindings,
  narrowestFirst,
  ResearchLevel,
  researchCounts,
  runFullResearch,
  singleWords,
  takeResearch,
} from '../fullResearch.service';
import { aboutOf, peopleListed, personRowsIn } from '../researchPeopleList';
import { findCompaniesForNeed } from '../tools/findCompaniesForNeed';
import { findPeopleInBase } from '../tools/findPeopleInBase';
import { searchByInsight } from '../tools/searchByInsight';
import { searchByTag } from '../tools/searchByTag';
import { searchMeanings } from '../tools/searchMeanings';
import { searchNeeds } from '../tools/searchNeeds';
import { searchSecondDegree } from '../tools/searchSecondDegree';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;

const OWNER = '186272';
const THREAD = 601;
const WORDS = 'პროდუქტის ფოტოგრაფი თბილისი';
const PHOTO_WORD = 'ფოტოგრაფი';
const CITY_WORD = 'თბილისი';
/** The second circle's cap: the whole request fills it with the city's people. */
const CAP = 50;
const PHOTOGRAPHERS = 21;

function person(index: number, label: string): { phone: string; name: string; label: string } {
  return {
    phone: `+99559910${String(index).padStart(4, '0')}`,
    name: `Nino Beridze ${index}`,
    label,
  };
}

const cityPeople = Array.from({ length: CAP }, (_, i) => person(i, 'Tbilisi, product manager'));
const photographers = Array.from({ length: PHOTOGRAPHERS }, (_, i) =>
  person(1000 + i, 'photographer'),
);

/**
 * Misho, 16 Nov: Lika asked for a product photographer; 21 photographers sit in
 * her second circle, and the full research's second answer said „nobody new".
 */
function aSecondCircleLikeLikas(): void {
  mocked(searchMeanings).mockResolvedValue(new Map());
  mocked(searchByTag).mockResolvedValue({ results: [] });
  mocked(searchByInsight).mockResolvedValue({ results: [] });
  mocked(searchSecondDegree).mockImplementation(async (_u: string, words: string) => {
    if (words === PHOTO_WORD) return { results: photographers };
    if (words === CITY_WORD || words === WORDS) return { results: cityPeople };
    return { results: [] };
  });
  mocked(farMembersHolding).mockResolvedValue([]);
  mocked(searchNeeds).mockResolvedValue({ results: [] });
  mocked(findCompaniesForNeed).mockResolvedValue({ companies: [] });
  mocked(findPeopleInBase).mockResolvedValue({ results: [] });
  mocked(query).mockResolvedValue({ rows: [] } as never);
}

describe('the full research of a request of several words', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    forgetResearch();
    aSecondCircleLikeLikas();
  });

  it('searches each word alone too, on the levels that walk the network', async () => {
    await runFullResearch({
      userId: OWNER,
      threadId: THREAD,
      taskId: 1,
      words: WORDS,
      ownerLine: 'I need a product photographer',
      withheld: new Set<string>(),
      askedAt: new Date(0),
    });
    const secondWords = mocked(searchSecondDegree).mock.calls.map(([, words]) => words);
    expect(secondWords).toEqual([WORDS, 'პროდუქტის', PHOTO_WORD, CITY_WORD]);
    expect(mocked(searchByInsight).mock.calls.map(([, words]) => words)).toEqual([WORDS]);
  });

  it('lists every photographer to the model, and not the city’s people', async () => {
    await runFullResearch(
      {
        userId: OWNER,
        threadId: THREAD,
        taskId: 1,
        words: WORDS,
        ownerLine: '',
        withheld: new Set<string>(),
        askedAt: new Date(0),
      },
      () => 0,
    );
    const section = (await takeResearch(OWNER, THREAD, 1))?.section ?? '';
    const second = section.indexOf('SECOND CIRCLE');
    const listed = section.slice(second, section.indexOf('THE SEARCH’S', second));
    for (const photographer of photographers) expect(listed).toContain(photographer.name);
    expect(listed).not.toContain('Nino Beridze 0 ');
  });
});

describe('a level searched word by word', () => {
  const found: LevelFindings = {
    level: ResearchLevel.Second,
    result: { results: cityPeople },
    byWord: [
      { word: CITY_WORD, result: { results: cityPeople } },
      { word: PHOTO_WORD, result: { results: photographers } },
      { word: 'პროდუქტის', result: null },
    ],
  };

  it('leaves out a search that filled the level on its own, when another found fewer', () => {
    expect(narrowestFirst(found)).toEqual([{ results: photographers }]);
  });

  it('keeps the narrow words in order, fewest first, the whole request last', () => {
    const few = photographers.slice(0, 5);
    const narrow: LevelFindings = {
      level: ResearchLevel.Second,
      result: { results: photographers },
      byWord: [
        { word: PHOTO_WORD, result: { results: photographers } },
        { word: 'პროდუქტის', result: { results: few } },
      ],
    };
    expect(narrowestFirst(narrow)).toEqual([
      { results: few },
      { results: photographers },
      { results: photographers },
    ]);
  });

  it('keeps every search when all of them filled the level', () => {
    const allFull: LevelFindings = { level: ResearchLevel.Second, result: { results: cityPeople } };
    expect(narrowestFirst(allFull)).toEqual([{ results: cityPeople }]);
  });

  it('is counted in the log line, a word that failed said so, with how many reach the model', () => {
    expect(researchCounts([found])).toBe(
      `second circle: whole ${CAP}, by word ${CITY_WORD} ${CAP}, ${PHOTO_WORD} ${PHOTOGRAPHERS}, ` +
        `პროდუქტის did not finish, listed ${PHOTOGRAPHERS}`,
    );
  });

  it('names every level apart in the log line, and lists a level the whole request missed', () => {
    const further: LevelFindings = {
      level: ResearchLevel.Further,
      result: { further_out: [] },
      byWord: [{ word: PHOTO_WORD, result: { results: photographers.slice(0, 7) } }],
    };
    const saved: LevelFindings = { level: ResearchLevel.OwnSaved, result: { results: [] } };
    expect(researchCounts([saved, further])).toBe(
      `own saved notes: 0 | levels 3-5: whole 0, by word ${PHOTO_WORD} 7, listed 7`,
    );
  });
});

describe('the words searched alone', () => {
  it('are each distinct word of three letters or more', () => {
    expect(singleWords('UX და researcher UX')).toEqual(['researcher']);
    expect(singleWords(WORDS)).toEqual(['პროდუქტის', PHOTO_WORD, CITY_WORD]);
  });

  it('are none for a request of one word', () => {
    expect(singleWords(PHOTO_WORD)).toEqual([]);
  });
});

describe('the people a result names', () => {
  const row = {
    phone: '+995599000111',
    name: 'Levan Japaridze',
    label: 'photographer',
    on_netai: true,
    via_contacts: [{ phone: '+995599000222', name: 'Mariam Lomidze' }],
    note: 'x'.repeat(200),
  };

  it('are the people at the top, their bridges told in their line', () => {
    const rows = personRowsIn({ results: [row] });
    expect(rows).toHaveLength(1);
    expect(rows[0].about).toBe('label: photographer; on_netai: yes; via_contacts: Mariam Lomidze');
  });

  it('say what the row says, a long note left out', () => {
    expect(aboutOf(row)).not.toContain('xxx');
  });

  it('are listed once each, at most as many as asked', () => {
    const listed = peopleListed([{ results: photographers }, { results: photographers }], 5);
    expect(listed.map((p) => p.name)).toEqual(photographers.slice(0, 5).map((p) => p.name));
  });
});

describe('the web level of a request that names a person', () => {
  it('sends nothing out: the name stays home (row 253)', async () => {
    jest.clearAllMocks();
    aSecondCircleLikeLikas();
    const { webLevel } = jest.requireMock('../researchWeb') as { webLevel: jest.Mock };
    await runFullResearch({
      userId: OWNER,
      threadId: THREAD,
      taskId: 1,
      words: 'ნინო ბერიძე',
      ownerLine: 'დამაკავშირე ნინო ბერიძესთან',
      withheld: new Set<string>(),
      askedAt: new Date(0),
    });
    expect(webLevel).not.toHaveBeenCalled();
  });

  it('searches the web for a trade', async () => {
    jest.clearAllMocks();
    aSecondCircleLikeLikas();
    const { webLevel } = jest.requireMock('../researchWeb') as { webLevel: jest.Mock };
    await runFullResearch({
      userId: OWNER,
      threadId: THREAD,
      taskId: 1,
      words: WORDS,
      ownerLine: 'I need a product photographer',
      withheld: new Set<string>(),
      askedAt: new Date(0),
    });
    expect(webLevel).toHaveBeenCalledTimes(1);
  });
});
