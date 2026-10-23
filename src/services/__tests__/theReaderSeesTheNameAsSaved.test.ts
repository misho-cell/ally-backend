jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { query } from '../../db/postgres/client';
import { nameAsReaderSaved } from '../readerSavedName';

const mockQuery = query as jest.Mock;
const READER = 11;
const PERSON = 22;

beforeEach(() => {
  mockQuery.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** #6767 (Giorgi, 20 Oct): a person is named as the reader saved him. */
describe('a name as the reader has it saved', () => {
  it('is the reader’s own label, without the old app’s „Ally"', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'გიორგი ტურაშვილი Ally' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'გიორგი ტურაშვილი',
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([READER, PERSON]);
  });

  it('is the registered name when the reader has not saved him', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'Giorgi Turashvili',
    );
  });

  it('is the registered name when the label is only „Ally"', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'Ally' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'Giorgi Turashvili',
    );
  });

  it('is the registered name when the read fails, and the failure is logged', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(nameAsReaderSaved(READER, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'Giorgi Turashvili',
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it('reads nothing when the reader is the person', async () => {
    await expect(nameAsReaderSaved(PERSON, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'Giorgi Turashvili',
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
