const mockSaveServerLine = jest.fn();
const mockPush = jest.fn();
const mockEvent = jest.fn();
jest.mock('../threads.service', () => ({
  __esModule: true,
  getOrCreateDefaultThread: jest.fn().mockResolvedValue(77),
  saveServerLine: (...a: unknown[]) => mockSaveServerLine(...a),
  userLanguage: jest.fn().mockResolvedValue('ka'),
}));
jest.mock('../notification.service', () => ({
  __esModule: true,
  sendPushNotification: (...a: unknown[]) => mockPush(...a),
}));
jest.mock('../productEvents.service', () => ({
  __esModule: true,
  recordProductEvent: (...a: unknown[]) => mockEvent(...a),
}));
jest.mock('../sse.service', () => ({ __esModule: true, emitMessageAppended: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONTACTS_RECEIVED_EVENT,
  CONTACTS_RECEIVED_LINE,
  tellContactsReceived,
} from '../contactsReceivedLine.service';

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveServerLine.mockResolvedValue({ id: 5, content: 'x', createdAt: 'now' });
  mockPush.mockResolvedValue(undefined);
  mockEvent.mockResolvedValue(undefined);
});

/** Misho, 2 Nov: a member's contacts loaded in the background and Netai said nothing. */
describe('the member hears the contacts arrived', () => {
  it('reads one line in the main chat, recorded first, with a push by day', async () => {
    await tellContactsReceived(42, new Date('2026-11-02T10:00:00Z'));
    expect(mockEvent).toHaveBeenCalledWith(42, CONTACTS_RECEIVED_EVENT, { thread_id: 77 });
    expect(mockSaveServerLine).toHaveBeenCalledWith(77, 42, CONTACTS_RECEIVED_LINE.ka);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('gets no push in quiet hours, only the line', async () => {
    // 01:00Z is 05:00 in Tbilisi.
    await tellContactsReceived(42, new Date('2026-11-02T01:00:00Z'));
    expect(mockSaveServerLine).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('is said only after a link upload that saved something', () => {
    const src = readFileSync(join(__dirname, '..', 'contactUploadLinks.service.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function startUploadThroughLink('));
    expect(fn).toContain('if (outcome.imported === 0) return;');
    expect(fn).toContain('await tellContactsReceived(Number(userId))');
  });
});
