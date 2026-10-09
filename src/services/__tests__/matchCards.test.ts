jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  getOrCreateDefaultThread: jest.fn().mockResolvedValue(700),
  saveThreadMessage: jest.fn().mockResolvedValue(undefined),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));

import { query as _query } from '../../db/postgres/client';
import { saveThreadMessage } from '../threads.service';
import {
  card1Choices,
  card1Text,
  card2Choices,
  card2Text,
  MatchTap,
  matchTapOf,
} from '../matchCards';
import { expireMatches, settleMatchTap } from '../matchFlow.service';
import { isCardHour } from '../needsOffers.cron';

/** 1699 part 2 (A16): two no-name cards; names only after both yes. */
const mockQuery = _query as jest.Mock;
const mockSave = saveThreadMessage as jest.Mock;
const MATCH = {
  id: 4,
  need_user_id: 10,
  offer_user_id: 20,
  field: 'hospitality',
  card1_thread_id: 300,
  need_name: 'Nino',
  offer_name: 'Levan',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('the two cards say only the field (1699)', () => {
  it('neither card names anybody or carries the goal’s words', () => {
    expect(card1Text('en', 'hospitality')).toBe(
      'Someone in your circle is open to exactly this — hospitality. Shall I ask whether they want to talk?',
    );
    expect(card2Text('en', 'hospitality')).toBe(
      'Someone in your circle needs something in your field — hospitality. Shall I put you in touch?',
    );
  });

  it('every button is read back as its card and its tap', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(matchTapOf(card1Choices(language)[0])).toEqual({ card: 1, tap: MatchTap.Yes });
      expect(matchTapOf(card1Choices(language)[1])).toEqual({ card: 1, tap: MatchTap.No });
      expect(matchTapOf(card2Choices(language)[0])).toEqual({ card: 2, tap: MatchTap.Yes });
      expect(matchTapOf(card2Choices(language)[1])).toEqual({ card: 2, tap: MatchTap.No });
    }
    expect(matchTapOf('yes')).toBeNull();
  });
});

describe('the taps (1699)', () => {
  it('his yes on card 1 sends card 2 to her, naming nobody', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MATCH] });
    await expect(settleMatchTap('10', 300, 1, MatchTap.Yes, 'en')).resolves.toBe(
      'Good, I will ask and let you know.',
    );
    const toHer = mockSave.mock.calls.find((call) => call[0] === 700);
    expect(toHer?.[3]).toBe(card2Text('en', 'hospitality'));
    expect(toHer?.[3]).not.toContain('Nino');
  });

  it('her yes on card 2 names them to each other', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MATCH] });
    await expect(settleMatchTap('20', 700, 2, MatchTap.Yes, 'en')).resolves.toBe(
      'You are connected with Nino. They will write to you through me.',
    );
    expect(mockSave.mock.calls[0][3]).toBe(
      'Levan is happy to talk. Tell me what to pass on and I will carry it.',
    );
  });

  it('her no tells him only that nothing came of it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MATCH] });
    await settleMatchTap('20', 700, 2, MatchTap.No, 'en');
    expect(mockSave.mock.calls[0][3]).toBe('Nothing came of it this time.');
  });

  it('his no closes it silently', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [MATCH] });
    await settleMatchTap('10', 300, 1, MatchTap.No, 'en');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('no card waiting here leaves the turn alone', async () => {
    await expect(settleMatchTap('10', 300, 1, MatchTap.Yes, 'en')).resolves.toBeNull();
  });

  it('an expired match tells only the one who had said yes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { ...MATCH, card2_at: new Date() },
        { ...MATCH, id: 5, card2_at: null },
      ],
    });
    await expect(expireMatches()).resolves.toBe(2);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('cards go once a day, at noon in Tbilisi', () => {
    expect(isCardHour(new Date('2026-10-09T08:05:00Z'), null)).toBe(true);
    expect(isCardHour(new Date('2026-10-09T08:30:00Z'), '2026-10-09')).toBe(false);
    expect(isCardHour(new Date('2026-10-09T02:05:00Z'), null)).toBe(false);
  });
});
