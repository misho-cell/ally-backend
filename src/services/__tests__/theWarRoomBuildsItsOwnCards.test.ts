/**
 * #7591 WAR ROOM (founder, 24 Oct 02:01 Tbilisi): Netai finds its own cards —
 * one per person and request — and the founder leaves an instruction on each.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../netaiMessage.service', () => ({ sendNetaiMessage: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { sendNetaiMessage } from '../netaiMessage.service';
import {
  briefLine,
  buildWarRoomCards,
  CardKind,
  SendRefusal,
  sendWarRoomCard,
  updateWarRoomCard,
  withoutNumbers,
} from '../warRoomCards.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSend = sendNetaiMessage as jest.MockedFunction<typeof sendNetaiMessage>;
const rows = (r: unknown[]): never => ({ rows: r, rowCount: r.length }) as never;

beforeEach(() => {
  mockQuery.mockReset();
  mockSend.mockReset();
});

describe('what a card may say', () => {
  it('never carries a number', () => {
    expect(withoutNumbers('დამირეკე +995 555 12 34 56 ხვალ')).toBe('დამირეკე … ხვალ');
  });

  it('is one short line', () => {
    expect(briefLine('  a\n b  ')).toBe('a b');
    expect(briefLine('')).toBeNull();
    expect((briefLine('x'.repeat(400)) ?? '').length).toBe(300);
  });
});

describe('building the cards', () => {
  it('finds a stuck goal and stores one card that keeps an instruction already given', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // new joiners
      .mockResolvedValueOnce(rows([])) // unanswered replies
      .mockResolvedValueOnce(rows([{ id: 31021, user_id: 5005, thread_id: 63790 }])) // stuck
      .mockResolvedValueOnce(rows([])) // technical errors
      .mockResolvedValueOnce(rows([{ name: 'Dato' }]))
      .mockResolvedValueOnce(rows([{ content: 'არ არის სიახლე?' }]))
      .mockResolvedValueOnce(rows([{ content: 'ჯერ ახალი პასუხი არ მიმიღია.' }]))
      .mockResolvedValueOnce(rows([]));

    await expect(buildWarRoomCards()).resolves.toBe(1);

    const [sql, params] = mockQuery.mock.calls[7] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (kind, subject_key)');
    expect(sql).toContain("WHERE war_room_cards.status = 'new'");
    expect(params.slice(0, 5)).toEqual([5005, CardKind.StuckGoal, 't:31021', 63790, 31021]);
    expect(JSON.parse(String(params[5]))).toMatchObject({
      who: 'Dato',
      their_words: 'არ არის სიახლე?',
      netai_did: 'ჯერ ახალი პასუხი არ მიმიღია.',
    });
  });

  it('looks at real accounts only', async () => {
    mockQuery.mockResolvedValue(rows([]));
    await buildWarRoomCards();
    for (const [sql] of mockQuery.mock.calls.slice(0, 4) as [string][]) {
      expect(sql).toContain('test_seats');
      expect(sql).toContain('"deletedAt" IS NULL');
    }
  });
});

describe('the founder’s instruction', () => {
  it('is saved with who and when, and moves a new card on', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7, status: 'instructed' }]));

    const card = await updateWarRoomCard(7, { instruction: ' მიწერე ბოდიში ', by: '167250' });

    expect(card?.status).toBe('instructed');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([7, 'მიწერე ბოდიში', null, '167250', null]);
    expect(sql).toContain("THEN 'instructed'");
    expect(sql).toContain('sent_by IS NULL');
  });

  it('answers null for a card that does not exist', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));
    await expect(updateWarRoomCard(999, { status: 'held', by: '1' })).resolves.toBeNull();
  });
});

describe('a draft and the founder’s approval (D881)', () => {
  it('saves a draft and moves the card to drafted', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 7, status: 'drafted' }]));
    await updateWarRoomCard(7, { draft: 'გამარჯობა, ისევ გჭირდება?', by: 'netai23' });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe('გამარჯობა, ისევ გჭირდება?');
    expect(sql).toContain("THEN 'drafted'");
  });

  it('sends his edit as Netai’s own message, once', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ found: true }]))
      .mockResolvedValueOnce(rows([{ id: 7, user_id: 5005, draft: 'draft' }]))
      .mockResolvedValueOnce(rows([{ id: 7, status: 'sent' }]));
    mockSend.mockResolvedValueOnce({ id: 900, threadId: 64000, newThread: false });

    const out = await sendWarRoomCard(7, '167250', ' edited ');

    expect(out.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      userId: 5005,
      text: 'edited',
      choices: [],
      sentBy: '167250',
    });
  });

  it('refuses a card already sent, and a card with no text', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ found: true }])).mockResolvedValueOnce(rows([]));
    await expect(sendWarRoomCard(7, '1')).resolves.toEqual({
      sent: false,
      reason: SendRefusal.AlreadySent,
    });

    mockQuery
      .mockResolvedValueOnce(rows([{ found: true }]))
      .mockResolvedValueOnce(rows([{ id: 8, user_id: 5005, draft: null }]))
      .mockResolvedValueOnce(rows([]));
    await expect(sendWarRoomCard(8, '1')).resolves.toEqual({
      sent: false,
      reason: SendRefusal.NoText,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('frees the card when the send fails', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ found: true }]))
      .mockResolvedValueOnce(rows([{ id: 9, user_id: 5005, draft: 'x' }]))
      .mockResolvedValueOnce(rows([]));
    mockSend.mockRejectedValueOnce(new Error('push down'));

    await expect(sendWarRoomCard(9, '1')).rejects.toThrow('push down');
    const [sql] = mockQuery.mock.calls[2] as [string];
    expect(sql).toContain('SET sent_by = NULL');
  });
});
