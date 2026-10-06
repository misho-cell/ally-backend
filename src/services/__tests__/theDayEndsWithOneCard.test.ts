jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../threads.service', () => ({
  __esModule: true,
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../taskAsks.service', () => ({
  __esModule: true,
  createAsk: jest.fn().mockResolvedValue({ sent: true, ask_id: 1, to_name: 'Nino' }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { sendPushNotification } from '../notification.service';
import { createAsk } from '../taskAsks.service';
import { nextEveningCard, eveningCardPush, EVENING_CARD_SNOOZE_MS } from '../eveningCard';
import {
  currentEveningCard,
  eveningCardFor,
  snoozeEveningCard,
  EVENING_CARD_URL,
} from '../eveningCard.service';
import { sweepEveningCards } from '../eveningCard.cron';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPush = sendPushNotification as jest.MockedFunction<typeof sendPushNotification>;
const mockCreateAsk = createAsk as jest.MockedFunction<typeof createAsk>;
const rows = (r: unknown[]): unknown => ({ rows: r, rowCount: r.length });

beforeEach(() => jest.clearAllMocks());

/**
 * #1850 (founder, 6 Oct): two questions a day reach a person at once; the rest
 * are shown ONCE, together, at 19:00 their time, with one snooze of two hours.
 */
describe('when the card is due', () => {
  it('is 19:00 today in the person’s zone while that is still ahead', () => {
    // 14:00Z is 18:00 in Tbilisi.
    const card = nextEveningCard(new Date('2026-10-06T14:00:00Z'), 'Asia/Tbilisi');
    expect(card.dueAt.toISOString()).toBe('2026-10-06T15:00:00.000Z');
    expect(card.cardDate).toBe('2026-10-06');
  });

  it('is tomorrow’s 19:00 once today’s has gone', () => {
    const card = nextEveningCard(new Date('2026-10-06T16:00:00Z'), 'Asia/Tbilisi');
    expect(card.dueAt.toISOString()).toBe('2026-10-07T15:00:00.000Z');
    expect(card.cardDate).toBe('2026-10-07');
  });

  it('follows the person’s own zone, not Tbilisi’s', () => {
    // 19:00 in Madrid (CEST, UTC+2) is 17:00Z.
    const card = nextEveningCard(new Date('2026-10-06T14:00:00Z'), 'Europe/Madrid');
    expect(card.dueAt.toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });

  it('snoozes for two hours', () => {
    expect(EVENING_CARD_SNOOZE_MS).toBe(2 * 60 * 60 * 1000);
  });
});

describe('the card a question goes on', () => {
  it('is one per person per local day', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([{ time_zone: 'Asia/Tbilisi' }]) as never)
      .mockResolvedValueOnce(rows([{ id: 7, due_at: new Date('2026-10-06T15:00:00Z') }]) as never);

    const slot = await eveningCardFor(171, new Date('2026-10-06T14:00:00Z'));

    expect(slot).toEqual({ id: 7, dueAt: new Date('2026-10-06T15:00:00Z') });
    const [sql, params] = mockQuery.mock.calls[1];
    expect(String(sql)).toContain('ON CONFLICT (user_id, card_date)');
    expect(params).toEqual([171, '2026-10-06', new Date('2026-10-06T15:00:00Z')]);
  });
});

describe('the sweep at 19:00', () => {
  const held = {
    id: 3,
    task_id: 40,
    to_user_id: 171,
    contact_phone: '+12025550150',
    question: 'იცნობ კარგ სტომატოლოგს?',
    owner_id: '501',
    thread_id: 900,
  };

  it('sends every held question as the card’s own, then rings once', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE evening_cards SET sent_at'))
        return Promise.resolve(rows([{ id: 7, user_id: 171 }]) as never);
      if (sql.includes('UPDATE held_asks h'))
        return Promise.resolve(rows([held, { ...held, id: 4, task_id: 41 }]) as never);
      if (sql.includes('COUNT(*)::int AS n')) return Promise.resolve(rows([{ n: 2 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await sweepEveningCards();

    expect(mockCreateAsk).toHaveBeenCalledTimes(2);
    expect(mockCreateAsk).toHaveBeenCalledWith(
      '501',
      40,
      held.contact_phone,
      held.question,
      undefined,
      900,
      undefined,
      {
        eveningCardId: 7,
      },
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('171', {
      ...eveningCardPush('ka', 2),
      url: EVENING_CARD_URL,
    });
  });

  it('claims a card once, so two sweeps never send it twice', () => {
    const src = readFileSync(join(__dirname, '..', 'eveningCard.service.ts'), 'utf8');
    expect(src).toContain('WHERE sent_at IS NULL AND due_at <= NOW()');
    expect(src).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('rings nobody when every item is already answered', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('UPDATE evening_cards SET sent_at'))
        return Promise.resolve(rows([{ id: 7, user_id: 171 }]) as never);
      if (sql.includes('COUNT(*)::int AS n')) return Promise.resolve(rows([{ n: 0 }]) as never);
      return Promise.resolve(rows([]) as never);
    });

    await sweepEveningCards();

    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('the card on screen', () => {
  it('lists its questions with the three taps in the person’s language', async () => {
    mockQuery
      .mockResolvedValueOnce(
        rows([{ id: 7, due_at: new Date('2026-10-06T15:00:00Z'), snoozes: 0 }]) as never,
      )
      .mockResolvedValueOnce(
        rows([
          { ask_id: 11, ask_thread_id: 902, from_name: 'Giorgi', question: 'q', answered: false },
        ]) as never,
      );

    const card = await currentEveningCard(171);

    expect(card?.id).toBe(7);
    expect(card?.choices).toHaveLength(3);
    expect(card?.items[0].ask_thread_id).toBe(902);
    // The asker is named as the reader saved them (#1918).
    expect(String(mockQuery.mock.calls[1][0])).toContain('"contactId" = ta.to_user_id');
  });

  it('is null when nothing waits', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await currentEveningCard(171)).toBeNull();
  });
});

describe('the one snooze', () => {
  it('brings the whole card back two hours on, for its owner only', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ due_at: new Date('2026-10-06T17:00:00Z') }]) as never);

    const due = await snoozeEveningCard(171, 7);

    expect(due).toEqual(new Date('2026-10-06T17:00:00Z'));
    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('sent_at = NULL');
    expect(String(sql)).toContain('WHERE id = $1 AND user_id = $2 AND sent_at IS NOT NULL');
    expect(params).toEqual([7, 171, 7200]);
  });

  it('refuses a card that is not theirs or not shown', async () => {
    mockQuery.mockResolvedValueOnce(rows([]) as never);
    expect(await snoozeEveningCard(171, 8)).toBeNull();
  });
});

describe('the ask a card sends', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

  it('is not held by the cap again, and does not ring on its own', () => {
    expect(asks).toContain(
      'card === undefined &&\n    receivedToday.rows.length >= MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY',
    );
    expect(asks).toContain('if (card === undefined) {\n    void sendPushNotification');
  });

  it('remembers which card it came on', () => {
    expect(asks).toContain('card?.eveningCardId ?? null');
  });

  it('is never sent by the goal’s own wake as well', () => {
    const held = readFileSync(join(__dirname, '..', 'heldAsks.service.ts'), 'utf8');
    expect(held).toContain('AND evening_card_id IS NULL');
  });
});
