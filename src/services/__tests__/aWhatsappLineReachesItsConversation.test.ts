const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));
const mockReply = jest.fn();
jest.mock('../whatsappChannel.service', () => ({
  ...jest.requireActual('../whatsappChannel.service'),
  replyInWhatsapp: (...args: unknown[]) => mockReply(...args),
}));

import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { inboundMessagesOf, signatureIsValid } from '../whatsappInbound.service';
import {
  choiceByNumber,
  deliverOwedWhatsappReply,
  oweWhatsappReply,
  replyText,
} from '../whatsappReplies.service';

const USER = 4242;
const THREAD = 777;
const PHONE = '995500000000';
const NOW = 1_700_000_000_000;
const SECRET = 'app-secret-for-tests';

beforeEach(() => {
  mockQuery.mockReset();
  mockReply.mockReset().mockResolvedValue(undefined);
  process.env.WHATSAPP_APP_SECRET = SECRET;
});

function delivery(message: object): object {
  return { entry: [{ changes: [{ value: { messages: [message] } }] }] };
}

describe('a WhatsApp delivery', () => {
  it('is taken only with the app secret’s signature over the raw body', () => {
    const raw = Buffer.from('{"entry":[]}');
    const good = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
    expect(signatureIsValid(raw, good)).toBe(true);
    expect(signatureIsValid(Buffer.from('{"entry":[1]}'), good)).toBe(false);
    expect(signatureIsValid(raw, undefined)).toBe(false);
    delete process.env.WHATSAPP_APP_SECRET;
    expect(signatureIsValid(raw, good)).toBe(false);
  });

  it('yields the typed line, a tapped button, and what it replied to', () => {
    expect(
      inboundMessagesOf(
        delivery({ from: PHONE, id: 'w1', type: 'text', text: { body: ' გამარჯობა ' } }),
      ),
    ).toEqual([{ from: PHONE, wamid: 'w1', text: 'გამარჯობა', replyTo: null }]);
    expect(
      inboundMessagesOf(
        delivery({
          from: PHONE,
          id: 'w2',
          type: 'interactive',
          interactive: { button_reply: { title: 'კი' } },
          context: { id: 'ours' },
        }),
      ),
    ).toEqual([{ from: PHONE, wamid: 'w2', text: 'კი', replyTo: 'ours' }]);
  });

  it('leaves out statuses, pictures without text and nonsense', () => {
    expect(inboundMessagesOf({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual(
      [],
    );
    expect(inboundMessagesOf(delivery({ from: PHONE, id: 'w3', type: 'image' }))).toEqual([]);
    expect(inboundMessagesOf(null)).toEqual([]);
  });

  it('is verified, answered at once and handled afterwards', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'webhooks.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("webhooksRouter.get('/whatsapp'");
    expect(routes).toContain('process.env.WHATSAPP_VERIFY_TOKEN');
    expect(routes).toContain("req.headers['x-hub-signature-256']");
    expect(
      routes.indexOf('res.status(200).json({ success: true });\n  void handleWhatsappWebhook'),
    ).toBeGreaterThan(0);
  });
});

describe('the answer owed in WhatsApp', () => {
  it('goes back once, with short choices as buttons', async () => {
    oweWhatsappReply(USER, THREAD, PHONE, NOW);
    await deliverOwedWhatsappReply(USER, THREAD, 'რომელი?', ['კი', 'არა'], NOW + 1_000);
    expect(mockReply).toHaveBeenCalledWith(USER, PHONE, 'რომელი?', THREAD, ['კი', 'არა']);
    await deliverOwedWhatsappReply(USER, THREAD, 'again', [], NOW + 2_000);
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  it('numbers choices that cannot be buttons, and a typed number picks one', async () => {
    const long = ['first choice that is long', 'second choice that is long'];
    oweWhatsappReply(USER, THREAD, PHONE, NOW);
    await deliverOwedWhatsappReply(USER, THREAD, 'which', long, NOW);
    expect(mockReply.mock.calls[0][2]).toBe(replyText('which', long, false));
    expect(choiceByNumber(USER, '2')).toBe(long[1]);
    expect(choiceByNumber(USER, '9')).toBe('9');
    expect(choiceByNumber(USER, '2 კაცი')).toBe('2 კაცი');
  });

  it('is not sent for a conversation nobody asked about from WhatsApp, or too late', async () => {
    await deliverOwedWhatsappReply(USER, THREAD + 1, 'hi', [], NOW);
    oweWhatsappReply(USER, THREAD, PHONE, NOW);
    await deliverOwedWhatsappReply(USER, THREAD, 'hi', [], NOW + 11 * 60_000);
    expect(mockReply).not.toHaveBeenCalled();
  });

  it('is the scrubbed answer the app shows, and is not also mirrored as a notice', () => {
    const sse = readFileSync(join(__dirname, '..', 'sse.service.ts'), 'utf8');
    const notify = readFileSync(join(__dirname, '..', 'notification.service.ts'), 'utf8');
    expect(sse).toContain('void deliverOwedWhatsappReply(Number(userId), threadId, safe.reply');
    expect(notify).toContain('options.askedFrom === WHATSAPP_DEVICE ||');
  });
});
