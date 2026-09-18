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

/**
 * Ticket 20 row 215 — „no goal" is not naming a goal, and „stop using Netai"
 * is not stopping one.
 *
 * The seat, 18 September, threads 18316 and 18317, twice:
 *
 *   „Two quick things, no goal: what can you not do for me, and what happens
 *    to my contacts if I stop using Netai."
 *   → „There is no goal to stop in this conversation."   593 ms, no tool calls
 *
 * Both halves of the rule fired and neither meant what it thought. The stop
 * verb is in „stop USING NETAI" — leaving the product, not ending a goal. The
 * goal word is in „NO goal" — the owner saying there is no goal, which is the
 * opposite of naming one. Their control run removing „no goal" proved the
 * mechanism exactly: the line fell straight through to the model.
 *
 * This is the failure the comment above already names — „stop SOMETHING ELSE"
 * — and the bare branch got a length bound for precisely that reason. The
 * named-goal branch never got one, so ANY long sentence carrying both words
 * was read as a command and answered from code before the model saw it.
 *
 * TWO BOUNDS, AND WHY EACH ONE.
 *
 * A typed stop is an instruction, and instructions are short. The real ones:
 *
 *   „გააჩერე"                                     7
 *   „გააჩერე ეს მიზანი, ტესტი იყო."              29
 *   „Stop this goal please, it was only a test"   41
 *   the false positive                           110
 *
 * Sixty separates them with room on both sides. A genuine stop written longer
 * than that goes to the model instead, which is what happened for months
 * before this fast path existed — a miss costs seconds, and a false positive
 * closes a goal somebody wanted and throws away the answer.
 *
 * And a NEGATED goal word is not a goal named, at any length. „no goal",
 * „მიზანი არ", „არა მიზანი" — a person writing „no goal needed, just tell
 * me…" is asking a question, and answering it with „there is no goal to stop"
 * is a non-answer with no sign that anything was misunderstood.
 */
const NAMED_STOP_MAX_CHARS = 60;

/**
 * „no goal", „not a task", „არ არის მიზანი" — the word present and denied.
 *
 * Georgian negates AFTER the noun in both senses, so position alone cannot
 * tell them apart — the existing test caught my first attempt within the
 * minute:
 *
 *   „მიზანი არ არის"                    there IS no goal        -> negated
 *   „დავალება, აღარ მჭირდება"           the task, not NEEDED    -> a real stop
 *
 * What separates them is the copula. „არის" denies that the thing exists;
 * every other verb denies something about a thing that does. So the trailing
 * form requires „არ/აღარ არის" and nothing looser, and the leading English
 * forms („no goal", „not a task") need no such care.
 */
const GOAL_NEGATED =
  /(\bno\s+(?:goal|task)\b|\bnot\s+a\s+(?:goal|task)\b|(?:არა?|აღარ)\s+(?:არის\s+)?(?:მიზან|დავალებ)|(?:მიზან|დავალებ)\S*\s+(?:არ|აღარ)\s+არის)/iu;

export function looksLikeStopRequest(message: string): boolean {
  const text = message.trim();
  if (!STOP_VERB.test(text)) return false;
  if (text.length <= BARE_STOP_MAX_CHARS) return true;
  if (text.length > NAMED_STOP_MAX_CHARS) return false;
  if (GOAL_NEGATED.test(text)) return false;
  return NAMES_THE_GOAL.test(text);
}
