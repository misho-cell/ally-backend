/**
 * #8528 (the tester's 81216 and 81314, case 61): the owner saved a member as
 * „[label]" and asked who that is; the reply said „on Netai the account's name
 * is [registered name]", in 2 of 3 runs, although the tool note allows the
 * registered spelling only when the owner asks how the name is spelled. The
 * tester's word: the registered name must not reach the model at all when the
 * owner did not ask about the name.
 *
 * #1355 (Tornike, 5 Oct) still holds: asked „what is his surname exactly", the
 * model needs the member's own spelling. So the search keeps `registered_name`
 * only when the owner's line in this run asks about the name or its spelling.
 */
const ASKS_ABOUT_THE_NAME_RE =
  /გვარ|სახელ|ჰქვია|იწერება|spell|surname|last\s*name|first\s*name|full\s*name|\bname\b|фамили|имя|зовут|пишется/iu;

const REGISTERED_NAME_KEY = 'registered_name';

/** Does the owner's line ask what a person's name is, or how it is spelled? */
export function asksAboutTheName(ownerLine: string): boolean {
  return ASKS_ABOUT_THE_NAME_RE.test(ownerLine);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutRegisteredName(row: unknown): unknown {
  if (!isRecord(row) || !(REGISTERED_NAME_KEY in row)) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== REGISTERED_NAME_KEY));
}

/** A name search's result as the model may see it for this owner line. */
export function registeredNameOnlyWhenAsked<T>(result: T, ownerLine: string): T {
  if (asksAboutTheName(ownerLine) || !isRecord(result) || !Array.isArray(result.results)) {
    return result;
  }
  return { ...result, results: result.results.map(withoutRegisteredName) };
}
