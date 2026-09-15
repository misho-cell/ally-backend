/**
 * Ticket 19 [18] — the request that arrived with nobody's buttons.
 *
 * On Lika's iPhone, 14 September, the founder's request to her came folded
 * under a plan's text, beneath the PLAN's two buttons. Whatever she pressed
 * answered the plan; nothing on the screen answered him. Request 1057 is the
 * row behind it and it was still `pending` on 15 September, ten days old.
 *
 * The cause was not the phone. The waiting request reached the screen only as
 * a line in the system prompt — „answer the user first, mention this at the
 * end" — so it was the model's prose, in someone else's message, with no
 * buttons of its own and no id behind them.
 *
 * These tests pin the two halves of the remedy: what the request becomes, and
 * how often a person is handed it.
 */
jest.mock('../../db/postgres/client', () => ({ query: jest.fn(), __esModule: true }));

import { query } from '../../db/postgres/client';
import { introRequestItems, undeliveredRequests } from '../chat.service';
import { renderPendingMessage } from '../pendingMessages';
import type { PendingRequest } from '../introduction.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

const REQUEST_1057: PendingRequest = {
  id: 1057,
  target_name: 'LIST. Lika Osepashvili. Ally. Force',
  message: null,
  requester_name: 'თორნიკე აბულაძე',
  created_at: '2026-09-05T06:41:31.027Z',
  direct: true,
};

beforeEach(() => jest.clearAllMocks());

describe('a waiting request as its own message', () => {
  it('carries the id the buttons will need, and tells the next run what a tap meant', () => {
    const [item] = introRequestItems([REQUEST_1057]);

    expect(item.kind).toBe('intro_request');
    expect(item.payload['request_id']).toBe(1057);
    // The instruction rides invisibly with the message. Without the id in it,
    // a tap is a word with no request attached — which is the old behaviour.
    expect(String(item.payload['instruction'])).toContain('request_id=1057');
    expect(String(item.payload['instruction'])).toContain('respond_to_introduction');
  });

  it('renders end to end into a message the user can actually answer', () => {
    const rendered = renderPendingMessage(introRequestItems([REQUEST_1057])[0], 'ka');

    expect(rendered?.text).toContain('თორნიკე აბულაძე');
    expect(rendered?.ref).toEqual({ kind: 'intro_request', request_id: 1057 });
    expect(rendered?.choices).toHaveLength(3);
  });

  it('scrubs and shortens the other person’s words before they cross accounts', () => {
    const long = 'ა'.repeat(400);
    const [item] = introRequestItems([
      { ...REQUEST_1057, direct: false, message: `დამირეკე 599123456 — ${long}` },
    ]);

    const message = String(item.payload['message']);
    expect(message).not.toContain('599123456');
    expect(message.length).toBeLessThanOrEqual(200);
  });
});

describe('how often the same request is handed to a person', () => {
  function rows(list: unknown[]): { rows: unknown[]; rowCount: number } {
    return { rows: list, rowCount: list.length };
  }

  it('delivers one the user has not been shown', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await undeliveredRequests('160584', [REQUEST_1057])).toEqual([REQUEST_1057]);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql as string).toContain("kind = 'pending'");
    expect(sql as string).toContain("content_json->'ref'->>'kind' = 'intro_request'");
    expect(params as unknown[]).toEqual(['160584', 24]);
  });

  it('holds one already on the screen, so the answer is not asked for twice', async () => {
    mockQuery.mockResolvedValue(rows([{ request_id: '1057' }]) as never);

    expect(await undeliveredRequests('160584', [REQUEST_1057])).toEqual([]);
  });

  it('offers it again after the day is up — a request nobody answered still needs answering', async () => {
    // The cooldown is a day, not a lifetime: 1057 waited ten. What it replaces
    // is a fresh mention appended to every single answer.
    mockQuery.mockResolvedValue(rows([{ request_id: '991' }]) as never);

    expect(await undeliveredRequests('160584', [REQUEST_1057])).toEqual([REQUEST_1057]);
  });

  it('reads nothing when there is nothing waiting', async () => {
    expect(await undeliveredRequests('160584', [])).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('delivers anyway when the history cannot be read', async () => {
    // A duplicate bubble is the old behaviour once more. A swallowed one is a
    // person who cannot answer at all — so the failure leans the other way.
    mockQuery.mockRejectedValue(new Error('timeout') as never);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await undeliveredRequests('160584', [REQUEST_1057])).toEqual([REQUEST_1057]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
