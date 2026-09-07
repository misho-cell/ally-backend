import { phoneDigits } from './phone';
import { trustedFactCuratorIds } from './contactFacts.service';

/**
 * Who is "ours" — staff, ex-staff, the review numbers and the curators.
 *
 * Ticket 10 Task 9 (4), the founder's ruling of 3 September (D103): "staff and
 * ex-staff are excluded from targets alike." Luka Iashvili, ex-Ally staff, was
 * the first name on the target list because every tester had worked with him
 * — warm to all of us by employment, not by fit — and the founder said there
 * will be more.
 *
 * Three lists, one answer. REVIEW_PHONE is the list auth's OTP bypass already
 * owns (numbers); TRUSTED_FACT_CURATOR_USER_IDS the curators (ids); and
 * STAFF_USER_IDS is new — staff and ex-staff by account id, the founder's to
 * fill. All env, so a name can be added or dropped without a deploy. An empty
 * STAFF_USER_IDS means "nobody beyond the other two lists", not "nobody".
 */

function idList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Staff and ex-staff account ids, plus the curators. */
export function staffUserIds(): ReadonlySet<string> {
  return new Set([...idList(process.env.STAFF_USER_IDS), ...trustedFactCuratorIds()]);
}

/** The review numbers, as digits — the same list auth's OTP bypass reads. */
export function staffPhoneDigits(): ReadonlySet<string> {
  return new Set(idList(process.env.REVIEW_PHONE).map(phoneDigits).filter(Boolean));
}

export function isStaffUser(userId: string | number): boolean {
  return staffUserIds().has(String(userId));
}

export function isStaffPhone(phone: string): boolean {
  return staffPhoneDigits().has(phoneDigits(phone));
}
