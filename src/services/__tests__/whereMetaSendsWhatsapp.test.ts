import { subscribedAppNames, webhookIsOurs } from '../whatsappWebhookState.service';

describe('where Meta sends an inbound WhatsApp message', () => {
  it('names the apps the business account is subscribed to', () => {
    const data = [
      { whatsapp_business_api_data: { name: 'Netai', id: 'x' } },
      { whatsapp_business_api_data: {} },
    ];
    expect(subscribedAppNames(data)).toEqual(['Netai']);
  });

  it('reads no apps from an empty or odd answer', () => {
    expect(subscribedAppNames(undefined)).toEqual([]);
    expect(subscribedAppNames({})).toEqual([]);
  });

  it('knows our callback URL, with or without a trailing slash', () => {
    expect(
      webhookIsOurs({
        webhook_configuration: { application: 'https://api.netai.guru/webhooks/whatsapp/' },
      }),
    ).toBe(true);
  });

  it('says no for another URL', () => {
    expect(
      webhookIsOurs({ webhook_configuration: { application: 'https://example.com/hook' } }),
    ).toBe(false);
  });

  it('says nothing when Meta holds no URL', () => {
    expect(webhookIsOurs({ id: '1' })).toBeNull();
  });
});
