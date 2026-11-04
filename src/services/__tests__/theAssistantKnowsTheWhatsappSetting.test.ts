jest.mock('../whatsappConsent.service', () => ({ __esModule: true, whatsappConsentOf: jest.fn() }));

import { whatsappConsentOf } from '../whatsappConsent.service';
import { myWhatsappSetting, WhatsappSettingState } from '../tools/myWhatsappSetting';

const mockConsent = whatsappConsentOf as jest.MockedFunction<typeof whatsappConsentOf>;

const consent = (
  opted_in: boolean,
  opted_out_at: string | null,
  whatsapp_only = false,
): Awaited<ReturnType<typeof whatsappConsentOf>> => ({
  opted_in,
  opted_in_at: null,
  opted_out_at,
  welcome_sent_at: null,
  whatsapp_only,
});

/** #8813 (tester 82700): the founder asked whether WhatsApp was on; his assistant could not tell. */
describe('#8813: the assistant can read the owner’s WhatsApp choice', () => {
  it('says on, and whether notices go only there', async () => {
    mockConsent.mockResolvedValue(consent(true, null, true));
    expect(await myWhatsappSetting('7')).toEqual({
      whatsapp: WhatsappSettingState.On,
      only_in_whatsapp: true,
    });
  });

  it('tells switched off from never chosen', async () => {
    mockConsent.mockResolvedValue(consent(false, '2026-11-01T00:00:00Z', true));
    expect(await myWhatsappSetting('7')).toEqual({
      whatsapp: WhatsappSettingState.Off,
      only_in_whatsapp: false,
    });
    mockConsent.mockResolvedValue(consent(false, null));
    expect((await myWhatsappSetting('7')) as { whatsapp: string }).toMatchObject({
      whatsapp: WhatsappSettingState.NeverChosen,
    });
  });

  it('says it could not read rather than guessing', async () => {
    mockConsent.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await myWhatsappSetting('7')).toHaveProperty('error');
  });
});
