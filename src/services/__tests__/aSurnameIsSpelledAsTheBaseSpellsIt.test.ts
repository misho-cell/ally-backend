jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { georgianScriptName, learnGeorgianSpellings } from '../georgianScriptName';
import { clearWinner, forgetSurnameSpellings, surnameCandidates } from '../surnameSpelling';

const mockQuery = query as jest.MockedFunction<typeof query>;

function baseCounts(counts: Record<string, number>): void {
  mockQuery.mockImplementation((_sql: unknown, params?: unknown) =>
    Promise.resolve({
      rows: ((params as unknown[]) ?? [])
        .filter((p): p is string => typeof p === 'string')
        .map((candidate) => ({ candidate, n: counts[candidate] ?? 0 })),
      rowCount: 0,
    } as never),
  );
}

beforeEach(() => {
  mockQuery.mockReset();
  forgetSurnameSpellings();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** G-157 (Giorgi's name rule, 20 Oct): Georgian script always, spelled as Georgians spell it. */
describe('a Latin surname in a Georgian line', () => {
  it('has every spelling its two-way letters allow', () => {
    expect(surnameCandidates('Turashvili')).toEqual(['თურაშვილი', 'ტურაშვილი']);
    expect(surnameCandidates('Kvaratskhelia')).toEqual([
      'კვარაცხელია',
      'კვარაწხელია',
      'ქვარაცხელია',
      'ქვარაწხელია',
    ]);
  });

  it('takes the spelling people write, only when it clearly leads', () => {
    expect(
      clearWinner(
        new Map([
          ['ტურაშვილი', 200],
          ['თურაშვილი', 24],
        ]),
      ),
    ).toBe('ტურაშვილი');
    expect(
      clearWinner(
        new Map([
          ['ა', 10],
          ['ბ', 8],
        ]),
      ),
    ).toBeNull();
    expect(clearWinner(new Map([['ა', 2]]))).toBeNull();
  });

  it('is written as the base spells it once learned: Turashvili is ტურაშვილი', async () => {
    baseCounts({ ტურაშვილი: 200, თურაშვილი: 24 });
    expect(georgianScriptName('Giorgi Turashvili')).toBe('Giorgi Turashvili');
    await learnGeorgianSpellings(['Giorgi Turashvili']);
    expect(georgianScriptName('Giorgi Turashvili')).toBe('გიორგი ტურაშვილი');
  });

  it('stays as registered when the base has no clear spelling', async () => {
    baseCounts({ თურაშვილი: 30, ტურაშვილი: 25 });
    await learnGeorgianSpellings(['Giorgi Turashvili']);
    expect(georgianScriptName('Giorgi Turashvili')).toBe('Giorgi Turashvili');
  });

  it('asks the base nothing for a name the list and the rule already spell', async () => {
    await learnGeorgianSpellings(['Gela Beridze', 'ლიკა ოსეფაშვილი']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('learns nothing when the read fails, and says so', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'));
    await learnGeorgianSpellings(['Giorgi Turashvili']);
    expect(georgianScriptName('Giorgi Turashvili')).toBe('Giorgi Turashvili');
    expect(console.warn).toHaveBeenCalled();
  });
});
