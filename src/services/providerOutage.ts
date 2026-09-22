/**
 * Ticket 20 row 217 — „please try again" into a wall.
 *
 * 18 September, 20:29 to past 21:12. The Anthropic credit balance ran out and
 * every run in the product died on its FIRST model call:
 *
 *   400 invalid_request_error
 *   „Your credit balance is too low to access the Anthropic API."
 *
 * Six of the seat's runs, three to four seconds each, zero tool calls, the
 * token balance unmoved at 979,214 through all of them. „What is 2 plus 2"
 * failed exactly like the rest, which is what proved it was not the question.
 *
 * And every single one told the owner:
 *
 *   „Something went wrong on our side and the answer did not finish.
 *    Please try again."
 *
 * That sentence is true about the first half and actively wrong about the
 * second. Retrying cannot work — nothing the owner does will put credit on an
 * account they have never heard of — so the product spent forty-five minutes
 * inviting people to bang on a locked door, and a person who did would
 * conclude the product is broken rather than paused.
 *
 * So this module answers one question: did the MODEL PROVIDER refuse us, as
 * opposed to something failing that a retry could get past.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never tells the owner why. „Your credit
 * balance is too low" is our billing and none of their business, and a person
 * reading that about a product they pay for learns something about us that is
 * not theirs to carry. They are told that the service is unavailable and that
 * it is not their doing, which is the whole of what is useful to them.
 */

/** Statuses that mean the provider will not serve us, whatever we send. */
const PROVIDER_REFUSAL_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503, 529]);

/**
 * The one 400 that is not our bug.
 *
 * A 400 from this API normally means WE sent something malformed, and that is
 * a defect to fix rather than an outage to wait out — so 400 is not in the set
 * above. Billing is the exception: the request was fine and the account was
 * not. Matched on the provider's own phrase, which is a vendor string and may
 * change; when it does, this stops recognising the case and the owner gets the
 * old „try again" back. That is the right way for it to fail.
 */
const BILLING_REFUSAL = /credit balance is too low|billing|purchase credits|quota/i;

interface MaybeApiError {
  status?: unknown;
  message?: unknown;
}

/**
 * Did the model provider refuse this request for a reason the owner cannot
 * affect and a retry cannot get past?
 *
 * Conservative by construction: anything it does not recognise is NOT a
 * provider refusal, and the caller keeps the ordinary failure line. Telling
 * somebody „the service is unavailable" when their run simply crashed would
 * hide a real defect behind a shrug.
 */
export function isProviderRefusal(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const { status, message } = error as MaybeApiError;
  if (typeof status === 'number' && PROVIDER_REFUSAL_STATUSES.has(status)) return true;
  if (status === 400 && typeof message === 'string' && BILLING_REFUSAL.test(message)) return true;
  return false;
}

/**
 * WHAT the provider said, for the log — 22 September, during an outage I could
 * not diagnose because of this gap.
 *
 * From 12:04 every run in the product died in 0.2-0.4 seconds with no usage
 * recorded at all, on four different accounts. The container said, ten times:
 *
 *   [provider] run <id> thread <id>: the model provider refused the request
 *
 * and not ONE of those lines says which refusal it was. „A record that says
 * something happened and not what" is the fault this codebase keeps finding,
 * and here it sat in the one line anybody reads while people are staring at an
 * error.
 *
 * IT MATTERS BECAUSE THE STATUSES ARE NOT ONE THING. 401/402/403 is an account
 * that will not be served until somebody pays or fixes a key — no retry will
 * ever pass. 429 and 529 are load, and the next minute may be fine. The
 * owner-facing line says „trying again now will not help" for all of them, and
 * for the transient ones that is false. Knowing which is the difference
 * between checking the billing page and waiting five minutes.
 *
 * THE MESSAGE IS CLIPPED AND NOT REDACTED, deliberately: a provider's error
 * text is its own words about our account, not anybody's personal data, and
 * the one thing that must not appear — a key — is not in it. It is short
 * because a stack of vendor JSON in a log line is how the useful part gets
 * scrolled past.
 */
const MAX_REFUSAL_CHARS = 200;

export function describeProviderRefusal(error: unknown): string {
  if (error === null || typeof error !== 'object') return 'unrecognised';
  const { status, message } = error as MaybeApiError;
  const code = typeof status === 'number' ? String(status) : 'no status';
  const said = typeof message === 'string' ? message.trim().slice(0, MAX_REFUSAL_CHARS) : '';
  /**
   * The two families named, because the owner-facing sentence is right for one
   * and wrong for the other and the reader should not have to remember which
   * codes are which.
   */
  const family =
    typeof status === 'number' && [401, 402, 403].includes(status)
      ? ' — ACCOUNT: no retry will pass until this is fixed (credit or key)'
      : typeof status === 'number' && [429, 529, 500, 502, 503].includes(status)
        ? ' — LOAD: this one may pass on its own, and the owner was told it will not'
        : '';
  return said === '' ? `status ${code}${family}` : `status ${code}${family}: ${said}`;
}
