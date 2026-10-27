jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));
jest.mock('../userNotes.service', () => ({
  __esModule: true,
  saveUserNote: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('../threads.service', () => ({
  ...jest.requireActual('../threads.service'),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));

import { query } from '../../db/postgres/client';
import { saveUserNote } from '../userNotes.service';
import { buttonToldByNetai, isDeclineChoice } from '../askOpening';
import { keepInMindIfTapped } from '../taskAsks.service';

/**
 * #7760 (use-case register L134): a person asked who cannot help yet taps „not
 * yet, I'll keep it in mind"; the asker hears it in plain words, the ask closes
 * like a no, and the helper's assistant keeps the need — without the asker's
 * name — for later.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const KEEP = 'ჯერ არავის ვიცნობ, დავიმახსოვრებ';

beforeEach(() => jest.clearAllMocks());

describe('„keep it in mind" (#7760)', () => {
  it('closes the ask like a no, and the asker hears it in Netai’s words', () => {
    expect(isDeclineChoice(KEEP)).toBe(true);
    expect(buttonToldByNetai(KEEP, 'ka', 'თორნიკე')).toBe(
      'თორნიკე ჯერ ასეთ ადამიანს არ იცნობს, მაგრამ დაიმახსოვრა.',
    );
  });

  it('keeps the need as the helper’s note, without the asker’s name', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { to_user_id: 171, question: 'ბეკას სჭირდება კარგი სანტექნიკი ვაკეში', asker: 'ბეკა' },
      ],
      rowCount: 1,
    } as never);
    await expect(keepInMindIfTapped(70100, KEEP)).resolves.toBe(true);
    const [helper, kind, text] = (saveUserNote as jest.Mock).mock.calls[0];
    expect(helper).toBe('171');
    expect(kind).toBe('need');
    expect(text).toContain('დავიმახსოვრე, ერთ-ერთ წევრს სჭირდება: ');
    expect(text).toContain('სანტექნიკი');
    expect(text).not.toContain('ბეკა');
  });

  it('does nothing for any other message, and never reads the database for it', async () => {
    await expect(keepInMindIfTapped(70100, 'არა, არ ვიცნობ')).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(saveUserNote).not.toHaveBeenCalled();
  });
});
