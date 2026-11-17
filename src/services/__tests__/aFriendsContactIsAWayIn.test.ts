jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  phonebookPhones: jest.fn(),
}));
jest.mock('../block.service', () => ({ __esModule: true, getExcludedPhones: jest.fn() }));

import { query } from '../../db/postgres/client';
import { getExcludedPhones } from '../block.service';
import {
  firmPeopleThroughContacts,
  firmSpellings,
  heardSpellings,
  namedPeopleThroughContacts,
  nameParts,
  savedAsThisPerson,
} from '../researchBridges';
import { phonebookPhones } from '../tools/searchSecondDegree';

const mocked = <T>(fn: T): jest.Mock => fn as unknown as jest.Mock;
const OWNER = '186272';

/**
 * The tester's case, 17 Nov: the head of a found firm sat in a friend's phone
 * under his own name; the friend is the owner's contact; the firm's name stood
 * on him only in labels other people wrote. Nobody found him.
 */
describe('a person a contact holds is a way in to a firm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked(phonebookPhones).mockResolvedValue(['+995555000001']);
    mocked(getExcludedPhones).mockResolvedValue([]);
  });

  it('spells the firm as found, in the other alphabet, as its site, and without spaces', () => {
    expect(firmSpellings('ბრენდჰენდი', ['brandhand'])).toEqual(
      expect.arrayContaining(['ბრენდჰენდი', 'brendhendi', 'brandhand', 'brendhend']),
    );
    // The probe, 17 Nov: the head's tie read „brendhendi" — an „a" heard as „e".
    expect(heardSpellings('brandhand')).toEqual([
      'brandhand',
      'brandhend',
      'brendhand',
      'brendhend',
    ]);
    expect(firmSpellings('Brand Hand')).toEqual(
      expect.arrayContaining(['brand hand', 'brandhand', 'ბრანდ ჰანდ']),
    );
  });

  it('finds someone a contact holds whom other people tied to the firm', async () => {
    mocked(query)
      .mockResolvedValueOnce({
        rows: [{ phone: '+995555000009', label: 'brandhand lasha', labellers: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone: '+995555000009', saved_as: 'Levan Japaridze', bridge: 'Nino Beridze' }],
      });
    const found = await firmPeopleThroughContacts(OWNER, new Map([['ბრენდჰენდი', ['brandhand']]]));
    expect(found.get('ბრენდჰენდი')).toEqual([
      {
        saved_by_your_contact_as: 'Levan Japaridze',
        your_contact: 'Nino Beridze',
        labelled_with_the_firm_by: 2,
      },
    ]);
    // Parameterized: the spellings go as values, never into the SQL text.
    const [sql, params] = mocked(query).mock.calls[0] as [string, string[]];
    expect(sql).not.toContain('brandhand');
    expect(params).toContain('%brandhand%');
  });

  it('never shows someone the owner blocked', async () => {
    mocked(getExcludedPhones).mockResolvedValue(['+995555000009']);
    mocked(query)
      .mockResolvedValueOnce({
        rows: [{ phone: '+995555000009', label: 'brandhand', labellers: 1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone: '+995555000009', saved_as: 'Levan', bridge: 'Nino Beridze' }],
      });
    const found = await firmPeopleThroughContacts(OWNER, new Map([['Brandhand', []]]));
    expect(found.size).toBe(0);
  });

  it('matches a head by first name and surname, in either alphabet, never by one word', () => {
    const parts = nameParts('Levan Japaridze');
    expect(savedAsThisPerson('ლევან ჯაფარიძე', parts)).toBe(true);
    expect(savedAsThisPerson('Levan Japaridze Colibri', parts)).toBe(true);
    expect(savedAsThisPerson('Levan Beridze', parts)).toBe(false);
    expect(savedAsThisPerson('Levan', nameParts('Levan'))).toBe(false);
  });

  const HEAD = new Map([['Levan Japaridze', ['colibri']]]);

  it('finds a head the web names in a contact’s phone — the only one by that name', async () => {
    mocked(query)
      .mockResolvedValueOnce({
        rows: [
          { phone: '+995555000009', saved_as: 'ლევან ჯაფარიძე', bridge: 'Nino Beridze' },
          { phone: '+995555000010', saved_as: 'Levan Beridze', bridge: 'Nino Beridze' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const found = await namedPeopleThroughContacts(OWNER, HEAD);
    expect(found.get('Levan Japaridze')).toEqual([
      {
        saved_by_your_contact_as: 'ლევან ჯაფარიძე',
        your_contact: 'Nino Beridze',
        tied_to_the_firm: false,
      },
    ]);
  });

  it('of several namesakes keeps the one tied to the firm, and none when nobody is', async () => {
    const namesakes = {
      rows: [
        { phone: '+995555000009', saved_as: 'Levan Japaridze', bridge: 'Nino Beridze' },
        { phone: '+995555000011', saved_as: 'Levan Japaridze', bridge: 'Mariam Lomidze' },
      ],
    };
    const tie = { phone: '+995555000011', label: 'colibri levan', labellers: 1 };
    mocked(query)
      .mockResolvedValueOnce(namesakes)
      .mockResolvedValueOnce({ rows: [tie] });
    const found = await namedPeopleThroughContacts(OWNER, HEAD);
    expect(found.get('Levan Japaridze')).toEqual([
      {
        saved_by_your_contact_as: 'Levan Japaridze',
        your_contact: 'Mariam Lomidze',
        tied_to_the_firm: true,
      },
    ]);
    mocked(query).mockResolvedValueOnce(namesakes).mockResolvedValueOnce({ rows: [] });
    expect((await namedPeopleThroughContacts(OWNER, HEAD)).size).toBe(0);
  });

  it('asks nothing for a one-word name', async () => {
    const found = await namedPeopleThroughContacts(OWNER, new Map([['Levan', ['colibri']]]));
    expect(found.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
