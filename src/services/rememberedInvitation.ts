import { phoneDigits } from './phone';

/**
 * #8185 (founder, 27 Oct 22:19 Tbilisi): „once someone has an invitation link,
 * no code is ever needed". An old Ally number opened the founder's link, the
 * app sent the link's code when it asked for the SMS, and then lost it before
 * signing in — so the sign-in was refused and he was asked to type the code.
 *
 * The invitation that came with the code request is kept here for its number
 * for half an hour, and the sign-in takes it when the app's own request
 * arrives without one. In memory, because it only has to outlive the minutes
 * between an SMS and its code; a restart in between costs only the fallback.
 */
export interface Invitation {
  readonly referralCode?: string;
  readonly referralPhone?: string;
}

const KEPT_FOR_MS = 30 * 60 * 1000;
/** A ceiling on the map, not an expectation: a flood of requests cannot grow it without end. */
const MOST_KEPT = 5_000;

const kept = new Map<string, { readonly invitation: Invitation; readonly at: number }>();

function carriesAnInvitation(invitation: Invitation): boolean {
  return Boolean(invitation.referralCode?.trim() || invitation.referralPhone?.trim());
}

/** Keeps the invitation a code request carried, for its number. */
export function rememberInvitation(phone: string, invitation: Invitation, now = Date.now()): void {
  const key = phoneDigits(phone);
  if (key === '' || !carriesAnInvitation(invitation)) return;
  if (kept.size >= MOST_KEPT) {
    const oldest = kept.keys().next().value;
    if (oldest !== undefined) kept.delete(oldest);
  }
  kept.set(key, { invitation, at: now });
}

/** The request's own invitation when it has one; else the one its number's code request carried. */
export function invitationFor(phone: string, own: Invitation, now = Date.now()): Invitation {
  if (carriesAnInvitation(own)) return own;
  const entry = kept.get(phoneDigits(phone));
  if (entry === undefined || now - entry.at > KEPT_FOR_MS) return own;
  return entry.invitation;
}

/** Tests only. */
export function forgetInvitationsForTests(): void {
  kept.clear();
}
