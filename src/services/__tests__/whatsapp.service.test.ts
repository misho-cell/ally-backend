import { sendWhatsAppMessage } from '../whatsapp.service';

const makeResponse = (ok: boolean, status: number, body: object) =>
  ({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendWhatsAppMessage', () => {
  it('calls WhatsApp API with correct payload', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeResponse(true, 200, { messages: [] }));

    await sendWhatsAppMessage('+995555123456', '123456');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('test-phone-id');
    expect(url).toContain('messages');

    const body = JSON.parse((options.body as Buffer).toString('utf8'));
    expect(body.to).toBe('+995555123456');
    expect(body.text.body).toContain('123456');
    expect(body.messaging_product).toBe('whatsapp');
  });

  it('includes Bearer token in Authorization header', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeResponse(true, 200, {}));

    await sendWhatsAppMessage('+995555123456', '654321');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-whatsapp-token');
  });

  it('throws when API returns non-ok response', async () => {
    const errorBody = { error: { message: 'Invalid token' } };
    global.fetch = jest.fn().mockResolvedValue(makeResponse(false, 401, errorBody));

    await expect(sendWhatsAppMessage('+995555123456', '000000')).rejects.toThrow(
      'WhatsApp API error',
    );
  });

  it('throws when fetch itself fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(sendWhatsAppMessage('+995555123456', '000000')).rejects.toThrow('Network error');
  });
});
