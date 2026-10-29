jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../chat.service', () => ({ __esModule: true, processChat: jest.fn() }));
jest.mock('../factsAboutMe.service', () => ({ __esModule: true, factsAboutMe: jest.fn() }));
jest.mock('../threads.service', () => ({
  __esModule: true,
  getOrCreateDefaultThread: jest.fn().mockResolvedValue(90001),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitRunComplete: jest.fn() }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { query } from '../../db/postgres/client';
import { processChat } from '../chat.service';
import { factsAboutMe } from '../factsAboutMe.service';
import { recordProductEvent } from '../productEvents.service';
import { sendPushNotification } from '../notification.service';
import {
  JOINER_FIRST_MESSAGE_EVENT,
  fittingField,
  joinerEventBody,
  JoinerSeatOutcome,
  MAX_JOINER_SEATS,
  joinersDue,
  runJoinerFirstMessagesForSeats,
  sendJoinerFirstMessage,
} from '../joinerFirstMessage.service';

/**
 * #7729 / #7828 / #7757 (Misho's „კი", 27 Oct): a joiner's one first message
 * carries a real need that fits their own work, anonymously, and the invite.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockChat = processChat as jest.MockedFunction<typeof processChat>;
const mockFacts = factsAboutMe as jest.MockedFunction<typeof factsAboutMe>;
const fact = (field: string, value: string): never =>
  ({
    id: 1,
    field,
    value,
    origin: 'research',
    source_url: null,
    date: '2026-10-27',
    status: null,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockChat.mockResolvedValue({ reply: 'კეთილი იყოს შენი მობრძანება Netai-ზე!' } as never);
});

describe('the joiner’s first message', () => {
  it('goes only to people who registered on Netai, once, after research had its turn', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 196001 }], rowCount: 1 } as never);
    await expect(joinersDue()).resolves.toEqual([196001]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('u."hasAccessToAlly" = true');
    expect(String(sql)).toContain('NOT EXISTS (SELECT 1 FROM test_seats ts');
    expect(params).toEqual([120, 15, JOINER_FIRST_MESSAGE_EVENT, 20]);
  });

  it('finds another member’s open goal that names the joiner’s own field', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 7, user_id: 5, title: 'ვეძებ იურისტს თბილისში' },
        { id: 8, user_id: 6, title: 'find an investor for a hotel in Kobuleti' },
      ],
      rowCount: 2,
    } as never);
    await expect(fittingField(196001, ['hospitality'])).resolves.toBe('hospitality');
    expect(mockQuery.mock.calls[0][1]).toEqual(['196001', 2000]);
  });

  it('tells the model only the field — never the goal, its owner or a name', () => {
    const body = joinerEventBody('hospitality');
    expect(body).toContain('„hospitality"');
    expect(body).not.toContain('Kobuleti');
    expect(body).toContain('ორივე მხარე უნდა დათანხმდეს');
    expect(body).toContain('get_invite_link');
    expect(joinerEventBody(null)).not.toContain('„');
  });

  it('writes into the main chat, records it first, and the push opens that chat', async () => {
    mockFacts.mockResolvedValue([fact('occupation', 'hospitality'), fact('city', 'Batumi')]);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 8, user_id: 6, title: 'find an investor for a hotel in Kobuleti' }],
      rowCount: 1,
    } as never);

    await expect(sendJoinerFirstMessage(196001)).resolves.toBe(true);

    expect(recordProductEvent).toHaveBeenCalledWith(196001, JOINER_FIRST_MESSAGE_EVENT, {
      thread_id: 90001,
      fitting_need: true,
    });
    expect(String(mockChat.mock.calls[0][2])).toContain('„hospitality"');
    expect(String(mockChat.mock.calls[0][2])).not.toContain('Kobuleti');
    expect(sendPushNotification).toHaveBeenCalledWith(
      '196001',
      expect.objectContaining({ url: '/chat/90001' }),
    );
  });

  it('still welcomes and asks for an invite when no need fits, and pushes nothing for an empty reply', async () => {
    mockFacts.mockResolvedValue([]);
    mockChat.mockResolvedValueOnce({ reply: '', runFailed: true } as never);
    await expect(sendJoinerFirstMessage(196002)).resolves.toBe(false);
    expect(recordProductEvent).toHaveBeenCalledWith(196002, JOINER_FIRST_MESSAGE_EVENT, {
      thread_id: 90001,
      fitting_need: false,
    });
    expect(sendPushNotification).not.toHaveBeenCalled();
  });
});

describe('the first message on fictional seats, for the tester (plate v538)', () => {
  const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

  it('refuses no seats, too many, or a real person, and writes nothing', async () => {
    expect((await runJoinerFirstMessagesForSeats([])).outcome).toBe(JoinerSeatOutcome.BadInput);
    const many = Array.from({ length: MAX_JOINER_SEATS + 1 }, (_, i) => i + 1);
    expect((await runJoinerFirstMessagesForSeats(many)).outcome).toBe(JoinerSeatOutcome.BadInput);
    mockQuery.mockResolvedValueOnce(rows([{ n: 1 }]));
    expect((await runJoinerFirstMessagesForSeats([1, 2])).outcome).toBe(
      JoinerSeatOutcome.NotATestSeat,
    );
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('never welcomes a seat twice', async () => {
    mockFacts.mockResolvedValue([] as never);
    mockQuery
      .mockResolvedValueOnce(rows([{ n: 2 }]))
      .mockResolvedValueOnce(rows([{ user_id: 3 }]))
      .mockResolvedValue(rows([]));
    expect(await runJoinerFirstMessagesForSeats([3, 4])).toEqual({
      outcome: JoinerSeatOutcome.Ran,
      sent: 1,
    });
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});

describe('the route (plate v538)', () => {
  it('is POST /admin/joiner-first-messages', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
    const { join } = jest.requireActual<typeof import('path')>('path');
    const admin = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(admin).toContain("adminRouter.post('/joiner-first-messages'");
  });
});
