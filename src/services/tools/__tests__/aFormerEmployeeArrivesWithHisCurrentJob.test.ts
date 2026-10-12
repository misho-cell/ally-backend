jest.mock('../../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../../block.service', () => ({
  __esModule: true,
  getExcludedPhoneSet: jest.fn().mockResolvedValue(new Set<string>()),
}));

import { query } from '../../../db/postgres/client';
import { ContactFactFields, currentWorkOf } from '../factEnrichment';
import { searchByInsight } from '../searchByInsight';

/**
 * 4491 (box 54451, 0 of 3): the owner saved that Bakhva used to work at TBC
 * Bank and now works at Wissol. „Who used to work at TBC Bank?" found him by
 * the past fact — and the run asked where he works now, because the hit
 * carried only the fact that matched the words. The current job rides along.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const BAKHVA = '+995599000560';

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function fields(over: Partial<ContactFactFields>): ContactFactFields {
  return {
    employer: null,
    jobPosition: null,
    city: null,
    industry: null,
    dates: {},
    own: {},
    georgianName: null,
    ...over,
  };
}

describe('currentWorkOf', () => {
  it('gives the saved employer, job and city with their dates, and leaves out what is empty', () => {
    const facts = new Map([
      [
        BAKHVA,
        fields({ employer: 'ვისოლი', dates: { employer: '2026-10-12' }, own: { employer: true } }),
      ],
    ]);
    expect(currentWorkOf(BAKHVA, facts)).toEqual({
      employer: 'ვისოლი',
      facts_as_of: { employer: '2026-10-12' },
    });
  });

  it('gives nothing for a person with no saved work', () => {
    expect(currentWorkOf(BAKHVA, new Map())).toEqual({});
  });
});

describe('search_by_insight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockImplementation(((sql: string) => {
      if (sql.includes('TO_CHAR(updated_at')) {
        return Promise.resolve(
          rows([
            {
              phone: BAKHVA,
              field_type: 'employer',
              value: 'ვისოლი',
              as_of: '2026-10-12',
              own: true,
            },
            {
              phone: BAKHVA,
              field_type: 'past_role',
              value: 'თიბისი ბანკი',
              as_of: '2026-10-12',
              own: true,
            },
          ]),
        );
      }
      if (sql.includes('cf.submitted_by_user_id = $1')) {
        return Promise.resolve(
          rows([{ phone: BAKHVA, name: 'ბახვა', matched: ['past_role: თიბისი ბანკი'] }]),
        );
      }
      return Promise.resolve(rows([]));
    }) as unknown as typeof query);
  });

  it('hands over the current employer with the past fact that found him', async () => {
    const result = (await searchByInsight('183656', 'თიბისი ბანკი')) as {
      results: Array<Record<string, unknown>>;
    };
    expect(result.results[0]).toMatchObject({
      name: 'ბახვა',
      matched: ['past_role: თიბისი ბანკი'],
      employer: 'ვისოლი',
      facts_as_of: { employer: '2026-10-12' },
    });
  });

  it('still answers, with the matched facts only, when the current work cannot be read', async () => {
    const answer = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(((sql: string, params?: unknown[]) =>
      sql.includes('TO_CHAR(updated_at')
        ? Promise.reject(new Error('statement timeout'))
        : answer?.(sql, params)) as unknown as typeof query);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = (await searchByInsight('183656', 'თიბისი ბანკი')) as {
      results: Array<Record<string, unknown>>;
    };
    expect(result.results[0].matched).toEqual(['past_role: თიბისი ბანკი']);
    expect(result.results[0].employer).toBeUndefined();
  });
});
