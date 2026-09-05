jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { classifyToken, isNameToken, readLabels } from '../labelReader.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

/** phone, who saved it, what they typed. */
function alias(phone: string, contactId: string, label: string) {
  return { phone, contact_id: contactId, alias: label };
}

/**
 * The reader makes three queries: the aliases, then how big each company word
 * is, then where this person ranks inside it.
 */
function routeLabelQueries(opts: {
  aliases?: ReturnType<typeof alias>[];
  sizes?: { word: string; org_size: string }[];
  ranks?: { phone: string; word: string; rank: string }[];
}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM "UserAlias" ua'))
      return Promise.resolve(rows(opts.aliases ?? []) as never);
    if (sql.includes('AS org_size')) return Promise.resolve(rows(opts.sizes ?? []) as never);
    if (sql.includes('AS rank')) return Promise.resolve(rows(opts.ranks ?? []) as never);
    return Promise.resolve(rows([]) as never);
  });
}

beforeEach(() => jest.resetAllMocks());

describe('L1 — is this token a name', () => {
  it('knows the founder-supplied names, in both scripts and their diminutives', () => {
    for (const token of ['giorgi', 'goga', 'dato', 'nika', 'გიორგი', 'ლევანი']) {
      expect(isNameToken(token, false)).toBe(true);
    }
    // „gio" is on the founder's ambiguity list, so it is a name only where a
    // name goes — his own instruction, applied to the whole column.
    expect(isNameToken('gio', true)).toBe(true);
    expect(isNameToken('gio', false)).toBe(false);
  });

  it('knows a surname by its ending, without a list of surnames', () => {
    for (const token of ['აბულაძე', 'ქოიავა', 'ლაშქარავა', 'იაშვილი']) {
      expect(isNameToken(token, false)).toBe(true);
    }
    // And the same endings in Latin — how much of this base is actually typed.
    for (const token of ['burchuladze', 'kikvidze', 'lashkarava', 'iashvili']) {
      expect(isNameToken(token, false)).toBe(true);
    }
  });

  // The fifteen names that are also ordinary words.
  it('„avto" is a man at the front of a label and a car anywhere else', () => {
    expect(isNameToken('avto', true)).toBe(true);
    expect(isNameToken('avto', false)).toBe(false);
  });

  it('a company is not a name', () => {
    for (const token of ['datamind', 'lemondo', 'quickshipper', 'arci']) {
      expect(isNameToken(token, false)).toBe(false);
      expect(isNameToken(token, true)).toBe(false);
    }
  });
});

describe('L2 — what a context token is', () => {
  it('everything that is not a name and not a dictionary word is the COMPANY word', () => {
    expect(classifyToken('datamind', false)).toBe('organisation');
    expect(classifyToken('lemondo', false)).toBe('organisation');
  });

  it('keeps the four dictionaries apart', () => {
    expect(classifyToken('pediatri', false)).toBe('trade');
    expect(classifyToken('advokati', false)).toBe('profession_with_clients');
    expect(classifyToken('mezobeli', false)).toBe('relation');
    expect(classifyToken('batumi', false)).toBe('place');
  });

  // A title is the rare thing a label carries; fit already reads it, and it
  // must not be counted as the company word.
  it('a role word is set aside, never counted as a company', () => {
    expect(classifyToken('direktori', false)).toBe('role');
  });
});

describe('L3/L4 — the three numbers and the signals', () => {
  it('„runs it": a small company word, and he is its most-saved person', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000001', '1', 'Vaxo Burchuladze DataMind'),
        alias('+995500000001', '2', 'vaxo datamind'),
        alias('+995500000001', '3', 'ვახო datamind'),
      ],
      sizes: [{ word: 'datamind', org_size: '4' }],
      ranks: [{ phone: '+995500000001', word: 'datamind', rank: '1' }],
    });

    const out = await readLabels(['+995500000001']);
    const signals = out.get('+995500000001');

    expect(signals?.org_set).toEqual(['datamind']);
    expect(signals?.runs_it).toBe(true);
    expect(signals?.in_big_organisation).toBe(false);
    expect(signals?.savers).toBe(3);
  });

  it('a big company word places him in a crowd and says nothing about his seat', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000002', '1', 'Levan Borchkhadze Tbc'),
        alias('+995500000002', '2', 'levan tbc'),
        alias('+995500000002', '3', 'ლევან tbc'),
      ],
      sizes: [{ word: 'tbc', org_size: '3400' }],
      ranks: [{ phone: '+995500000002', word: 'tbc', rank: '870' }],
    });

    const signals = (await readLabels(['+995500000002'])).get('+995500000002');

    expect(signals?.in_big_organisation).toBe(true);
    expect(signals?.runs_it).toBe(false);
  });

  it('three company words in three directions is the hustler shape', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000003', '1', 'Tornike Ally'),
        alias('+995500000003', '2', 'tornike ally'),
        alias('+995500000003', '3', 'tornike ally'),
        alias('+995500000003', '1', 'tornike arci'),
        alias('+995500000003', '2', 'tornike arci'),
        alias('+995500000003', '3', 'tornike arci'),
        alias('+995500000003', '1', 'tornike ggi'),
        alias('+995500000003', '2', 'tornike ggi'),
        alias('+995500000003', '3', 'tornike ggi'),
      ],
      sizes: [
        { word: 'ally', org_size: '40' },
        { word: 'arci', org_size: '30' },
        { word: 'ggi', org_size: '8' },
      ],
    });

    const signals = (await readLabels(['+995500000003'])).get('+995500000003');

    expect(signals?.org_count).toBe(3);
    expect(signals?.several_directions).toBe(true);
  });

  // The word must be agreed on. One saver's typo is not a company — with four
  // savers, 20% is one person, which is how „ORBI IAFAD" reached the list once.
  it('a word one person typed once is not a company word', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000004', '1', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '2', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '3', 'ზურა სანტექნიკოსი'),
        alias('+995500000004', '4', 'ზურა orbiiafad'),
      ],
    });

    const signals = (await readLabels(['+995500000004'])).get('+995500000004');

    expect(signals?.org_set).toEqual([]);
    expect(signals?.trade_only).toBe(true);
  });

  it('a name and nothing else is NOT YET, never a target as written', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000005', '1', 'Tornike Mezobeli'),
        alias('+995500000005', '2', 'tornike mezobeli'),
      ],
    });

    const signals = (await readLabels(['+995500000005'])).get('+995500000005');

    expect(signals?.name_only).toBe(true);
    expect(signals?.org_count).toBe(0);
  });

  it('a profession with clients opens a door a trade closes', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000006', '1', 'ნინო ადვოკატი'),
        alias('+995500000006', '2', 'nino advokati'),
      ],
    });

    const signals = (await readLabels(['+995500000006'])).get('+995500000006');

    expect(signals?.profession_with_clients).toBe(true);
    expect(signals?.trade_only).toBe(false);
  });

  it('„axel" is a hint, and says so — the roster is what confirms it', async () => {
    routeLabelQueries({
      aliases: [
        alias('+995500000007', '1', 'Jaba Kikvidze. Axel'),
        alias('+995500000007', '2', 'jaba axel'),
        alias('+995500000007', '3', 'jaba axel'),
      ],
      sizes: [{ word: 'axel', org_size: '60' }],
    });

    const signals = (await readLabels(['+995500000007'])).get('+995500000007');

    expect(signals?.axel_hint).toBe(true);
  });
});
