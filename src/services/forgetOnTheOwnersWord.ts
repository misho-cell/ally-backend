/**
 * #8521 (the tester's 80752 item 7, case 109): „დაივიწყე ეს ფაქტი სალომეზე" was
 * answered „ადასტურებ …?" and nothing was deleted — the tool refuses a delete
 * that is not confirmed, and the owner's own order to forget did not count as
 * the confirmation. An owner's latest line that itself says forget, delete or
 * erase is that confirmation; a line that says not to is not.
 */
const FORGET_ASK_RE =
  /((?<!\p{L})(?:დაივიწყე|დაივიწყო|წაშალე|წაშალო|ამოშალე)(?!\p{L}))|(\b(?:forget|delete|erase|remove)\b)|((?<!\p{L})(?:забудь|удали|сотри|olvida|borra|elimina)(?!\p{L}))/iu;

const FORGET_NEGATED_RE =
  /((?<!\p{L})(?:ნუ|არ)\s+(?:დაივიწყ|წაშალ|ამოშალ))|(\b(?:don'?t|do not|never)\s+(?:forget|delete|erase|remove)\b)|((?<!\p{L})не\s+(?:забывай|удаляй|стирай))|((?<!\p{L})no\s+(?:olvides|borres|elimines))/iu;

/** A preview or a question is not an order: „წავშალო?" asks, it does not tell. */
const ENDS_IN_QUESTION_RE = /[?？]\s*$/u;

export function ownerLineOrdersTheForget(line: string | undefined): boolean {
  if (line === undefined) return false;
  const text = line.trim();
  if (text === '' || ENDS_IN_QUESTION_RE.test(text)) return false;
  return FORGET_ASK_RE.test(text) && !FORGET_NEGATED_RE.test(text);
}
