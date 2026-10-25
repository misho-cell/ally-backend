const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { ConsentSource, hasWhatsappConsent, setWhatsappConsent } from '../whatsappConsent.service';
import {
  WhatsAppOutcome,
  asReplyButtons,
  asTemplateParameter,
  tellInWhatsapp,
} from '../whatsappChannel.service';
import { mirrorToWhatsapp, threadOfUrl, whatsappText } from '../whatsappMirror.service';

const USER = 4242;

beforeEach(() => {
  mockQuery.mockReset();
  delete process.env.WHATSAPP_CHANNEL_ON;
});

/** Misho, 25 Oct: Netai's messages in WhatsApp, only for a person who chose it. */
describe('the WhatsApp choice', () => {
  it('is recorded with where it was made', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ opted_in: true }] });
    await setWhatsappConsent(USER, true, ConsentSource.Profile);
    expect(mockQuery.mock.calls[0][0]).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(mockQuery.mock.calls[0][1]).toEqual([USER, true, 'profile']);
  });

  it('is a no for a person who never chose, and when it cannot be read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(hasWhatsappConsent(USER)).resolves.toBe(false);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    await expect(hasWhatsappConsent(USER)).resolves.toBe(false);
  });

  it('sends nothing while the switch is off, without reading anything', async () => {
    await expect(tellInWhatsapp(USER, 'hi', null)).resolves.toBe(WhatsAppOutcome.Off);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('sends nothing to a person who has not chosen it', async () => {
    process.env.WHATSAPP_CHANNEL_ON = 'true';
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(tellInWhatsapp(USER, 'hi', null)).resolves.toBe(WhatsAppOutcome.NoConsent);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('is a JSON boolean on the profile route, behind the login', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'profile.routes.ts'),
      'utf8',
    );
    expect(routes).toContain(
      "body('opted_in').custom((value: unknown) => typeof value === 'boolean')",
    );
    expect(routes).toContain('ConsentSource.Profile');
  });
});

describe("WhatsApp's own limits", () => {
  it('gives a template one line', () => {
    expect(asTemplateParameter('a\n\nb\tc')).toBe('a · b c');
    expect(asTemplateParameter('x'.repeat(2000)).length).toBe(1000);
  });

  it('makes buttons only of at most three short choices', () => {
    expect(asReplyButtons(['კი', 'არა'])).toEqual(['კი', 'არა']);
    expect(asReplyButtons(['a', 'b', 'c', 'd'])).toBeNull();
    expect(asReplyButtons(['a choice far longer than twenty'])).toBeNull();
    expect(asReplyButtons([])).toBeNull();
  });
});

describe('a notice in WhatsApp', () => {
  it('carries the link that opens it in Netai, and its conversation', () => {
    const notice = { title: 'Netai', body: 'პასუხი მზადაა', url: '/chat/12' };
    expect(whatsappText(notice)).toBe('Netai\nპასუხი მზადაა\nhttps://www.netai.guru/chat/12');
    expect(threadOfUrl(notice.url)).toBe(12);
    expect(threadOfUrl('/people')).toBeNull();
  });

  it('is not sent while the person reads Netai', async () => {
    process.env.WHATSAPP_CHANNEL_ON = 'true';
    await mirrorToWhatsapp(USER, { title: 't', body: 'b' }, true);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
