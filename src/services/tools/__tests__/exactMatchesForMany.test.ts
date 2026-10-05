jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhones: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../askBoundary.service', () => ({
  __esModule: true,
  boundaryExclusionsFor: jest.fn().mockResolvedValue([]),
}));

import { query } from '../../../db/postgres/client';
import { getExcludedPhones } from '../../block.service';
import { boundaryExclusionsFor } from '../../askBoundary.service';
import { exactMatchesForMany } from '../searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;
const mockBoundary = boundaryExclusionsFor as jest.MockedFunction<typeof boundaryExclusionsFor>;

interface Row {
  phone: string;
  name: string | null;
  saved_as?: string | null;
  own_hit?: boolean;
  src_priority?: number;
  weight?: number | null;
  [hits: `h${number}`]: number;
}

function rows(people: Row[]): void {
  mockQuery.mockResolvedValue({
    rows: people.map((p) => ({ saved_as: null, own_hit: false, src_priority: 1, weight: 0, ...p })),
    rowCount: people.length,
  } as never);
}

const sqlOfEveryCall = (): string => mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
const patterns = (): string =>
  mockQuery.mock.calls
    .flatMap((call) => (call[1] as unknown[]) ?? [])
    .filter((p): p is string => typeof p === 'string')
    .join(' ');

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue([]);
  mockBoundary.mockResolvedValue([]);
});

/**
 * Board #959: the way-in check looked up every web name with its own exact
 * search — 63 in one run on 4 October. Now one query scans the book once for
 * all of them, and each name is scored by its own words.
 */
describe('many names, one pass', () => {
  it('asks the database once, with no fuzzy pass and no COUNT', async () => {
    rows([]);

    await exactMatchesForMany('501', ['Performa', 'Axel Group', 'Bookkeeping.ge']);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(sqlOfEveryCall()).not.toContain('similarity');
    expect(sqlOfEveryCall()).not.toContain('COUNT');
    expect(sqlOfEveryCall()).toContain('AS h0');
    expect(sqlOfEveryCall()).toContain('AS h2');
  });

  it('gives each name its own best contact, by its own word hits', async () => {
    rows([
      { phone: '+995555000001', name: 'ნინო', h0: 1, h1: 0 },
      { phone: '+995555000002', name: 'გიორგი', h0: 0, h1: 2 },
    ]);

    const out = await exactMatchesForMany('501', ['Performa', 'Axel Group']);

    expect(out.get('Performa')).toEqual({ name: 'ნინო', phone: '+995555000001' });
    expect(out.get('Axel Group')).toEqual({ name: 'გიორგი', phone: '+995555000002' });
  });

  it('ranks by words matched, then the owner’s own label, then a structured field', async () => {
    rows([
      { phone: '+995555000001', name: 'one word', h0: 1, own_hit: true },
      { phone: '+995555000002', name: 'two words', h0: 2 },
      { phone: '+995555000003', name: 'two words, own', h0: 2, own_hit: true },
    ]);

    const out = await exactMatchesForMany('501', ['Axel Group']);

    expect(out.get('Axel Group')?.name).toBe('two words, own');
  });

  it('falls back to what the owner saved them as when there is no name', async () => {
    rows([{ phone: '+995555123456', name: null, saved_as: 'ნინო ბანკიდან', h0: 1 }]);

    const out = await exactMatchesForMany('501', ['Performa']);

    expect(out.get('Performa')?.name).toBe('ნინო ბანკიდან');
  });

  it('answers null for a name nobody matched', async () => {
    rows([{ phone: '+995555123456', name: 'ნინო', h0: 0, h1: 1 }]);

    const out = await exactMatchesForMany('501', ['Performa', 'Axel']);

    expect(out.get('Performa')).toBeNull();
  });

  it('asks nothing at all when no name has a searchable word', async () => {
    const out = await exactMatchesForMany('501', ['   ']);

    expect(out.get('   ')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  /** A blocked person is not a way in, and a topic boundary holds for its own name. */
  it('leaves out the owner’s exclusions, and each name’s boundaries for that name only', async () => {
    mockExcluded.mockResolvedValue(['+995555000009']);
    mockBoundary.mockImplementation(async (q) => (q === 'Performa' ? ['+995555000001'] : []));
    rows([{ phone: '+995555000001', name: 'ნინო', h0: 1, h1: 1 }]);

    const out = await exactMatchesForMany('501', ['Performa', 'Axel']);

    expect(out.get('Performa')).toBeNull();
    expect(out.get('Axel')?.name).toBe('ნინო');
    expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining([['+995555000009']]));
  });
});

/**
 * As written, never spelling variants: a way-in name is a title lifted off a
 * web card, and every variant is another pattern over the owner's book.
 */
describe('it looks for the names as written', () => {
  it('sends one pattern per word, not a transliteration of each', async () => {
    rows([]);

    await exactMatchesForMany('501', ['arqiteqtori']);

    expect(patterns()).not.toContain('არქიტექტორ');
    expect(patterns()).toContain('arqiteqtor');
  });

  it('drops a trailing stop and brackets, and leaves a host name whole', async () => {
    rows([]);

    await exactMatchesForMany('501', ['Axel Group.', '(Architect)', 'Bookkeeping.ge']);

    expect(patterns()).toContain('group');
    expect(patterns()).not.toContain('group\\.');
    expect(patterns()).not.toContain('\\(');
    expect(patterns()).toContain('bookkeeping\\.ge');
  });
});
