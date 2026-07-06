jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../../../db/neo4j/client', () => ({ getSession: jest.fn(), __esModule: true }));
jest.mock('../../neo4j.keys', () => ({ getCompositeKeyForUser: jest.fn(), __esModule: true }));
jest.mock('../../block.service', () => ({ getExcludedPhones: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { getSession } from '../../../db/neo4j/client';
import { getCompositeKeyForUser } from '../../neo4j.keys';
import { getExcludedPhones } from '../../block.service';
import { searchSecondDegree } from '../searchSecondDegree';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetKey = getCompositeKeyForUser as jest.MockedFunction<typeof getCompositeKeyForUser>;
const mockExcluded = getExcludedPhones as jest.MockedFunction<typeof getExcludedPhones>;

const FRIEND_PHONE = '+995500000009';

function record(fields: Record<string, unknown>): { get: (k: string) => unknown } {
  return { get: (k: string) => fields[k] };
}

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExcluded.mockResolvedValue([]);
  mockGetKey.mockResolvedValue('+995500000000');
  mockGetSession.mockReturnValue({
    run: jest.fn().mockResolvedValue({ records: [record({ phoneKey: FRIEND_PHONE })] }),
    close: jest.fn().mockResolvedValue(undefined),
  } as never);
});

describe('searchSecondDegree tag matching', () => {
  it('matches tags with the index-backed % operator + similarity refine', async () => {
    mockQuery.mockResolvedValue(
      rows([
        { phone: '+995500000123', target_user_id: null, name: 'Nino', via_names: ['Gio'] },
      ]) as never,
    );

    await searchSecondDegree('42', 'buralteri');

    const [sql, params] = mockQuery.mock.calls[0];
    // Index-backed trigram match, not a bare similarity() scan.
    expect(sql as string).toContain('normalize_search_token(ut.tag) % normalize_search_token($3)');
    expect(sql as string).toContain('>= 0.45');
    // $3 = normalized tag term, $4 = alias LIKE, $5 = blocked phones.
    expect(params as unknown[]).toEqual(['42', [FRIEND_PHONE], 'buralteri', '%buralteri%', []]);
  });

  it('normalizes a Georgian query the same way the index is built (via transliteration)', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await searchSecondDegree('42', 'ბუღალტერი');

    const params = mockQuery.mock.calls[0][1] as string[];
    // buildSearchTerms transliterates the Georgian query to its Latin form(s),
    // which normalize_search_token then folds to the canonical token in-SQL.
    expect(params).toContain('bughalteri');
  });

  it('returns found:false when the graph has no contacts', async () => {
    mockGetSession.mockReturnValue({
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    } as never);

    const result = (await searchSecondDegree('42', 'buralteri')) as Record<string, unknown>;

    expect(result.found).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
