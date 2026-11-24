/**
 * Misho, 24 Nov: „while our answer is on its way, can WhatsApp show the
 * dots?" The person's line is marked read with Meta's typing indicator, shown
 * again every 20 seconds while its answer is owed, for five minutes at most.
 */
const mockFetch = jest.fn();
const mockOwed = jest.fn();
jest.mock('../whatsappReplies.service', () => ({
  whatsappReplyOwed: (...a: unknown[]) => mockOwed(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { showTyping } from '../whatsappChannel.service';
import {
  TYPING_MAX_MS,
  TYPING_REFRESH_MS,
  keepTyping,
  stopTyping,
} from '../whatsappTyping.service';

const sent = (): Record<string, unknown>[] =>
  mockFetch.mock.calls.map((c) => JSON.parse(String((c[1] as { body: Buffer }).body)));

beforeEach(() => {
  jest.useFakeTimers();
  process.env.WHATSAPP_PHONE_ID = 'phone-id';
  process.env.WHATSAPP_TOKEN = 'test';
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  global.fetch = mockFetch as unknown as typeof fetch;
  mockOwed.mockReset().mockReturnValue(true);
});

afterEach(() => {
  stopTyping(7, 1);
  jest.useRealTimers();
});

describe('the dots in WhatsApp', () => {
  it('marks the line read with the typing indicator', async () => {
    await expect(showTyping('wamid.A')).resolves.toBe(true);
    expect(sent()[0]).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.A',
      typing_indicator: { type: 'text' },
    });
  });

  it('never throws, and sends nothing without a message id', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: {} }) });
    await expect(showTyping('wamid.A')).resolves.toBe(false);
    await expect(showTyping('')).resolves.toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows them again while the answer is owed, and stops once it went', () => {
    let clock = 0;
    keepTyping(7, 1, 'wamid.A', () => clock);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    clock += TYPING_REFRESH_MS;
    jest.advanceTimersByTime(TYPING_REFRESH_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    mockOwed.mockReturnValue(false);
    clock += TYPING_REFRESH_MS;
    jest.advanceTimersByTime(TYPING_REFRESH_MS * 3);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops after five minutes whatever happens', () => {
    let clock = 0;
    keepTyping(7, 1, 'wamid.A', () => clock);
    clock = TYPING_MAX_MS;
    jest.advanceTimersByTime(TYPING_REFRESH_MS);
    jest.advanceTimersByTime(TYPING_REFRESH_MS * 5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('starts when a line is posted into its conversation', () => {
    const inbound = readFileSync(join(__dirname, '..', 'whatsappInbound.service.ts'), 'utf8');
    expect(inbound).toContain('keepTyping(userId, threadId, wamid);');
    expect(inbound).toContain(
      'await postLine(userId, message.from, threadId, text, message.wamid);',
    );
  });
});
