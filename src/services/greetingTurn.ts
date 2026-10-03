/**
 * Board #378 — the tester's plate: a plain greeting took 37 seconds to the
 * first word. Measured on 2 October (threads 31092–31094): two model turns —
 * the first wrote ~430 tokens and fetched the contact count and list, the
 * second wrote another ~400–540 — 20 to 26 seconds for „გამარჯობა". Nothing
 * in a greeting needs a tool.
 *
 * So a message that is ONLY a greeting, in a conversation with no open goal,
 * gets one turn with no tools (the tools stay declared, so the cached prompt
 * still hits) and a short ceiling on its length. In a goal's conversation a
 * greeting may be waiting for that goal's news, and it keeps the full turn.
 */
export const GREETING_MAX_TOKENS = 350;

/**
 * Said to the model on the greeting turn itself (tester 1071/1072, 3 October).
 *
 * After prompt v3 went live at 23:40Z, 52 of 54 blank first answers were a
 * bare „გამარჯობა" on this turn: v3 asks for the start-of-conversation reads,
 * the turn has no tools, and the model ended it with nothing. The server's
 * one re-ask then ran a full turn with tools, which is the slow path this
 * turn exists to avoid. The note says what the turn is. It goes at the end of
 * the system prompt, the part that is not cached anyway, so the cached part
 * is unchanged.
 */
export const GREETING_TURN_NOTE =
  '\n\n## This turn\nThe owner only greeted you, and this turn has no tools. ' +
  'Answer the greeting in one or two short sentences in their language, and ask what they need.';

/**
 * The tester's loop, H3 (3 October): on an account with no contacts the
 * greeting answered „what do you need?" and never said that Netai finds
 * people through the owner's own phonebook, which is not in yet. The turn has
 * no tools, so the model cannot see that itself; the server says it.
 */
export const EMPTY_PHONEBOOK_GREETING_NOTE =
  " The owner's phonebook is not in Netai yet: no contacts have been imported. " +
  'In one short sentence, say that Netai finds people through their own contacts ' +
  'and ask them to import their contacts in the app.';

/** The greeting turn's note; an owner with no contacts is also asked to import them. */
export function greetingTurnNote(hasContacts: boolean): string {
  return hasContacts ? GREETING_TURN_NOTE : GREETING_TURN_NOTE + EMPTY_PHONEBOOK_GREETING_NOTE;
}

const GREETING_ONLY_RE =
  /^\s*(?:გამარჯობა|გაგიმარჯოს|სალამი|ჰეი|hi|hello|hey|good (?:morning|afternoon|evening)|привет|здравствуй(?:те)?|hola|buenas)[\s!.,?)😊🙂👋]*$/iu;

export function isBareGreeting(text: string | null | undefined): boolean {
  return typeof text === 'string' && GREETING_ONLY_RE.test(text);
}

/**
 * Said on the one re-ask after a blank first answer (task 695, tester 1076,
 * conversation 31886): the re-ask used to send the same input to the same
 * model, and a second blank followed in 3 seconds. The note goes at the
 * uncached end of the system prompt, like the greeting note, so nothing
 * cached changes.
 */
export const BLANK_RETRY_NOTE =
  '\n\n## This turn\nYour previous attempt at this turn returned nothing. ' +
  "Answer the owner's last message now, in their language; use a tool if the answer needs one.";
