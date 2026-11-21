/**
 * Misho, 21 Nov 18:15Z–18:30Z: a second question to a contact waited „until
 * they see the first", which a question delivered in WhatsApp never was; and a
 * goal named after that contact kept every new request naming them, so new
 * goals were refused. A question read or answered in WhatsApp is seen, and the
 * router judges by the need, not by the person named.
 */
const mockQuery = jest.fn();
const mockMarkSeen = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  __esModule: true,
  query: (...a: unknown[]) => mockQuery(...a),
}));
jest.mock('../taskAsks.service', () => ({
  markAsksSeen: (...a: unknown[]) => mockMarkSeen(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { readReceiptsOf, recordReadReceipts, seenInWhatsapp } from '../whatsappSeen.service';

const ASK_THREAD = 84100;
const delivery = (statuses: unknown[]): unknown => ({
  entry: [{ changes: [{ value: { statuses } }] }],
});

beforeEach(() => {
  mockQuery.mockReset();
  mockMarkSeen.mockReset().mockResolvedValue(1);
});

describe('a question read or answered in WhatsApp is seen', () => {
  it('takes only the read receipts of a delivery', () => {
    expect(
      readReceiptsOf(
        delivery([
          { id: 'wamid.A', status: 'delivered' },
          { id: 'wamid.B', status: 'read' },
          { status: 'read' },
        ]),
      ),
    ).toEqual(['wamid.B']);
    expect(readReceiptsOf(null)).toEqual([]);
  });

  it('marks the asks of the read message’s conversation seen, as opening it in the app does', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: 12, thread_id: ASK_THREAD }] });
    await recordReadReceipts(delivery([{ id: 'wamid.B', status: 'read' }]));
    expect(mockQuery.mock.calls[0][1]).toEqual(['wamid.B']);
    expect(String(mockQuery.mock.calls[0][0])).toContain("direction = 'out'");
    expect(typeof mockQuery.mock.calls[0][2]).toBe('number');
    expect(mockMarkSeen).toHaveBeenCalledWith(ASK_THREAD, '12');
  });

  it('marks nothing for a message that is not ours or has no conversation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 12, thread_id: null }] });
    await recordReadReceipts(
      delivery([
        { id: 'wamid.X', status: 'read' },
        { id: 'wamid.Y', status: 'read' },
      ]),
    );
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('never throws when the read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('timeout'));
    await expect(
      recordReadReceipts(delivery([{ id: 'wamid.B', status: 'read' }])),
    ).resolves.toBeUndefined();
    mockMarkSeen.mockRejectedValue(new Error('timeout'));
    await expect(seenInWhatsapp(12, ASK_THREAD)).resolves.toBeUndefined();
  });

  it('counts a line written into the conversation as seen, and reads every delivery’s receipts', () => {
    const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');
    expect(inbound).toContain('await seenInWhatsapp(userId, threadId);');
    expect(inbound).toContain('await recordReadReceipts(payload);');
  });
});

describe('the router judges by the need, not the person', () => {
  it('says so to the small model', () => {
    const router = readFileSync(join(__dirname, '..', 'whatsappRouting.service.ts'), 'utf8');
    expect(router).toContain('Judge by WHAT is needed, never by WHO is named');
    expect(router).toContain('the same person asked about a different need');
  });
});
