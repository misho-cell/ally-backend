import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { writeShortTitles } from '../threadTitle.service';
import { backfillShortTitles } from '../shortTitleBackfill.service';

jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../threadTitle.service', () => ({ __esModule: true, writeShortTitles: jest.fn() }));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWrite = writeShortTitles as jest.MockedFunction<typeof writeShortTitles>;

function rows(...list: Array<{ id: number; user_id: number; title: string }>): never {
  return { rows: list } as never;
}

/** 4919, Misho's yes of 14 October: the conversations made before short titles existed. */
describe('short titles for old conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shortens each title of a batch and counts what was written', async () => {
    mockQuery.mockResolvedValueOnce(
      rows(
        { id: 30, user_id: 7, title: 'ადვოკატი სააპელაციო საჩივრისთვის' },
        { id: 20, user_id: 8, title: 'Photographer for a wedding in Batumi' },
      ),
    );
    mockWrite.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(backfillShortTitles(2, null)).resolves.toEqual({
      asked: 2,
      filled: 1,
      next_before_id: 20,
    });
    expect(mockWrite).toHaveBeenCalledWith(
      '7',
      30,
      'ადვოკატი სააპელაციო საჩივრისთვის',
      'ადვოკატი სააპელაციო საჩივრისთვის',
    );
  });

  it('asks only real people’s untitled conversations, older than the cursor, newest first', async () => {
    mockQuery.mockResolvedValueOnce(rows());

    await backfillShortTitles(25, 51200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('t.short_title IS NULL');
    expect(String(sql)).toContain('NOT EXISTS (SELECT 1 FROM test_seats');
    expect(String(sql)).toContain('ORDER BY t.id DESC');
    expect(params).toEqual([25, 51200]);
  });

  it('ends the walk when a batch comes back short', async () => {
    mockQuery.mockResolvedValueOnce(rows({ id: 5, user_id: 7, title: 'ექიმი კარდიოლოგი' }));
    mockWrite.mockResolvedValueOnce(true);

    await expect(backfillShortTitles(25, null)).resolves.toMatchObject({ next_before_id: null });
  });
});

describe('POST /admin/short-titles/backfill', () => {
  const ROUTES = readFileSync(join(__dirname, '../../api/routes/admin.routes.ts'), 'utf8');

  it('takes a bounded batch and a cursor, and answers with the next cursor', () => {
    expect(ROUTES).toContain("'/short-titles/backfill'");
    expect(ROUTES).toContain("body('limit').optional().isInt({ min: 1, max: BACKFILL_MAX_BATCH })");
    expect(ROUTES).toContain('await backfillShortTitles(');
  });
});
