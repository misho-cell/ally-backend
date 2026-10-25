const mockQuery = jest.fn();
jest.mock('../../db/postgres/client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { WelcomeStatus, welcomeInWhatsapp } from '../whatsappWelcome.service';

const USER = 4242;
const fetchMock = jest.fn();

beforeEach(() => {
  mockQuery.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WHATSAPP_CHANNEL_ON = 'true';
  process.env.WHATSAPP_WELCOME_TEMPLATE = 'netai_welcome';
  process.env.WHATSAPP_PHONE_ID = 'phone-id';
  process.env.WHATSAPP_TOKEN = 'token';
});

afterAll(() => {
  delete process.env.WHATSAPP_CHANNEL_ON;
  delete process.env.WHATSAPP_WELCOME_TEMPLATE;
});

/** Misho, 25 Oct (via the frontend): a welcome in WhatsApp when the switch is turned on. */
describe('the WhatsApp welcome', () => {
  it('goes out as the approved template, once, and is recorded', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ recent: false }] })
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000000' }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.1' }] }),
    });
    await expect(welcomeInWhatsapp(USER)).resolves.toBe(WelcomeStatus.Sent);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.template.name).toBe('netai_welcome');
    expect(sent.template.components).toBeUndefined();
    expect(mockQuery.mock.calls[2][0]).toContain('SET welcome_sent_at = NOW()');
    expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO whatsapp_messages');
  });

  it('is not sent again within the repeat window', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ recent: true }] });
    await expect(welcomeInWhatsapp(USER)).resolves.toBe(WelcomeStatus.AlreadySent);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is never sent while the channel is off or without a template', async () => {
    delete process.env.WHATSAPP_WELCOME_TEMPLATE;
    await expect(welcomeInWhatsapp(USER)).resolves.toBe(WelcomeStatus.NoTemplate);
    process.env.WHATSAPP_CHANNEL_ON = 'false';
    await expect(welcomeInWhatsapp(USER)).resolves.toBe(WelcomeStatus.ChannelOff);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it failed, without marking it sent, when WhatsApp refuses', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ recent: false }] })
      .mockResolvedValueOnce({ rows: [{ phone: '+995500000000' }] });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'template not approved' } }),
    });
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(welcomeInWhatsapp(USER)).resolves.toBe(WelcomeStatus.Failed);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('is sent only when the profile switch goes from off to on', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'profile.routes.ts'),
      'utf8',
    );
    expect(routes).toContain('const turnedOn = optedIn && !before.opted_in;');
    expect(routes).toContain('welcome_status: welcome');
  });
});
