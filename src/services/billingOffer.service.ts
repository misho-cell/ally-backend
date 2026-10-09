import { DEFAULT_TRIAL_DAYS } from './inviteCohorts.service';
import { inviteFreeDays } from './inviteReward.service';

/**
 * Misho, 9 Oct (frontend TO_BACKEND 21:30Z): the pricing page shows both free
 * periods — the card trial and the days an invitation carries. Both numbers
 * live on the server (the env's STRIPE_TRIAL_DAYS, and the invite_free_days
 * setting behind its switch), so the page reads them instead of writing them
 * into its own text, where a change on the dashboard would leave it wrong.
 */
export interface BillingOffer {
  readonly card_trial_days: number;
  /** Null while the invitation's free days are switched off. */
  readonly invite_free_days: number | null;
}

export async function billingOffer(): Promise<BillingOffer> {
  return { card_trial_days: DEFAULT_TRIAL_DAYS, invite_free_days: await inviteFreeDays() };
}
