jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { query } from '../../db/postgres/client';
import { nameAsReaderSaved, nameFromLabel } from '../readerSavedName';

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

  it('is the registered name when the label is another surname (#7631)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'ირო ბიძაშვილი ნათია' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Iro Tsagareishvili')).resolves.toBe(
      'Iro Tsagareishvili',
    );
  });

  it('is the registered name for a label with a dot, two scripts or a misspelt surname (#7631)', async () => {
    for (const alias of ['ლაშა Kurashvili.', 'ლაშა იურაშვილი', 'Lasha K. (Axel)']) {
      mockQuery.mockResolvedValueOnce({ rows: [{ alias }] });
      await expect(nameAsReaderSaved(READER, PERSON, 'Lasha Kurashvili')).resolves.toBe(
        'Lasha Kurashvili',
      );
    }
  });

  it('keeps the reader’s clean Georgian spelling of the registered name (#6767)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ alias: 'ლაშა ქურაშვილი' }] });
    await expect(nameAsReaderSaved(READER, PERSON, 'Lasha Kurashvili')).resolves.toBe(
      'ლაშა ქურაშვილი',
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

  it('drops a note after the name, and a misspelt name for the registered one (#7631, 65181)', () => {
    expect(nameFromLabel('Guram Ruxadze Axel', 'Guram Rukhadze')).toBe('Guram Rukhadze');
    expect(nameFromLabel('Guram Rukhadze Axel', 'Guram Rukhadze')).toBe('Guram Rukhadze');
    expect(nameFromLabel('გურამ რუხაძე Axel', 'Guram Rukhadze')).toBe('გურამ რუხაძე');
    expect(nameFromLabel('ირო ენჯელ კლუბი', 'Iro Tsagareishvili')).toBe('Iro Tsagareishvili');
    expect(nameFromLabel('გურამ რუხაძე', 'Guram Rukhadze')).toBe('გურამ რუხაძე');
  });
});
