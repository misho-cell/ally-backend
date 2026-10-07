jest.mock('../introduction.service', () => ({
  __esModule: true,
  pendingIntroInMediatorThread: jest.fn(),
}));
jest.mock('../tools/respondToIntroduction', () => ({
  __esModule: true,
  respondToIntroduction: jest.fn(),
}));

import { pendingIntroInMediatorThread } from '../introduction.service';
import { respondToIntroduction } from '../tools/respondToIntroduction';
import { acceptIntroOnYes, INTRO_ACCEPTED_BY_YES, isPlainYes } from '../introYes';

/**
 * D709, the tester's 44194: the helper's „კი" was met with „how do you want
 * to answer?" and six made-up buttons. A plain yes to the open request is
 * accepted by the server.
 */
const mockOpen = pendingIntroInMediatorThread as jest.MockedFunction<
  typeof pendingIntroInMediatorThread
>;
const mockRespond = respondToIntroduction as jest.MockedFunction<typeof respondToIntroduction>;

beforeEach(() => {
  mockOpen.mockReset();
  mockRespond.mockReset();
});

describe('a plain yes', () => {
  it.each(['კი', 'კი!', 'კი, დააკავშირე', 'დიახ', 'Yes', 'Yes, connect them', 'Да'])(
    '„%s" is one',
    (line) => {
      expect(isPlainYes(line)).toBe(true);
    },
  );

  it.each(['კი, მაგრამ ჯერ ჰკითხე რაზეა', 'არა', 'კიდევ ერთხელ მითხარი', 'yes if he pays'])(
    '„%s" is not',
    (line) => {
      expect(isPlainYes(line)).toBe(false);
    },
  );
});

describe('the open introduction', () => {
  it('is accepted on a plain yes, and the run is told not to ask how', async () => {
    mockOpen.mockResolvedValue(77);
    mockRespond.mockResolvedValue({ success: true });
    await expect(acceptIntroOnYes('5', 9, 'კი')).resolves.toBe(INTRO_ACCEPTED_BY_YES);
    expect(mockRespond).toHaveBeenCalledWith('5', 77, true);
    expect(INTRO_ACCEPTED_BY_YES).toContain('do NOT ask how');
  });

  it('is left alone on anything but a plain yes, or when none is open', async () => {
    await expect(acceptIntroOnYes('5', 9, 'კი, მაგრამ ჯერ ჰკითხე')).resolves.toBeNull();
    mockOpen.mockResolvedValue(null);
    await expect(acceptIntroOnYes('5', 9, 'კი')).resolves.toBeNull();
    expect(mockRespond).not.toHaveBeenCalled();
  });

  it('tells the run nothing when the accept did not go through', async () => {
    mockOpen.mockResolvedValue(77);
    mockRespond.mockResolvedValue({ success: false, error: 'gone' });
    await expect(acceptIntroOnYes('5', 9, 'კი')).resolves.toBeNull();
  });
});
