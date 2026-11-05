/**
 * #8528 (the tester's 81216 and 81314, case 61): the owner saved a member as
 * „[label]" and asked who that is; the reply said „on Netai the account's name
 * is [registered name]", in 2 of 3 runs, although the tool note allows the
 * registered spelling only when the owner asks how the name is spelled. The
 * tester's word: the registered name must not reach the model at all when the
 * owner did not ask about the name.
 *
 * #1355 (Tornike, 5 Oct) still holds: asked „what is his surname exactly", the
 * model needs the member's own spelling.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. Whether the owner is
 * asking about the name is the model's reading, said in the search's own
 * `about_the_name` argument; the server keeps `registered_name` only then.
 */
const REGISTERED_NAME_KEY = 'registered_name';

export const ABOUT_THE_NAME_FIELD = {
  type: 'boolean',
  description:
    'true only when the owner asks how this person’s name is spelled or what it is exactly — ' +
    'then a member’s own registered spelling comes back as `registered_name`. Otherwise false.',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutRegisteredName(row: unknown): unknown {
  if (!isRecord(row) || !(REGISTERED_NAME_KEY in row)) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== REGISTERED_NAME_KEY));
}

/** The search result, without `registered_name` unless the run said the owner asks about the name. */
export function registeredNameOnlyWhenAsked<T>(result: T, aboutTheName: unknown): T {
  if (aboutTheName === true || !isRecord(result) || !Array.isArray(result.results)) {
    return result;
  }
  return { ...result, results: result.results.map(withoutRegisteredName) };
}
