jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../openingSearch.service', () => ({ __esModule: true, findWaysIn: jest.fn() }));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import { query } from '../../db/postgres/client';
import { findWaysIn, WayIn } from '../openingSearch.service';
import {
  checkTheRest,
  LIST_REST_BUDGET_MS,
  LIST_WAYS_IN_BUDGET_MS,
  LIST_WAYS_IN_WAVE,
  reworkList,
  rowLabeller,
  waysInByWaves,
} from '../listItems.service';
import { reparseThreadFile } from '../threadFiles.service';

/**
 * The tester's 79334 (a real member, 30 Oct): a 479-row LinkedIn list was
 * looked up all at once, 478 rows stayed „unchecked", and each row was called
 * by its first name, read from a file whose note line had been taken as its
 * header.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWaysIn = findWaysIn as jest.MockedFunction<typeof findWaysIn>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => {
  mockQuery.mockReset();
  mockWaysIn.mockReset();
});

function noneFor(names: readonly string[]): Map<string, WayIn> {
  return new Map(names.map((n) => [n, { kind: 'none' } as WayIn]));
}

describe('a long list’s ways in', () => {
  it('are looked up in waves, one after another', async () => {
    mockWaysIn.mockImplementation(async (_u, names) => noneFor(names));
    const labels = Array.from({ length: LIST_WAYS_IN_WAVE * 2 + 3 }, (_, i) => `Name ${i}`);
    const found = await waysInByWaves('7', labels, {}, () => undefined);
    expect(mockWaysIn).toHaveBeenCalledTimes(3);
    expect(mockWaysIn.mock.calls[0][1]).toHaveLength(LIST_WAYS_IN_WAVE);
    expect(found.size).toBe(labels.length);
  });

  it('stop when the list’s time is spent, and the rest stays unchecked', async () => {
    mockWaysIn.mockImplementation(async (_u, names) => noneFor(names));
    let clock = 0;
    const now = (): number => {
      clock += LIST_WAYS_IN_BUDGET_MS / 2;
      return clock;
    };
    const labels = Array.from({ length: LIST_WAYS_IN_WAVE * 5 }, (_, i) => `Name ${i}`);
    const found = await waysInByWaves('7', labels, {}, () => undefined, now);
    expect(mockWaysIn).toHaveBeenCalledTimes(1);
    expect(found.size).toBe(LIST_WAYS_IN_WAVE);
  });
});

describe('the rows the reply had no time for', () => {
  it('are checked after it, wave by wave, into the rows still unchecked', async () => {
    mockWaysIn.mockImplementation(async (_u, names, _o, onPhone) => {
      onPhone?.(names[0], '+995500000001');
      return new Map(
        names.map((n, i) => [
          n,
          (i === 0 ? { kind: 'first_circle', who: 'Helper' } : { kind: 'none' }) as WayIn,
        ]),
      );
    });
    mockQuery.mockResolvedValue(rows([]));
    const labels = Array.from({ length: LIST_WAYS_IN_WAVE + 1 }, (_, i) => `Name ${i}`);
    await checkTheRest('7', 35, 9, labels, {});
    expect(mockWaysIn).toHaveBeenCalledTimes(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('UPDATE list_items');
    expect((params as unknown[])[3]).toBe('unchecked');
    const written = JSON.parse(String((params as unknown[])[2])) as { state: string }[];
    expect(written[0]).toMatchObject({ state: 'route_found', through_whom: 'Helper' });
    expect(written[1]).toMatchObject({ state: 'no_route', through_whom: null });
  });

  it('stop at their own time limit, and never throw', async () => {
    mockWaysIn.mockRejectedValueOnce(new Error('timeout'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(checkTheRest('7', 35, 9, ['A', 'B'], {})).resolves.toBeUndefined();
    let clock = 0;
    const now = (): number => (clock += LIST_REST_BUDGET_MS);
    mockWaysIn.mockReset();
    await checkTheRest('7', 35, 9, ['A', 'B', 'C', 'D', 'E', 'F'], {}, now);
    expect(mockWaysIn).not.toHaveBeenCalled();
  });
});

describe('the name a row is called by', () => {
  it('is first and last name together when the file has both', () => {
    const label = rowLabeller(['First Name', 'Last Name', 'Company'])(['Nino', 'Example', 'Bank']);
    expect(label).toBe('Nino Example');
  });

  it('is the name column otherwise', () => {
    expect(rowLabeller(['კომპანია', 'ქალაქი'])(['Bank', 'Tbilisi'])).toBe('Bank');
  });
});

describe('a stored upload read again', () => {
  const STORED = {
    filename: 'Connections.csv',
    original: Buffer.from(
      'Notes:\n"When exporting, some e-mails are missing."\n\nFirst Name,Last Name,Company\nNino,Example,Bank\n',
    ),
    columns: ['Notes:'],
    rows: [['When exporting'], [''], ['First Name'], ['Nino']],
  };

  it('reports the new shape and writes nothing on a dry run', async () => {
    mockQuery.mockResolvedValueOnce(rows([STORED]));
    const outcome = await reparseThreadFile(5, true);
    expect(outcome).toEqual({
      ok: true,
      shape: { before: { columns: 1, rows: 4 }, after: { columns: 3, rows: 1 } },
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('replaces the stored table when it is not a dry run', async () => {
    mockQuery.mockResolvedValueOnce(rows([STORED])).mockResolvedValueOnce(rows([]));
    await reparseThreadFile(5, false);
    const [sql, params] = mockQuery.mock.calls[1];
    expect(String(sql)).toContain('UPDATE thread_files SET columns');
    expect(JSON.parse(String((params as unknown[])[1]))).toEqual([
      'First Name',
      'Last Name',
      'Company',
    ]);
  });

  it('is not found without its original', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    expect(await reparseThreadFile(5, true)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('a list worked again', () => {
  it('drops only rows nobody was asked about, then works the list', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ user_id: '7' }]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(
        rows([{ columns: ['First Name', 'Last Name'], rows: [['Nino', 'Example']] }]),
      )
      .mockResolvedValue(rows([]));
    mockWaysIn.mockImplementation(async (_u, names) => noneFor(names));
    const outcome = await reworkList(35, 9);
    const [deleteSql, deleteParams] = mockQuery.mock.calls[1];
    expect(String(deleteSql)).toContain('DELETE FROM list_items');
    expect((deleteParams as unknown[])[2]).toEqual(['route_found', 'no_route', 'unchecked']);
    expect(mockWaysIn.mock.calls[0][1]).toEqual(['Nino Example']);
    expect(outcome.ok).toBe(true);
  });

  it('is refused for a goal that is not open', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    expect((await reworkList(35, 9)).ok).toBe(false);
  });
});
