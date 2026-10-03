jest.mock('../../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../../db/postgres/client';
import { hasAnyContact } from '../getContactCount';

const mockQuery = query as jest.MockedFunction<typeof query>;

function rows(data: unknown[]): { rows: unknown[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

/** H3: the greeting asks an owner with an empty phonebook to import contacts. */
describe('hasAnyContact', () => {
  beforeEach(() => mockQuery.mockReset());

  it('is true when the phonebook has a row', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ one: 1 }]) as never);
    await expect(hasAnyContact('501')).resolves.toBe(true);
  });

  it('is false for an empty phonebook', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    await expect(hasAnyContact('501')).resolves.toBe(false);
  });

  it('reads one row, by parameter, with a timeout', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    await hasAnyContact('501');
    const [sql, params, timeout] = mockQuery.mock.calls[0];
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['501']);
    expect(typeof timeout).toBe('number');
  });

  it('passes a failed read up to the caller', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(hasAnyContact('501')).rejects.toThrow('timeout');
  });
});
