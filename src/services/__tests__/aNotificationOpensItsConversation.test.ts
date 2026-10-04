jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import { requesterConversationUrl } from '../threads.service';

/**
 * Board #826 (Giorgi, 4 October): a tap on a notification opened the app and
 * not the conversation. The answer to an introduction request now points at
 * the requester's own conversation.
 */
const mockQuery = query as jest.MockedFunction<typeof query>;
const rows = (list: readonly Record<string, unknown>[]): void => {
  mockQuery.mockResolvedValueOnce({ rows: list, rowCount: list.length } as never);
};

beforeEach(() => mockQuery.mockReset());

describe('the push about an answered introduction', () => {
  it("opens the requester's own conversation", async () => {
    rows([
      { id: 501, user_id: 9, type: 'incoming_request', shared_side: null },
      { id: 777, user_id: 4, type: 'outgoing_request', shared_side: null },
    ]);
    await expect(requesterConversationUrl(12, 4)).resolves.toBe('/chat/777');
  });

  it('opens the shared conversation on the requester side', async () => {
    rows([{ id: 888, user_id: 4, type: 'regular', shared_side: 'requester' }]);
    await expect(requesterConversationUrl(12, 4)).resolves.toBe('/chat/888');
  });

  it('opens the list when no conversation of theirs is found', async () => {
    rows([{ id: 501, user_id: 9, type: 'incoming_request', shared_side: null }]);
    await expect(requesterConversationUrl(12, 4)).resolves.toBe('/chat');
  });
});
