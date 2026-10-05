jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { nameUntitledThreadFromFile, titleFromFilename } from '../threads.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => jest.clearAllMocks());

/** The frontend's 5 Oct note (#1222): a conversation opened by a file alone kept a placeholder title. */
describe('a file-only conversation is named from its file', () => {
  it('reads a filename as a title', () => {
    expect(titleFromFilename('klientebis_sia.xlsx')).toBe('klientebis sia');
    expect(titleFromFilename('ბუღალტრები ოქტომბერი.csv')).toBe('ბუღალტრები ოქტომბერი');
    expect(titleFromFilename(`${'a'.repeat(80)}.xlsx`)).toHaveLength(60);
  });

  it('renames only a conversation that still has the placeholder', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ title: 'klientebis sia' }] } as never);
    await expect(nameUntitledThreadFromFile(7, 'klientebis_sia.xlsx')).resolves.toBe(
      'klientebis sia',
    );
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('title IS NULL OR title = ANY($3::text[])');
    expect((params as unknown[])[0]).toBe('klientebis sia');
  });

  it('leaves a conversation with a title of its own alone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(nameUntitledThreadFromFile(7, 'x.csv')).resolves.toBeNull();
  });

  it('asks nothing for a filename that is only an extension', async () => {
    await expect(nameUntitledThreadFromFile(7, '.csv')).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
