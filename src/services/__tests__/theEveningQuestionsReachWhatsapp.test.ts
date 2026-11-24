/**
 * Misho, 24 Nov (the app is retired): questions over a person's two-a-day wait
 * for the evening card — an app screen. A member who chose WhatsApp got only
 * „N questions" and a link to it. Each question now reaches WhatsApp as its own
 * message on its own conversation, so an answer swiped onto it finds its asker.
 */
const mockQuery = jest.fn();
const mockPush = jest.fn();
const mockReaches = jest.fn();
const mockTell = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: (...a: unknown[]) => mockPush(...a),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  userLanguage: async () => 'ka',
}));
jest.mock('../whatsappChannel.service', () => ({
  __esModule: true,
  reachesInWhatsapp: (...a: unknown[]) => mockReaches(...a),
  tellInWhatsapp: (...a: unknown[]) => mockTell(...a),
}));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  askPushTitle: (_l: string, name: string) => `Netai — ${name}-ის ასისტენტი გეკითხება`,
}));

import { cardQuestionText, ringForCard } from '../eveningCard.service';

const rows = (r: unknown[]): unknown => ({ rows: r, rowCount: r.length });

beforeEach(() => {
  mockQuery.mockReset().mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)::int AS n')) return Promise.resolve(rows([{ n: 2 }]));
    if (sql.includes('ta.ask_thread_id')) {
      return Promise.resolve(
        rows([
          { ask_thread_id: 501, from_name: 'Nino Beridze', question: 'კარგ ბუღალტერს იცნობ?' },
          { ask_thread_id: 502, from_name: 'Levan Japaridze', question: 'ვინ აკეთებს ლოგოს?' },
        ]),
      );
    }
    return Promise.resolve(rows([]));
  });
  mockPush.mockReset().mockResolvedValue(undefined);
  mockTell.mockReset().mockResolvedValue('sent');
  mockReaches.mockReset();
});

describe('the evening card in WhatsApp', () => {
  it('sends each question on its own conversation, worth a template, and keeps the push out of WhatsApp', async () => {
    mockReaches.mockResolvedValue(true);
    await expect(ringForCard({ id: 7, user_id: 171 })).resolves.toBe(2);
    expect(mockTell).toHaveBeenCalledTimes(2);
    expect(mockTell).toHaveBeenNthCalledWith(
      1,
      171,
      '*Netai — Nino Beridze-ის ასისტენტი გეკითხება*\nკარგ ბუღალტერს იცნობ?',
      501,
      true,
    );
    expect(mockTell.mock.calls[1][2]).toBe(502);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][2]).toEqual({ notInWhatsapp: true });
  });

  it('rings only the app card for a member who did not choose WhatsApp', async () => {
    mockReaches.mockResolvedValue(false);
    await ringForCard({ id: 7, user_id: 171 });
    expect(mockTell).not.toHaveBeenCalled();
    expect(mockPush.mock.calls[0]).toHaveLength(2);
  });

  it('puts whose assistant asks on top, in bold', () => {
    expect(cardQuestionText('Title', 'Q?')).toBe('*Title*\nQ?');
  });
});
