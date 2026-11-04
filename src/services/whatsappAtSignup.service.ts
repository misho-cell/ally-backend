import { verifyToken } from './auth.service';
import { ConsentSource, setWhatsappConsent } from './whatsappConsent.service';
import { welcomeInWhatsapp } from './whatsappWelcome.service';

/**
 * #8713 part 3 (Tornike, 4 Nov; Misho the same day, on the recommendation of a
 * clear, pre-ticked line on the sign-up form that can be unticked): a new
 * member who leaves the box ticked has chosen WhatsApp — Meta's opt-in is
 * that line. Their choice is recorded as made at sign-up, and Netai's welcome
 * goes as it does when the switch is turned on in the profile. Never throws:
 * a failure here must not undo a registration.
 */
export async function optInAtSignup(token: string): Promise<void> {
  try {
    const userId = Number(verifyToken(token).userId);
    await setWhatsappConsent(userId, true, ConsentSource.Signup);
    await welcomeInWhatsapp(userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp] sign-up opt-in not recorded:', (err as Error).message);
  }
}
