jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../taskAsks.service', () => ({
  createRelayAsk: jest.fn(),
  sendApprovedAskAnswer: jest.fn(),
}));
jest.mock('../threads.service', () => ({
  saveThreadMessage: jest.fn(),
  userLanguage: jest.fn().mockResolvedValue('en'),
}));
jest.mock('../instructedAsk', () => ({
  oneContactNamed: jest.fn(),
  ownersLabel: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query as _query } from '../../db/postgres/client';
import { createRelayAsk, sendApprovedAskAnswer } from '../taskAsks.service';
import { saveThreadMessage } from '../threads.service';
import { oneContactNamed, ownersLabel } from '../instructedAsk';
import { offerReferral, ReferralTap, referralChoices, referralTapOf } from '../askReferral.service';
import { settleReferralTap } from '../askReferralSettle.service';

/**
 * 1696 (A13): „not me — ask Eka" gets one card; yes asks Eka from the reader's
 * side, no tells the asker he could not help, and nobody off Netai is written to.
 */
const mockQuery = _query as jest.Mock;
const mockRelay = createRelayAsk as jest.Mock;
const mockSend = sendApprovedAskAnswer as jest.Mock;
const mockTell = saveThreadMessage as jest.Mock;

const OFFER = {
  id: 77,
  referral_phone: '+995555000009',
  referral_name: 'Eka Beridze',
  from_user_id: 5,
  question: 'Do you know a good notary?',
  asker_name: 'Nino',
  reader_name: 'Levan',
  task_thread_id: 900,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('the referral card (1696)', () => {
  it('its three buttons are read back as taps in every language', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      const [named, unnamed, no] = referralChoices(language);
      expect(referralTapOf(named)).toBe(ReferralTap.Named);
      expect(referralTapOf(unnamed)).toBe(ReferralTap.Unnamed);
      expect(referralTapOf(no)).toBe(ReferralTap.No);
    }
    expect(referralTapOf('Eka would know')).toBeNull();
  });

  it('a line naming one of his own people gets the card, stored on the ask', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 77, from_user_id: 5, asker_name: 'Nino' }] });
    (oneContactNamed as jest.Mock).mockResolvedValue('+995555000009');
    mockQuery.mockResolvedValueOnce({ rows: [{ hit: false }] });
    (ownersLabel as jest.Mock).mockResolvedValue('Eka Beridze');
    const card = await offerReferral('8', 40, 'not me, but ask Eka Beridze', 'en');
    expect(card?.text).toBe('Shall I ask Eka Beridze for Nino?');
    expect(card?.choices).toEqual(referralChoices('en'));
    const stored = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('referral_phone = $2'),
    );
    expect(stored?.[1]).toEqual([77, '+995555000009', 'Eka Beridze']);
  });

  it('an ordinary answer gets no card and reads nothing', async () => {
    expect(await offerReferral('8', 40, 'Yes, I know one in Vake.', 'en')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('naming the asker back is no referral', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 77, from_user_id: 5, asker_name: 'Nino' }] });
    (oneContactNamed as jest.Mock).mockResolvedValue('+995555000001');
    mockQuery.mockResolvedValueOnce({ rows: [{ hit: true }] });
    expect(await offerReferral('8', 40, 'ask Nino herself', 'en')).toBeNull();
  });
});

describe('the tap on it (1696)', () => {
  it('yes, with his name: Eka is asked from his side and the asker hears his name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [OFFER] });
    mockRelay.mockResolvedValue({ sent: true, to_name: 'Eka Beridze' });
    const line = await settleReferralTap('8', 40, ReferralTap.Named, 'en');
    expect(line).toBe("I've asked Eka Beridze. The answer goes to Nino.");
    expect(mockRelay).toHaveBeenCalledWith(
      '8',
      77,
      '+995555000009',
      "I'm asking for Nino: Do you know a good notary?",
    );
    const decision = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('referral_approved = $2'),
    );
    expect(decision?.[1]).toEqual([77, true, true]);
    expect(mockTell.mock.calls[0][3]).toContain('Levan is asking someone they know for you');
  });

  it('yes, without his name: the asker is told without it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [OFFER] });
    mockRelay.mockResolvedValue({ sent: true, to_name: 'Eka Beridze' });
    await settleReferralTap('8', 40, ReferralTap.Unnamed, 'en');
    const decision = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('referral_approved = $2'),
    );
    expect(decision?.[1]).toEqual([77, true, false]);
    expect(mockTell.mock.calls[0][3]).not.toContain('Levan');
  });

  it('Eka not on Netai: nothing is sent, he is offered to invite her', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [OFFER] });
    mockRelay.mockResolvedValue({ sent: false, reason: 'recipient_not_member', error: 'x' });
    const line = await settleReferralTap('8', 40, ReferralTap.Named, 'en');
    expect(line).toContain("isn't on Netai yet");
    expect(mockTell).not.toHaveBeenCalled();
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('referral_approved = $2')),
    ).toBe(false);
  });

  it('no: nothing goes to Eka, and the asker gets his ordinary decline', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [OFFER] });
    mockSend.mockResolvedValue({ sent: true });
    const line = await settleReferralTap('8', 40, ReferralTap.No, 'en');
    expect(mockRelay).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(line).toContain("couldn't help");
  });

  it('a tap with no offer waiting is left to the turn', async () => {
    expect(await settleReferralTap('8', 40, ReferralTap.Named, 'en')).toBeNull();
  });

  it('the chat answers it before the model, and the asker never reads a name he was refused', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('? await answerReferral(userId, threadId, userMessage, runId, intent)');
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).toContain('CASE WHEN p.may_name_referrer IS FALSE THEN NULL ELSE b.name END');
  });
});
