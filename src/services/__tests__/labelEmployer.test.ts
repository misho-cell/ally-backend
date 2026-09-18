jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { clearOrgWordCache } from '../labelReader.service';
import { rolesFromLabels } from '../tools/labelEmployer';

const mockQuery = query as jest.MockedFunction<typeof query>;

/**
 * orgWordStats caches its answers per word for six hours — the counts are
 * corpus statistics and they were costing 1.2-3.1 s on every second-degree
 * search. That cache is process-wide, so without this line one test's warm
 * word silently answers another test's question: the „statement timeout" case
 * below passed for the wrong reason, because an earlier test had already
 * cached „tbc" and „insurance" and no query was ever attempted.
 */
beforeEach(() => clearOrgWordCache());

/**
 * The only DB read this module makes is the crowd behind each word it does not
 * already know: how many people carry it as a WHOLE word, and how many of
 * those labels BEGIN with it.
 *
 * Counted live on 15 September, all of them. The second column is Ticket 19
 * [8]: a first name leads its label, a company word follows one.
 */
const LIVE: Record<string, { carriers: number; leads: number }> = {
  tbc: { carriers: 6256, leads: 2340 },
  capital: { carriers: 293, leads: 30 },
  insurance: { carriers: 437, leads: 40 },
  bank: { carriers: 2401, leads: 181 },
  service: { carriers: 1612, leads: 79 },
  // The tester's three, and what the base actually says about them.
  elen: { carriers: 112, leads: 82 }, // a name: 73% of its labels start with it
  near: { carriers: 29, leads: 9 }, // 43 as a substring, 29 as a word
  თარგმნა: { carriers: 105, leads: 62 },
  mehmeti: { carriers: 2, leads: 2 },
};

function sizesFromLive(): void {
  mockQuery.mockImplementation((_sql: string, params?: unknown[]) => {
    const words = (params?.[0] ?? []) as string[];
    const data = words
      .filter((w) => LIVE[w] !== undefined)
      .map((w) => ({
        word: w,
        carriers: String(LIVE[w].carriers),
        leads: String(LIVE[w].leads),
      }));
    return Promise.resolve({ rows: data, rowCount: data.length } as never);
  });
}

const NO_FACTS = { hasEmployer: false, hasTitle: false };

beforeEach(() => {
  jest.resetAllMocks();
  sizesFromLive();
});

describe('the company word is lifted out of the label', () => {
  it('answers the founder’s three live rows, name words dropped', async () => {
    const roles = await rolesFromLabels([
      { label: 'მერი ჩაჩანიძე TBC Capital', ...NO_FACTS },
      { label: 'ოთარი TBC Insurance', ...NO_FACTS },
      { label: 'Luka TBC Insurance', ...NO_FACTS },
    ]);

    expect(roles.get('მერი ჩაჩანიძე TBC Capital')?.employer).toBe('TBC Capital');
    expect(roles.get('ოთარი TBC Insurance')?.employer).toBe('TBC Insurance');
    expect(roles.get('Luka TBC Insurance')?.employer).toBe('TBC Insurance');
  });

  it('keeps the spelling the saver typed, not the folded one', async () => {
    const roles = await rolesFromLabels([{ label: 'Luka TBC Insurance', ...NO_FACTS }]);
    expect(roles.get('Luka TBC Insurance')?.employer).not.toContain('tbc');
  });

  it('never lets a word the crowd does not carry become an employer', async () => {
    // „mehmeti" is a name this base's Georgian list happens not to hold, so the
    // classifier calls it an organisation. Two phones carry it; 40 are needed.
    const roles = await rolesFromLabels([{ label: 'Mehmeti Bank', ...NO_FACTS }]);
    expect(roles.get('Mehmeti Bank')?.employer).toBe('Bank');
  });

  it('leaves a label that is only a name alone', async () => {
    const roles = await rolesFromLabels([{ label: 'გიორგი აბულაძე', ...NO_FACTS }]);
    expect(roles.get('გიორგი აბულაძე')).toBeUndefined();
  });
});

describe('the trade word becomes the title, never the employer', () => {
  it('reads ელექტრიკოსი as a title', async () => {
    const roles = await rolesFromLabels([{ label: 'დათო ელექტრიკოსი', ...NO_FACTS }]);
    expect(roles.get('დათო ელექტრიკოსი')).toEqual({ title: 'ელექტრიკოსი' });
  });

  it('reads a profession with clients the same way', async () => {
    const roles = await rolesFromLabels([{ label: 'ნინო ადვოკატი', ...NO_FACTS }]);
    expect(roles.get('ნინო ადვოკატი')?.title).toBe('ადვოკატი');
  });
});

/**
 * Ticket 18 [8], both details the tester found on the live product. The rule was
 * right and the dictionaries were short: a Georgian-script first name was absent
 * where its Latin spelling was present, and one of the two ordinary Latin
 * spellings of „electrician" was missing from the trade list.
 */
describe("the founder's condition holds in Georgian script too", () => {
  it('drops a Georgian first name the way it drops a Latin one', async () => {
    const roles = await rolesFromLabels([
      { label: 'ოთარი TBC Insurance', ...NO_FACTS },
      { label: 'Luka TBC Insurance', ...NO_FACTS },
    ]);

    // The pair the tester read side by side: one worked, one did not.
    expect(roles.get('ოთარი TBC Insurance')?.employer).toBe('TBC Insurance');
    expect(roles.get('Luka TBC Insurance')?.employer).toBe('TBC Insurance');
  });

  it('reads a trade as a trade in either Latin spelling', async () => {
    const roles = await rolesFromLabels([
      { label: 'Soso Elektrikosi', ...NO_FACTS },
      { label: 'დათო ელექტრიკოსი', ...NO_FACTS },
    ]);

    // Same word, same answer, whichever way it was typed — and never a company.
    expect(roles.get('Soso Elektrikosi')?.title).toBe('Elektrikosi');
    expect(roles.get('Soso Elektrikosi')?.employer).toBeUndefined();
    expect(roles.get('დათო ელექტრიკოსი')?.title).toBe('ელექტრიკოსი');
  });
});

describe('only the company or trade word travels', () => {
  it('drops the town, the relation and the bare title', async () => {
    const labels = ['გიორგი ბათუმი', 'თორნიკე მეზობელი', 'ლევანი დირექტორი'];
    const roles = await rolesFromLabels(labels.map((label) => ({ label, ...NO_FACTS })));
    for (const label of labels) expect(roles.get(label)).toBeUndefined();
  });

  it('never reaches past the company word into the rest of the label', async () => {
    const label = 'ნიკა ბათუმი TBC მეზობელი';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBe('TBC');
  });
});

describe('a confirmed fact always wins', () => {
  it('does not touch a row that already has both', async () => {
    const roles = await rolesFromLabels([
      { label: 'მერი ჩაჩანიძე TBC Capital', hasEmployer: true, hasTitle: true },
    ]);
    expect(roles.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('fills only the empty half', async () => {
    const roles = await rolesFromLabels([
      { label: 'დათო ელექტრიკოსი TBC', hasEmployer: true, hasTitle: false },
    ]);
    expect(roles.get('დათო ელექტრიკოსი TBC')).toEqual({ title: 'ელექტრიკოსი' });
  });
});

describe('when the count cannot be read', () => {
  it('drops every word that needed it and keeps the row empty', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const roles = await rolesFromLabels([{ label: 'Luka TBC Insurance', ...NO_FACTS }]);
    expect(roles.get('Luka TBC Insurance')).toBeUndefined();
  });

  it('still answers from the dictionary alone', async () => {
    mockQuery.mockRejectedValue(new Error('statement timeout'));
    const roles = await rolesFromLabels([{ label: 'ნინო ახალგაზრდული ასოციაცია', ...NO_FACTS }]);
    expect(roles.get('ნინო ახალგაზრდული ასოციაცია')?.employer).toContain('ასოციაცია');
  });
});

describe('nothing to read', () => {
  it('asks the database nothing when no row needs it', async () => {
    expect((await rolesFromLabels([])).size).toBe(0);
    expect((await rolesFromLabels([{ label: null, ...NO_FACTS }])).size).toBe(0);
    expect((await rolesFromLabels([{ label: '  ', ...NO_FACTS }])).size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

/**
 * Ticket 19 [8] — the tester's three, and the reason all three got through.
 *
 * The floor was counted with LIKE '%word%'. „near" scored 43 out of NEAR
 * inside other words and cleared a floor of 40 by three; „elen" scored 14,445
 * out of Elene, Elena and Kelenjeridze. Counted as whole words they are 29 and
 * 112 — and „elen" begins 73% of the labels it is in, which is where a name
 * goes and not where a company does.
 */
describe('a first name is not an employer', () => {
  it('drops „Elen" although the crowd is large enough', async () => {
    const label = 'Elen Kakhidze';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBeUndefined();
  });

  it('drops „Near", which only ever cleared the floor as a substring', async () => {
    const label = 'Giorgi Near';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBeUndefined();
  });

  it('keeps a real company, which is what the same two numbers say it is', async () => {
    // tbc: 6,256 carriers and it leads only 37% of them.
    const label = 'მერი ჩაჩანიძე TBC Capital';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBe('TBC Capital');
  });
});

describe('a number and a conjunction are not companies', () => {
  it('drops „100 არა" entirely', async () => {
    // Three contacts carried this as their employer. „100" is on 1,916 labels
    // as a whole word and „არა" on 230 — both far over any floor, and neither
    // has ever been anybody's employer.
    const label = 'ნიკა 100 არა';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBeUndefined();
  });

  it('drops the „and" out of „თარგმნა and Service" and keeps the company word', async () => {
    const label = 'ნინო თარგმნა and Service';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    // „თარგმნა" leads 59% of its labels, so it goes with the conjunction.
    expect(roles.get(label)?.employer).toBe('Service');
  });
});

/**
 * Ticket 19 [8], found by measuring rather than by being told — and worse than
 * what was reported.
 *
 * Of the 400 commonest tokens in the whole base, 71 classify as „organisation".
 * Ten of them cleared BOTH gates above, whole-word count and lead share, and
 * would have been printed as somebody's employer:
 *
 *   დედა / deda   23,734 carriers, .47 lead share   MOTHER
 *   მამა / mama   16,536             .72            father
 *   კლიენტი        9,471             .19            client
 *   სახლი          7,295             .16            house
 *   მანქანა        5,146             .25            car
 *   უნდა           5,920             .05            „wants"
 *
 * They are in none of the dictionaries. The counting cannot reach them either:
 * they are common because they are ordinary, and they sit after the name in a
 * label exactly where a company word sits.
 */
describe('the commonest words in a phonebook are not employers', () => {
  async function employerOf(label: string): Promise<string | undefined> {
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    return roles.get(label)?.employer;
  }

  it('does not make a mother somebody’s employer', async () => {
    expect(await employerOf('ნინო დედა')).toBeUndefined();
    expect(await employerOf('Nino deda')).toBeUndefined();
  });

  it('drops the other kinship words the dictionaries never held', async () => {
    expect(await employerOf('გიორგი მამა')).toBeUndefined();
    expect(await employerOf('Tamta bebo')).toBeUndefined();
    expect(await employerOf('ლევანი ჩემი')).toBeUndefined();
  });

  it('drops an ordinary noun and an ordinary verb', async () => {
    expect(await employerOf('ზურა კლიენტი')).toBeUndefined();
    expect(await employerOf('Dato saxli')).toBeUndefined();
    expect(await employerOf('ნიკა მანქანა')).toBeUndefined();
    expect(await employerOf('Lasha unda')).toBeUndefined();
  });

  it('drops the word that is not a word', async () => {
    // 42,694 labels carry „undefined" because something wrote it there.
    expect(await employerOf('Mariam undefined')).toBeUndefined();
  });

  it('does not fire on a longer word that merely starts the same way', async () => {
    // Exact match, not prefix. „ახალგაზრდული ასოციაცია" (a youth association)
    // begins with „ახალ" and must still reach the field as an organisation —
    // a prefix rule would read it as „new" and refuse the label.
    const label = 'ნინო ახალგაზრდული ასოციაცია';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBe('ასოციაცია');
  });
});

/**
 * Ticket 19 [8], the audit of 16 September — and the method matters more than
 * the words.
 *
 * The earlier passes fixed the words the tester named. This one asked the base
 * instead: the 400 commonest whole-word tokens, run through the real pipeline
 * with their real counts. Thirty-four would have been printed as somebody's
 * EMPLOYER. Eight were trades, four relations, four places and two car parts —
 * all missing for exactly the reason „Elektrikosi" was, the Georgian spelling
 * present and the Latin one people actually type absent.
 *
 * Every number below was measured. The second one is the cost of the entry:
 * how many people the substring wrongly catches inside a LARGER word.
 */
describe('Ticket 19 [8] — the trades, places and relations the audit found', () => {
  it.each([
    ['გიორგი მძღოლი', 'მძღოლი'],
    ['Giorgi mdzgoli', 'mdzgoli'],
    ['ნათია ბუღალტერი', 'ბუღალტერი'],
    ['Natia bugalteri', 'bugalteri'],
    ['Dato makleri', 'makleri'],
    ['Gia maliari', 'maliari'],
    ['Zura prarabi', 'prarabi'],
    ['Eka mkeravi', 'mkeravi'],
    ['Soso dacva', 'dacva'],
    ['Luka taqsi', 'taqsi'],
  ])('„%s" reads the trade as the TITLE, never the employer', async (label, trade) => {
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.title).toBe(trade);
    expect(roles.get(label)?.employer).toBeUndefined();
  });

  it.each([
    ['Gia rustavi', 'a city'],
    ['Nino qutaisi', 'the q spelling the shared list missed'],
    ['Dato digomi', 'a Tbilisi district'],
    ['Zaza gldani', 'a Tbilisi district'],
    ['Mari natlia', 'a godparent'],
    ['Tamuna bicola', 'an aunt by marriage'],
    ['Levani klaseli', 'a classmate'],
    ['Koba dashlilebi', 'car parts'],
    ['Gela nawilebi', 'car parts'],
  ])('„%s" shows no employer — it is %s', async (label) => {
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.employer).toBeUndefined();
  });

  it('a real company in the same shape still comes through', async () => {
    const roles = await rolesFromLabels([{ label: 'Nino TBC Capital', ...NO_FACTS }]);
    expect(roles.get('Nino TBC Capital')?.employer).toBe('TBC Capital');
  });

  it('a trade and a company in one label go to their own fields', async () => {
    const label = 'Giorgi mdzgoli TBC';
    const roles = await rolesFromLabels([{ label, ...NO_FACTS }]);
    expect(roles.get(label)?.title).toBe('mdzgoli');
    expect(roles.get(label)?.employer).toBe('TBC');
  });

  /**
   * The seven the audit found and deliberately did NOT fix. `containsAny` is a
   * substring match, so a short word cannot be added however common it is:
   * „gori" is inside „grigori", a first name, and 45% of its carriers are the
   * word stuck inside another one. Asserted so the exclusion is a recorded
   * decision with a reason, not an oversight somebody has to rediscover.
   */
  it.each(['gori', 'dzia', 'didi', 'bagi', 'aveji', 'lilo', 'gazi'])(
    '„%s" is still wrong, knowingly: too short for a substring rule',
    (word) => {
      expect(word.length).toBeLessThanOrEqual(5);
    },
  );
});
