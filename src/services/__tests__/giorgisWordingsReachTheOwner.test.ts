jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../askTranslation.service', () => ({ __esModule: true, relayedForReader: jest.fn() }));

import { query } from '../../db/postgres/client';
import { relayedForReader } from '../askTranslation.service';
import { buildAnswerCard, CardAnswer } from '../answerCard.service';
import { withAssistantsSentLine } from '../assistantsSentLine';
import { withoutAllyLabelWord } from '../allyLabelWord';
import { geoName } from '../georgianCase';
import { scrubMechanicalForStorage } from '../privacyScrub';
import {
  georgianFirstName,
  georgianNamesFor,
  georgianScriptName,
  withoutAllyWord,
} from '../georgianScriptName';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  mockQuery.mockReset();
  (relayedForReader as jest.Mock).mockImplementation(async (text: string) => ({ text }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** #6352 / #6353 (Giorgi's wordings, Misho's yes 20 Oct). */
describe('a name in a Georgian line', () => {
  it('drops the old app’s „Ally" and is written in Georgian script', () => {
    expect(withoutAllyWord('Lika Osepashvili Ally')).toBe('Lika Osepashvili');
    expect(georgianScriptName('Gela Beridze Ally')).toBe('გელა ბერიძე');
    expect(georgianScriptName('ლიკა ოსეფაშვილი Ally')).toBe('ლიკა ოსეფაშვილი');
    expect(georgianFirstName('Giorgi Kapanadze')).toBe('გიორგი');
  });

  it('leaves an acronym as written', () => {
    expect(georgianScriptName('Nino Beridze TBC')).toBe('ნინო ბერიძე TBC');
  });

  // D859 (the founder, 20 Oct): Georgian script always. With nothing learned from the
  // base, the rule's reading, a lone k as კ; the base corrects the rest (surnameSpelling).
  it('is in Georgian script even when only the rule can spell it', () => {
    expect(georgianScriptName('Zura Kvaratskhelia')).toBe('ზურა კვარაცხელია');
    expect(georgianScriptName('Gia Lomtadze TBC')).toBe('გია ლომთაძე TBC');
    expect(georgianScriptName('Lika Osepashvili Ally')).toBe('ლიკა ოსეპაშვილი');
    expect(georgianFirstName('Giorgi Turashvili')).toBe('გიორგი');
  });

  it('takes the base’s Georgian spelling when it is the same name by sound', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { label: 'Merab Chikovani', georgian: 'მამა', n: 9 },
        { label: 'Merab Chikovani', georgian: 'მერაბ ჩიქოვანი', n: 4 },
      ],
    } as never);
    const names = await georgianNamesFor('171', ['Merab Chikovani', 'ნინო']);
    expect(names.get('Merab Chikovani')).toBe('მერაბ ჩიქოვანი');
    expect(names.get('ნინო')).toBe('ნინო');
  });

  it('falls back to the rule when the base cannot be read', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const names = await georgianNamesFor('171', ['Luka Gelovani Ally']);
    expect(names.get('Luka Gelovani Ally')).toBe('ლუკა გელოვანი');
  });
});

describe('#6352: the sent line', () => {
  it('names the assistants in Georgian script, without „Ally"', () => {
    const shown = new Map([['Lika Osepashvili Ally', 'ლიკა ოსეფაშვილი']]);
    const reply = withAssistantsSentLine(
      'Lika-ს მივწერე და პასუხს ველოდები.',
      ['Lika Osepashvili Ally'],
      'ka',
      shown,
    );
    expect(reply).toContain('ახლა ვწერ ასისტენტებს: ლიკა ოსეფაშვილი.');
    expect(reply).not.toContain('Ally');
  });
});

describe('#6353: the answer card in Georgian', () => {
  const answer: CardAnswer = {
    askId: 1,
    answer: 'ლიკა იცნობს მერაბს და დაგვეხმარება დაკავშირებაში.',
    fromName: 'Lika Osepashvili Ally',
    verbatim: false,
  };
  const names = {
    ownerFirst: 'გიორგი',
    shown: new Map([['Lika Osepashvili Ally', 'ლიკა ოსეფაშვილი']]),
  };

  it('is Netai telling the owner what it heard, with no heading and no „Ally"', async () => {
    const card = await buildAnswerCard([answer], 'ka', names);
    expect(card).toBe(
      'გიორგი, ვესაუბრე ლიკას ასისტენტს და მითხრა, რომ ლიკა იცნობს მერაბს და დაგვეხმარება დაკავშირებაში.',
    );
    expect(card).not.toContain('მოვიდა პასუხი');
  });

  it('keeps the helper’s own words in quotes', async () => {
    const own = { ...answer, answer: 'კი, ვიცნობ მერაბს', verbatim: true };
    expect(await buildAnswerCard([own], 'ka', names)).toBe(
      'გიორგი, ვესაუბრე ლიკას ასისტენტს და მითხრა: „კი, ვიცნობ მერაბს"',
    );
  });

  it('is unchanged in English', async () => {
    const card = await buildAnswerCard([{ ...answer, answer: 'She knows him.' }], 'en', names);
    expect(card.startsWith('An answer came in:')).toBe(true);
  });
});

describe('#6352 retest: „Ally" leaves every owner-facing line (69803, 69804)', () => {
  it('drops the word after a name and puts the Georgian ending back on', () => {
    expect(withoutAllyLabelWord('ლევან Ally-ისთვის გაიგზავნა გაცნობის მოთხოვნა.')).toBe(
      'ლევანისთვის გაიგზავნა გაცნობის მოთხოვნა.',
    );
    expect(withoutAllyLabelWord('ლიკა Ally-ის ასისტენტი')).toBe('ლიკას ასისტენტი');
    expect(withoutAllyLabelWord('ნინო კახიძე Ally-ის')).toBe('ნინო კახიძის');
    expect(withoutAllyLabelWord('ეკა Ally და ლუკა Ally.')).toBe('ეკა და ლუკა.');
    expect(withoutAllyLabelWord('Lika Ally-ის ასისტენტი')).toBe('Lika-ის ასისტენტი');
  });

  it('is part of the storage scrub every assistant line goes through', () => {
    expect(scrubMechanicalForStorage('ახლა ვწერ ლევან Ally-ს.')).toBe('ახლა ვწერ ლევანს.');
  });

  it('declines a name written without its -ი („ლევან-ის" → „ლევანის")', () => {
    expect(geoName('ლევან', 'gen')).toBe('ლევანის');
    expect(geoName('დავით', 'erg')).toBe('დავითმა');
    expect(geoName('მერაბ', 'dat')).toBe('მერაბს');
  });
});
