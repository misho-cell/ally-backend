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

  it('drops the reader’s note after the full name (#7328, 64120: „Iro Tsagareishvili Axel")', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'Iro Tsagareishvili Axel' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Iro Tsagareishvili')).resolves.toBe(
      'Iro Tsagareishvili',
    );
  });

  it('keeps the reader’s spelling when the name is in the other script', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'ირო ცაგარეიშვილი აქსელი' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Iro Tsagareishvili')).resolves.toBe(
      'ირო ცაგარეიშვილი',
    );
  });

  it('keeps a label that is not the registered name followed by a note', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'ირო ბიძაშვილი ნათია' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Iro Tsagareishvili')).resolves.toBe(
      'ირო ბიძაშვილი ნათია',
    );
  });

  it('keeps a label when the registered name is a single word', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'Iro Axel' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Iro')).resolves.toBe('Iro Axel');
  });

  it('reads nothing when the reader is the person', async () => {
    await expect(nameAsReaderSaved(PERSON, PERSON, 'Giorgi Turashvili')).resolves.toBe(
      'Giorgi Turashvili',
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
