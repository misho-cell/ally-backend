jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { requestIdOfCard, requestThreadOf } from '../requestCardThread';

/**
 * 4658 part 3 (box 54617): the founder's incoming introduction request had its
 * own conversation, and its reminder card landed inside an unrelated goal's
 * chat, where a scheduled check happened to run. The card goes to the request.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => mockQuery.mockReset());

describe('the request a card is about', () => {
  it('reads the request id of an introduction card, as a number or as digits', () => {
    expect(requestIdOfCard('intro_request', { request_id: 5717 })).toBe(5717);
    expect(requestIdOfCard('intro_request', { request_id: '5717' })).toBe(5717);
  });

  it('is none for any other card, or a card without a usable id', () => {
    expect(requestIdOfCard('goal_question', { request_id: 5717 })).toBeNull();
    expect(requestIdOfCard('intro_request', {})).toBeNull();
    expect(requestIdOfCard('intro_request', { request_id: 'x1' })).toBeNull();
  });
});

describe('requestThreadOf', () => {
  it('finds the reader’s own incoming-request conversation', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 50288 }], rowCount: 1 } as never);
    await expect(requestThreadOf('501', 5717)).resolves.toBe(50288);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('introduction_request_id = $2 AND type = $3');
    expect(params).toEqual(['501', 5717, 'incoming_request']);
  });

  it('is none when the request has no conversation of the reader’s', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(requestThreadOf('501', 5717)).resolves.toBeNull();
  });
});

describe('card delivery', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const fn = chat.slice(
    chat.indexOf('async function threadForPendingItem'),
    chat.indexOf('async function deliverPendingMessages'),
  );

  it('sends an introduction card to its request’s conversation, and falls back when there is none', () => {
    expect(fn).toContain('const requestId = requestIdOfCard(item.kind, item.payload);');
    expect(fn).toContain('return own ?? fallbackThreadId;');
  });
});
