jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/contactExclusions', () => ({
  __esModule: true,
  saveContactExclusion: jest.fn().mockResolvedValue({ saved: true }),
}));

import { query } from '../../db/postgres/client';
import { saveContactExclusion } from '../tools/contactExclusions';
import { keepNeverInvolved, neverScope } from '../ruledOutBridges';

/**
 * #6358 (the tester's 69148, 3 of 4): „გია ლომთაძე ჩემს საქმეებში არასდროს
 * ჩართო" saved nothing while the reply said „შევინახე".
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSave = saveContactExclusion as jest.MockedFunction<typeof saveContactExclusion>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('the scope of a „never"', () => {
  it('is every matter when the clause names no subject of its own', () => {
    expect(neverScope('გია ლომთაძე ჩემს საქმეებში არასდროს ჩართო', 'გია ლომთაძე')).toBe(
      'ყველა საქმე',
    );
    expect(neverScope('never involve Gia Lomtadze in my matters', 'Gia Lomtadze')).toBe(
      'ყველა საქმე',
    );
    expect(neverScope('გიას არასდროს ჰკითხო', 'გია')).toBe('ყველა საქმე');
    expect(neverScope('გია ლომთაძე ჩემს საქმეებში არასდროს ჩართო', 'Gia Lomtadze')).toBe(
      'ყველა საქმე',
    );
  });

  it('keeps a subject the clause names', () => {
    expect(neverScope('გია საბანკო საკითხებში არასდროს ჩართო', 'გია')).toContain('საბანკო');
  });
});

describe('keeping it', () => {
  it('saves one exclusion for the one contact the clause names, with the line as the reason', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { phone: '+995500000021', alias: 'გია ლომთაძე' },
        { phone: '+995500000022', alias: 'გიორგი' },
      ],
    } as never);
    const line = 'გია ლომთაძე ჩემს საქმეებში არასდროს ჩართო, ურთიერთობა გავწყვიტე';

    await expect(keepNeverInvolved('189509', line)).resolves.toEqual(['995500000021']);

    expect(mockSave).toHaveBeenCalledWith('189509', '995500000021', 'ყველა საქმე', line);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('"contactId" = $1::int AND alias ILIKE ANY($2::text[])');
    expect(params?.[0]).toBe('189509');
  });

  it('finds the owner’s Latin „Gia Lomtadze" from the Georgian sentence (69301)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ phone: '+995500000021', alias: 'Gia Lomtadze' }],
    } as never);
    const line = 'გია ლომთაძე ჩემს საქმეებში არასდროს ჩართო.';

    await expect(keepNeverInvolved('189594', line)).resolves.toEqual(['995500000021']);

    expect(mockQuery.mock.calls[0][1]?.[1]).toEqual(expect.arrayContaining(['%ლომთ%', '%lomt%']));
    expect(mockSave).toHaveBeenCalledWith('189594', '995500000021', 'ყველა საქმე', line);
  });

  it('saves nothing without a „never", or when two contacts answer to the name', async () => {
    await expect(keepNeverInvolved('189509', 'გიას ჰკითხე ნოტარიუსზე')).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();

    mockQuery.mockResolvedValueOnce({
      rows: [
        { phone: '+995500000021', alias: 'გია' },
        { phone: '+995500000023', alias: 'გია' },
      ],
    } as never);
    await expect(keepNeverInvolved('189509', 'გიას არასდროს ჰკითხო')).resolves.toEqual([]);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
