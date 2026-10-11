import { readFileSync } from 'fs';
import { join } from 'path';
import { RECOMMENDED_RELAY_ON, recommendedRelayLine } from '../recommendedRelay';

/** 3731 (box 52207): the recommended notary was asked „do you know a notary?", and not told who recommended her. */
const RELAY = { helper: 'ნინო', asker: 'გიორგი', need: 'მჭირდება ნოტარიუსი' };

describe('recommendedRelayLine', () => {
  it('names the helper after the named tap, and quotes the goal', () => {
    expect(recommendedRelayLine('ka', RELAY, true)).toBe(
      'ნინომ შენ გირჩია. გიორგი ეძებს დახმარებას: „მჭირდება ნოტარიუსი“. შეძლებ დახმარებას?',
    );
  });

  it('says only that somebody recommended her after the unnamed tap', () => {
    expect(recommendedRelayLine('ka', { ...RELAY, helper: null }, true)).toBe(
      'შენ გირჩიეს, როგორც ადამიანი, ვინც შეიძლება დაეხმაროს. გიორგი ეძებს დახმარებას: „მჭირდება ნოტარიუსი“. შეძლებ დახმარებას?',
    );
  });

  it('keeps the 1696 line where nothing approved exists: other languages, no goal words, no asker', () => {
    expect(recommendedRelayLine('en', RELAY, true)).toBeNull();
    expect(recommendedRelayLine('ka', { ...RELAY, need: ' ' }, true)).toBeNull();
    expect(recommendedRelayLine('ka', { ...RELAY, asker: '' }, true)).toBeNull();
  });

  it('is OFF until Misho approves the lines (NIGHT_QUESTIONS BN)', () => {
    expect(RECOMMENDED_RELAY_ON).toBe(false);
    expect(recommendedRelayLine('ka', RELAY)).toBeNull();
  });

  it('is used only for a recommendation, with the names the referred person knows', () => {
    const settle = readFileSync(join(__dirname, '..', 'askReferralSettle.service.ts'), 'utf8');
    expect(settle).toContain("if (!recommendsSomebody(offer.offer_line ?? '')) return null;");
    expect(settle).toContain(
      'helper: tap === ReferralTap.Named ? offer.helper_as_referral_knows : null,',
    );
    expect(settle).toContain(
      'referralReads(offer, tap, language) ?? relayedQuestion(language, asker, offer.question),',
    );
  });
});
