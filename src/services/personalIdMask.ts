/**
 * #8618 (DR5, the tester's whole picture, item 9): a member pasted a list of
 * people with their 11-digit personal ID numbers, and the numbers were kept in
 * the conversation and read by the model. Netai never needs a personal ID, so
 * one is hidden before the owner's words are stored or sent to the model.
 *
 * An 11-digit run is a personal ID when it stands alone: not part of a longer
 * number or a word or address, and not written as a phone („+" in front).
 * Georgian phones are 9 digits, or 12 with the country code, so they never
 * match.
 */
export const PERSONAL_ID_MASK = '[პირადი ნომერი დამალულია]';

const PERSONAL_ID_RE = /(?<![+\w/.-])\d{11}(?![\w/])/gu;

/** The text with every standalone 11-digit personal ID number hidden. */
export function maskPersonalIds(text: string): string {
  return text.replace(PERSONAL_ID_RE, PERSONAL_ID_MASK);
}
