/**
 * Ticket 20 row 113, eighth pass — the MARK was late, not the withholding.
 *
 * The tester's own diagnosis (#3632), and it is better than mine was. Goal
 * 4724, thread 16836, with the stop typed one second into the gpt write stage:
 *
 *   17:43:53.119  present_choices — the write stage starts
 *   17:43:54.08   the owner types the stop
 *   17:43:58.607  their line is stored
 *   17:44:00.027  the run's reply is stored anyway, with two buttons
 *   17:44:05.581  update_task finally closes the goal
 *
 * Everything I built withholds correctly from the moment the thread is marked.
 * The mark arrived at 17:44:05 — ELEVEN SECONDS after the owner pressed enter —
 * because a typed stop does nothing until the model takes a turn and decides to
 * call update_task. The reply beat it by five seconds.
 *
 * So the server reads the owner's line itself, the moment it arrives, exactly
 * as ensureGoalForRequest reads it for a goal. Same shape, same reason: whether
 * a model gets round to it is evidence; what the server does is code.
 *
 * WHY THIS IS DELIBERATELY NARROW. A false positive here closes a goal somebody
 * wanted and throws away the answer they were waiting for — a worse failure
 * than the one being fixed. So a stop verb ALONE is not enough. Either the line
 * names the goal, or it is short enough to be nothing but the instruction.
 *
 *   „გააჩერე ეს მიზანი, ტესტი იყო."     names the goal        -> stop
 *   „გააჩერე"                            nothing else in it    -> stop
 *   „გააჩერე კითხვის გაგზავნა დათოსთვის" stop SOMETHING ELSE   -> not a stop
 *
 * That third one is the case the length rule exists for: „stop sending the
 * question to Dato" is a sentence about one message, and closing the whole goal
 * on it would be the assistant deciding something nobody asked for.
 */

/** A stop, at a word start. Georgian stems, because Georgian inflects at the end. */
const STOP_VERB = /(^|[^\p{L}\p{N}])(გააჩერ|გაჩერ|შეაჩერ|შეჩერ|შეწყვიტ|stop|halt|abort)/iu;

/** „this goal", in the words people actually type. */
const NAMES_THE_GOAL = /(მიზან|დავალებ|goal|task)/iu;

/**
 * Short enough that the line is the instruction and nothing else. „გააჩერე" is
 * seven characters; „stop" is four; „stop please" is eleven. The sentence that
 * must NOT match — „გააჩერე კითხვის გაგზავნა" — is twenty-four.
 */
const BARE_STOP_MAX_CHARS = 15;

export function looksLikeStopRequest(message: string): boolean {
  const text = message.trim();
  if (!STOP_VERB.test(text)) return false;
  return NAMES_THE_GOAL.test(text) || text.length <= BARE_STOP_MAX_CHARS;
}
