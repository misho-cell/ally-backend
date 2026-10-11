import { geoName } from './georgianCase';
import { RunLanguage } from './runLanguage';

/**
 * 3731 (box 52207, 0 of 2 on 0129): after the helper tapped „კი, და უთხარი,
 * რომ მე გირჩიე", the recommended notary got the 1696 line „{asker}-ისთვის
 * გეკითხები: {the question the helper was asked}" — „do you know a notary?",
 * sent to a notary, and never a word that the helper had recommended her. A
 * person recommended to help is told who recommended her (or that somebody
 * did), who needs what, and asked whether she can help.
 *
 * ⚠️ USER-VISIBLE (D44), NOT YET APPROVED — NIGHT_QUESTIONS BN. OFF until
 * Misho's yes on the exact lines; only Georgian was drafted, so any other
 * language keeps the 1696 line.
 */
export const RECOMMENDED_RELAY_ON = false;

export interface RecommendedRelay {
  /** The helper, as the recommended person knows them; null when the helper chose no name. */
  readonly helper: string | null;
  readonly asker: string;
  /** The goal's own words, as its owner set them (often first person, so they are quoted). */
  readonly need: string;
}

/** The Georgian line the recommended person reads; null where no approved line exists. */
export function recommendedRelayLine(
  language: RunLanguage,
  relay: RecommendedRelay,
  on: boolean = RECOMMENDED_RELAY_ON,
): string | null {
  const need = relay.need.trim();
  if (!on || language !== 'ka' || need === '' || relay.asker.trim() === '') return null;
  const opening =
    relay.helper === null || relay.helper.trim() === ''
      ? 'შენ გირჩიეს, როგორც ადამიანი, ვინც შეიძლება დაეხმაროს.'
      : `${geoName(relay.helper, 'erg')} შენ გირჩია.`;
  return `${opening} ${relay.asker.trim()} ეძებს დახმარებას: „${need}“. შეძლებ დახმარებას?`;
}
