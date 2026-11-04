import { whatsappConsentOf } from '../whatsappConsent.service';

/**
 * #8813 (the founder on WhatsApp, tester 82700): he asked whether his messages
 * were switched on in WhatsApp, and his assistant had no way to know. It reads
 * the same choice the profile screen shows; the owner changes it there.
 */
export const GET_MY_WHATSAPP_SETTING_DESCRIPTION =
  'The owner asks whether Netai writes to them in WhatsApp, or whether they get notices only ' +
  'there → call this and say it plainly. It is the same choice the profile screen shows; the ' +
  'owner switches it there (Profile → WhatsApp), never through you.';

export enum WhatsappSettingState {
  On = 'on',
  /** They switched it off (in the profile or with STOP in WhatsApp). */
  Off = 'off',
  /** They have never chosen. */
  NeverChosen = 'never_chosen',
}

export interface WhatsappSettingAnswer {
  readonly whatsapp: WhatsappSettingState;
  /** Notices go to WhatsApp only, not to the app as well. */
  readonly only_in_whatsapp: boolean;
}

export interface WhatsappSettingFailure {
  readonly error: string;
}

const NOT_READ =
  'The WhatsApp setting could not be read just now. Say so and point the owner to Profile → WhatsApp.';

function stateOf(optedIn: boolean, optedOutAt: string | null): WhatsappSettingState {
  if (optedIn) return WhatsappSettingState.On;
  return optedOutAt === null ? WhatsappSettingState.NeverChosen : WhatsappSettingState.Off;
}

export async function myWhatsappSetting(
  userId: string,
): Promise<WhatsappSettingAnswer | WhatsappSettingFailure> {
  try {
    const consent = await whatsappConsentOf(Number(userId));
    return {
      whatsapp: stateOf(consent.opted_in, consent.opted_out_at),
      only_in_whatsapp: consent.opted_in && consent.whatsapp_only,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[whatsapp] setting of ${userId} not read:`, (err as Error).message);
    return { error: NOT_READ };
  }
}
