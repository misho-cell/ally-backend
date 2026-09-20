/**
 * Accounts the per-person receiving caps do not protect.
 *
 * THIS IS A TEST HARNESS, NOT A PRODUCT FEATURE, and the shape is deliberate.
 *
 * The seat's 336, 20 September: every one of the five fictional test accounts
 * is sitting at its two-received-questions-in-24-hours limit, so nothing can
 * be sent between them. About half of everything tried today never left, row
 * 205's first run had no first message to guard a second against, and the
 * introduction channel cannot be exercised AT ALL — running the founder's four
 * cases means being the mediator, and no request can reach a full mailbox.
 *
 * They asked for the cap to be raised „for the six test accounts only". IT IS
 * NOT PER-ACCOUNT. Both caps are environment variables read once at boot:
 *
 *   MAX_ASKS_RECEIVED_PER_PERSON_PER_DAY = 2   new questions from everybody
 *   RELAY_MESSAGES_PER_PERSON_PER_DAY    = 4   messages inside one live exchange
 *
 * so raising either raises it for every real person in the base at the same
 * time. That is what the cap exists to prevent and it is not a thing to do for
 * a test. This list is the narrow version of the same request: named accounts
 * stop being protected, and nobody else's protection moves.
 *
 * THE EXEMPTION IS KEYED ON THE RECEIVER, because the receiver is who the cap
 * protects. A real person asking a test account is fine; a test account asking
 * a real person is capped exactly as before.
 *
 * EMPTY BY DEFAULT AND INERT UNTIL SOMEBODY SETS IT. The value is an
 * operational decision and not mine: it is written up in
 * docs/ADMIN_WRITE_OPERATIONS.md and waits for Misho's word.
 */

const RAW = process.env.ASK_CAP_EXEMPT_USER_IDS ?? '';

const EXEMPT: ReadonlySet<string> = new Set(
  RAW.split(',')
    .map((id) => id.trim())
    .filter((id) => id !== ''),
);

if (EXEMPT.size > 0) {
  // Loud, once, at boot. A protection switched off for named accounts must be
  // visible in the log of every process that has it off — the failure mode of
  // a list like this is that it outlives the test nobody remembers running.
  // eslint-disable-next-line no-console
  console.warn(
    `[ask-caps] receiving caps are OFF for ${EXEMPT.size} account(s): ${[...EXEMPT].join(', ')} — ` +
      'test accounts only. If a real person is on this list, take them off.',
  );
}

/**
 * Does this person's phone still get the per-day protection?
 *
 * Called at both caps. Returns false for everybody unless the list is set.
 */
export function receivingCapsAreOff(toUserId: number | string): boolean {
  return EXEMPT.has(String(toUserId));
}

/** For the write-up and for anybody reading the admin screens. */
export function exemptAccountIds(): readonly string[] {
  return [...EXEMPT];
}
