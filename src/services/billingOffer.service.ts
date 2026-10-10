import { getPrice } from './costLedger.service';
import { DEFAULT_TRIAL_DAYS } from './inviteCohorts.service';
import { inviteFreeDays } from './inviteReward.service';

/**
 * Misho, 9 Oct (frontend TO_BACKEND 21:30Z): the pricing page shows both free
 * periods — the card trial and the days an invitation carries. Both numbers
 * live on the server (the env's STRIPE_TRIAL_DAYS, and the invite_free_days
 * setting behind its switch), so the page reads them instead of writing them
 * into its own text, where a change on the dashboard would leave it wrong.
 *
 * Misho, 10 Oct (frontend TO_BACKEND 05:10Z): the plan prices too, from the
 * same rows a month bought with the referral balance is charged from
 * (subscription.price.*, migration 035), so the page and the charge cannot
 * disagree.
 */
type PlanTier = 'pro' | 'enterprise';

export interface BillingOffer {
  readonly card_trial_days: number;
  /** Null while the invitation's free days are switched off. */
  readonly invite_free_days: number | null;
  /** USD a month; null for a tier with no price row, so the page keeps its own. */
  readonly plans: Readonly<Record<PlanTier, number | null>>;
}

async function planPrice(tier: PlanTier): Promise<number | null> {
  const price = await getPrice(`subscription.price.${tier}`);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function billingOffer(): Promise<BillingOffer> {
  const [inviteDays, pro, enterprise] = await Promise.all([
    inviteFreeDays(),
    planPrice('pro'),
    planPrice('enterprise'),
  ]);
  return {
    card_trial_days: DEFAULT_TRIAL_DAYS,
    invite_free_days: inviteDays,
    plans: { pro, enterprise },
  };
}
