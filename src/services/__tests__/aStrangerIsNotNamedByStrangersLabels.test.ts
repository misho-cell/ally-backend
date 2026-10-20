jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { labelAtChainEnd } from '../chainLabels';
import { namesFor } from '../tools/findWarmPath';

const mockQuery = query as jest.MockedFunction<typeof query>;
const OWNER = 11;
const HELPER_PHONE = '+995500000001';
const TARGET_PHONE = '+995500000002';

beforeEach(() => mockQuery.mockReset());

/**
 * #6899 (tester 21:24Z, privacy): the helper's electrician, not on Netai, was
 * named to the owner and the helper by labels other accounts saved for that
 * number („ამირან საცდელი"), not by the helper's own „გიორგი ელექტრიკოსი".
 */
describe('a person not on Netai', () => {
  it('gets no name from labels other accounts saved', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await namesFor(String(OWNER), [TARGET_PHONE]);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).not.toContain('MIN(ua.alias)');
    expect(sql).toContain('FILTER (WHERE ua."contactId" = $2::int)');
  });

  it('is named by the label of the link who holds them', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ord: 1, label: 'ნანა' },
        { ord: 2, label: 'გიორგი ელექტრიკოსი' },
      ],
      rowCount: 2,
    } as never);
    await expect(labelAtChainEnd(OWNER, [HELPER_PHONE], TARGET_PHONE)).resolves.toBe(
      'გიორგი ელექტრიკოსი',
    );
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ua."contactId" = CASE');
    expect(params).toEqual([OWNER, [HELPER_PHONE, TARGET_PHONE]]);
  });

  it('has no name when the link who holds them saved none', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ord: 1, label: 'ნანა' }], rowCount: 1 } as never);
    await expect(labelAtChainEnd(OWNER, [HELPER_PHONE], TARGET_PHONE)).resolves.toBeNull();
  });

  it('is named that way on the warm path and on the route map', () => {
    const read = (relative: string): string =>
      readFileSync(join(__dirname, '..', relative), 'utf8');
    expect(read('tools/findWarmPath.ts')).toContain(
      'name: await targetName(Number(userId), names, named, targetPhone)',
    );
    expect(read('chainMap.service.ts')).toContain(
      'labelAtChainEnd(ownerId, ranked[0].middle, targetPhone)',
    );
  });
});
