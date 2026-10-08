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

// The tester's 1114 (34593, 34597): „გამარჯობა, როგორ ხარ?" and „დილა მშვიდობისა"
// are greetings too, and both ran a full goal turn.
const GREETING_ONLY_RE =
  /^\s*(?:გამარჯობა|გაგიმარჯოს|სალამი|ჰეი|(?:დილა|საღამო)\s+მშვიდობისა|hi|hello|hey|good (?:morning|afternoon|evening)|привет|здравствуй(?:те)?|доброе утро|hola|buenas)(?:[\s,!.]+(?:როგორ\s+ხარ|how\s+are\s+you|как\s+дела|qué\s+tal))?[\s!.,?)😊🙂👋]*$/iu;

/**
 * 3202 (Ninia's phone, 8 Oct 07:58Z, thread 44629): she typed „გამარჯობა with a
 * Georgian opening quote in front. It was not read as a greeting, so the run held
 * every tool, called check_my_inbox, and the server listed her ten waiting goals
 * under the hello. Quote marks around the whole line are not words.
 */
const WRAPPING_QUOTES_RE = /^[\s„“”"«»'‘’‚‛]+|[\s„“”"«»'‘’‚‛]+$/gu;

export function unquoted(text: string): string {
  return text.replace(WRAPPING_QUOTES_RE, '');
}

export function isBareGreeting(text: string | null | undefined): boolean {
  return typeof text === 'string' && GREETING_ONLY_RE.test(unquoted(text));
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
