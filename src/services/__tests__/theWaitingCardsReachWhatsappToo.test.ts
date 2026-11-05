const mockReply = jest.fn();
jest.mock('../whatsappChannel.service', () => ({
  ...jest.requireActual('../whatsappChannel.service'),
  replyInWhatsapp: (...args: unknown[]) => mockReply(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  addCardToOwedReply,
  deliverOwedWhatsappReply,
  oweWhatsappReply,
} from '../whatsappReplies.service';

const USER = 5151;
const THREAD = 888;
const PHONE = '995500000001';
const NOW = 1_700_000_000_000;

beforeEach(() => mockReply.mockReset().mockResolvedValue(undefined));

/** #8748: „13 unanswered + 1 introduction" on WhatsApp; the app's cards never went there. */
describe('#8748: the server’s waiting cards reach WhatsApp too', () => {
  it('sends the cards under the answer, as text', async () => {
    oweWhatsappReply(USER, THREAD, PHONE, NOW);
    expect(addCardToOwedReply(USER, THREAD, 'გელოდება 2 კითხვა.')).toBe(true);
    await deliverOwedWhatsappReply(USER, THREAD, 'აი, რა არის ახალი.', [], NOW + 1_000);
    expect(mockReply).toHaveBeenCalledWith(
      USER,
      PHONE,
      'აი, რა არის ახალი.\n\nგელოდება 2 კითხვა.',
      THREAD,
      null,
    );
  });

  it('adds nothing when no answer is owed on WhatsApp', () => {
    expect(addCardToOwedReply(USER, THREAD + 1, 'გელოდება 2 კითხვა.')).toBe(false);
  });

  it('is wired where each card is saved', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toMatch(
      /await savePendingMessage\(userId, target, runId, text, choices, rendered\);\s+addCardToOwedReply\(Number\(userId\), threadId, text\);/,
    );
  });
});
