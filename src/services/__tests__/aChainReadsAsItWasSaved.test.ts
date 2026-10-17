jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { labelsAlongChain } from '../chainLabels';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** 5347 (63264 A): a chain is named the way it was built, link by link. */
describe('the labels along a chain', () => {
  beforeEach(() => mockQuery.mockReset());

  it('come back in the chain’s order, null where nobody saved a label', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { ord: 2, label: 'ნინო კაპანაძე' },
        { ord: 1, label: 'ლევან ჯაფარიძე' },
        { ord: 3, label: null },
      ],
    } as never);

    expect(await labelsAlongChain(7, ['+1', '+2', '+3'])).toEqual([
      'ლევან ჯაფარიძე',
      'ნინო კაპანაძე',
      null,
    ]);
    const [sql, params, timeout] = mockQuery.mock.calls[0] as [string, unknown[], number];
    expect(sql).toContain('WITH ORDINALITY');
    expect(params).toEqual([7, ['+1', '+2', '+3']]);
    expect(timeout).toBeGreaterThan(0);
  });

  it('reads nothing for an empty chain', async () => {
    expect(await labelsAlongChain(7, [])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
