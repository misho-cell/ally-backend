// Ticket 16 Task 90 (D168, D171): whether a message typed into the goal box
// becomes a goal was decided by the model alone — five ordinary „find me
// someone" requests in two days were answered as questions and no goal ever
// existed. The rule now lives here, in code, and is written down:
//
//   A message in a plain conversation that STATES A NEED — „მჭირდება …",
//   „ვეძებ …", „მინდა ვიპოვო / გავიცნო / შევხვდე …", „საჭიროა …",
//   „დამეხმარე ვიპოვო …", „I need …", „looking for …", „find me …" — becomes
//   a goal BEFORE the assistant answers; the conversation is then a goal
//   conversation (plan, one yes, day one). A message that ASKS ABOUT
//   something („რა ვიცი X-ზე?", „ვინ არის …?", „who is …") stays a question.
//   The app can also say so outright (`as_goal: true` on the message), which
//   is what „+ ახალი მიზანი" sends.

const MIN_GOAL_MESSAGE_CHARS = 12;
const MAX_TITLE_CHARS = 90;

// A stated need, at a word start. Georgian verbs decline, so stems.
const NEED_RE_KA =
  /(^|[^ა-ჰ])(მჭირდება|მჭირდება|გვჭირდება|დამჭირდა|ვეძებ|ვეძებთ|საჭიროა|მინდა\s+(ვიპოვო|გავიცნო|შევხვდე|ვნახო|დავუკავშირდე|მოვძებნო|ვისწავლო)|მინდა\s+\S+\s+(ვიპოვო|გავიცნო|შევხვდე)|დამეხმარე|მომინახე|მიშოვე|მაშოვნინე|გამაცანი|დამაკავშირე|მიზნად\s+შეინახე|ეს\s+მიზანია)/;
const NEED_RE_EN =
  /\b(i need|we need|need a|need an|need some|looking for|find me|help me find|want to meet|i want to find|introduce me|connect me|set (this|it) as a goal|make (this|it) a goal)\b/i;
const NEED_RE_ES = /\b(necesito|busco|estoy buscando|quiero conocer|ayúdame a encontrar)\b/i;

// Questions about what is known: never a goal by themselves.
//
// The trailing boundary is a Unicode lookahead and not `\b`, and that is a FIX,
// not a style: `\b` is ASCII-only, so between „არის" and the space after it
// there is no word boundary at all — every Georgian alternative in this list
// has silently failed to match since Task 90 whenever a word followed it.
// „ვინ არის განათლების მინისტრი?" was not being recognised as a question;
// „who is the minister of education?" was. Found while reading row 103, on the
// same rake this codebase has stepped on before (Georgian inflects at the END
// of a word, which is exactly where `\b` is asked to look).
const ASK_ABOUT_RE =
  /^\s*(რა\s+ვიცი|ვინ\s+არის|ვინ\s+არიან|რას\s+აკეთებს|სად\s+მუშაობს|იცნობ|ერთმანეთს\s+იცნობენ|what do (i|you) know|who is|who are|tell me about|რა\s+იცი)(?![\p{L}\p{N}])/iu;

/**
 * Ticket 20 row 103 — a question about the owner's OWN goals or account.
 *
 * „რომელი მიზნები მაქვს ღია" („which goals do I have open") became goal 4258 on
 * Ninia's account, and the same run then counted it among the 24 open goals it
 * was asked about. Read from the live log, so this is not a guess about which
 * path did it:
 *
 *   10:36:03 [goal-intent] thread 16402: goal 4258 opened from the message (app flag)
 *
 * `looksLikeGoalRequest` gets this right on its own and answers false. The flag
 * is what opened it — and the flag skipped every check, including the question
 * check that has been in this file since Task 90.
 *
 * Kept separate from ASK_ABOUT_RE because it is a stronger statement. A „who is
 * X" typed into the new-goal box is at least arguably a goal; a question about
 * the owner's own open goals can never be one, whatever box it was typed in —
 * answering it IS the whole of it, and opening a goal to answer it changes the
 * number being asked about.
 */
const ABOUT_MY_OWN_GOALS_RE =
  /(მიზნ(ები|ებს|ები\s*მაქვს)?[^.?!]{0,20}(მაქვს|მიმდინარე|ღიაა?|დარჩა|მჭირდება\s+სია)|რამდენი\s+მიზან|ჩემი\s+მიზნებ|მიზნების\s+სია|(which|what|how many)\s+(open\s+)?(goals|tasks)\b|my\s+(open\s+)?(goals|tasks)\b|list\s+my\s+goals)/i;

/**
 * A message that only ASKS something, whichever box it was typed into.
 *
 * The app flag („+ ახალი მიზანი") may turn a plain statement into a goal; it may
 * not turn a question into one. That is the whole of row 103's fix, and it is
 * deliberately the narrower half: the flag still wins on anything that is not
 * recognisably a question.
 */
export function isQuestionNotGoal(message: string): boolean {
  const text = message.trim();
  return ASK_ABOUT_RE.test(text) || ABOUT_MY_OWN_GOALS_RE.test(text);
}

/** „who do I have", „how many contacts" — the owner asking about their own base. */
const ABOUT_MY_OWN_BASE_RE =
  /(ვინ\s+მყავს|რამდენი\s+(კონტაქტ|ადამიან)|ჩემ[სი]\s+ქსელ|ქსელში\s+რამდენ|how many\s+(contacts|people)|who do i (have|know)|my\s+(network|contacts)\b)/iu;

/**
 * The product itself, asked about rather than worked on.
 *
 * Both halves are required. „Netai" appears in plenty of real goals — someone
 * looking for a marketer FOR Netai names it in the same sentence as the need —
 * and only the pairing with a price or a „what is this" makes it a question
 * about the product rather than work on it.
 */
const ABOUT_THE_PRODUCT_RE = /(netai|ნეტაი)/i;
const PRICE_OR_DEFINITION_RE =
  /(რამდენი\s+ღირს|რა\s+ღირს|ღირს|ფასი|რა\s+არის|როგორ\s+მუშაობს|what is|how much|cost|price|how does it work)/i;

/**
 * A question whose whole subject is the owner's own data or the product.
 *
 * The founder's ruling of 17 September: „look at what the person typed before
 * running anything. A question skips web_search:opening and
 * search_second_degree:opening entirely; a real goal keeps both."
 *
 * This is the NEGATIVE half of that and deliberately so. The positive test —
 * „only search when the message names a need" — would skip the opening
 * searches on most real goals, because the stem lists in this file are narrow
 * and the goal-box flag exists precisely to cover what they miss. Row 126
 * built those searches for a reason; the cost of skipping them on a real goal
 * is higher than the cost of running them once too often.
 *
 * So this names only what can never need them. Measured on the battery run of
 * 19:00-19:36, these three opened goals and each paid the ~17 s opening tax
 * for nothing:
 *
 *   „ვინ მყავს თბილისში?"                        their own contacts
 *   „How many contacts do I have in my network?"  their own count
 *   „What is Netai and how much does it cost?"    the product
 *
 * The funniest and worst of it: on the first, the opening web search took the
 * Georgian question word „ვინ" for a domain, searched VIN.GE, and told the
 * owner „on the web I found: VIN.GE, your contact there: …".
 *
 * These stay QUESTIONS THAT MAY STILL OPEN A GOAL. Whether they should is row
 * 103 and is not decided; this changes only what runs before the answer.
 */
export function needsNoOpeningSearch(message: string): boolean {
  const text = message.trim();
  if (ABOUT_MY_OWN_BASE_RE.test(text)) return true;
  if (ABOUT_MY_OWN_GOALS_RE.test(text)) return true;
  return ABOUT_THE_PRODUCT_RE.test(text) && PRICE_OR_DEFINITION_RE.test(text);
}

export function looksLikeGoalRequest(message: string): boolean {
  const text = message.trim();
  if (text.length < MIN_GOAL_MESSAGE_CHARS) return false;
  if (isQuestionNotGoal(text)) return false;
  return NEED_RE_KA.test(text) || NEED_RE_EN.test(text) || NEED_RE_ES.test(text);
}

// Instructions to the assistant that are not part of the goal itself.
const TITLE_NOISE_RE =
  /(\.?\s*(ეს\s+)?მიზნად\s+შეინახე\.?|\.?\s*ეს\s+მიზანია\.?|\.?\s*(მნიშვნელოვანი:|important:)[^.]*\.?|\.?\s*არავის\s+არ\s+მისწერო[^.]*\.?|\.?\s*set (this|it) as a goal\.?)/gi;

/**
 * A greeting is not part of the goal.
 *
 * The seat, 17 September: „a goal opened from the goal box still gets the raw
 * sentence as its title (goal 4885, 83 characters with the greeting), because
 * the SERVER writes that title before the model runs. Our prompt cannot reach
 * it." That title is what the stop line quotes back, and what the sidebar
 * shows.
 *
 * Only at the START, and only when something follows it: „გამარჯობა" alone is
 * not a goal and would leave an empty title, and a „hi" in the middle of a
 * sentence is a word.
 *
 * The trailing boundary is a Unicode lookahead, not `\b`, and I wrote `\b`
 * first — ten lines below the comment in this same file that explains why it
 * cannot work. `\b` is ASCII: between „გამარჯობა" and the comma after it there
 * is no word boundary at all, so the Georgian and Russian greetings matched
 * nothing while the English ones matched fine. Georgian inflects at the END of
 * a word, which is exactly where this is asked to look.
 */
const LEADING_GREETING_RE =
  /^\s*(გამარჯობა|სალამი|hello|hi|hey|здравствуй(те)?|привет|hola|buenas)(?![\p{L}\p{N}])[\s,!.—-]*(?=\S)/iu;

/** The goal's title from the message: the first sentence, without the instructions, capped. */
export function goalTitleFrom(message: string): string {
  const cleaned = message
    .replace(TITLE_NOISE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_GREETING_RE, '');
  const firstSentence = cleaned.split(/(?<=[.!?…])\s+/)[0] ?? cleaned;
  const base = (firstSentence.trim() || cleaned || message.trim()).replace(/[.!…]+$/, '');
  if (base.length <= MAX_TITLE_CHARS) return base;
  const cut = base.slice(0, MAX_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_TITLE_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * Ticket 20 row 103/104 — an instruction naming one person is not a goal, and
 * the app flag must not turn it into one.
 *
 * LIKA, 18 September, thread 17623. She typed the whole thing at 12:57:
 *
 *   12:57:52  „ask Tornike Abuladze if he knows a good philosopher"
 *   13:00:27  „ask him"
 *   13:01:09  „I approve"
 *
 * She said it once and then had to say it twice more. The mechanism: the
 * message became a GOAL, a new goal has its plan proposed for approval, and
 * the plan's whole content was her own sentence. She was asked to approve
 * what she had just written.
 *
 * The founder's ruling: when the owner types a short instruction naming one
 * person and one action, those words ARE the yes. It goes, with no draft
 * first and one line afterwards saying who it went to. A goal with a plan in
 * front of it is the opposite of that.
 *
 * WHY THIS GUARD AND NOT A WIDER RULE. `looksLikeGoalRequest` already says
 * false for all six of these, so on the server's own need-rule they never
 * became goals. Only the app flag did — and the flag is the plus button,
 * measured 19 September by typing one identical sentence down both paths:
 * into the box it made no goal, after pressing plus it made goal 6043. So
 * this is the same shape as the question guard directly above: the flag may
 * turn a statement into a goal, it may not turn a question into one, and now
 * it may not turn an instruction-to-a-named-person into one either.
 *
 * THREE SIGNALS, EACH USELESS ALONE, MEASURED AGAINST 56 REAL GOALS:
 *
 *   names someone in the owner's own phonebook   6 of 6 caught, 34 wrong (15%)
 *   + a contact verb is present                  6 of 6 caught,  1 wrong (86%)
 *   + that verb is not negated                   6 of 6 caught,  0 wrong
 *
 * The 34 are almost all one saved contact: owner 501 has an alias
 * „xatuna sologashvili tbilisi", so every „I need a X in Tbilisi" names
 * somebody in his own phonebook. The single survivor was the seat's own
 * safety phrasing — „Search only, write to nobody" — matching on „write to"
 * inside a negation, which is row 215's shape exactly.
 *
 * THE LIMITS, next to the numbers rather than under them. Six instructions is
 * a small positive class and all six come from two owners and two verbs. The
 * negation list was written after seeing the one case it has to catch, which
 * is the weakest kind of rule there is. This is evidence that the SHAPE is
 * right, not that the wording is finished.
 *
 * SO IT FAILS TOWARDS MAKING THE GOAL. Every uncertain path returns false: no
 * verb, a negated verb, a long message, an unreadable phonebook. A goal that
 * quietly does not appear is the mirror image of the bug being fixed, and it
 * is the harder one to notice.
 */

/** „ask", „tell", „write to" — and the Georgian, which inflects at the end. */
const CONTACT_VERB_RE =
  /(ჰკითხე|კითხე|მისწერ|მიწერ|თხოვ|დაუკავშირდ|გაუგზავნ)|(\bask\b|\btell\b|\bwrite to\b|\bmessage\b)/iu;

/**
 * „write to nobody", „არავის არ მისწერო" — the verb is present and the
 * sentence says the opposite. Row 215's shape, and the seat's own safety
 * phrasing is what found it.
 */
const NEGATED_CONTACT_RE =
  /(write to (nobody|no one)|(do not|don't|never)\s+(write|message|contact|ask))|(არავის\s+(არ\s+)?(მისწერ|მიწერ|დაუკავშირდ)|ნუ\s+(მისწერ|დაუკავშირდ))/iu;

/**
 * An instruction is short. Row 104's are 30 to 80 characters; a paragraph that
 * happens to contain „ask" is a goal that mentions asking, not an instruction.
 */
const MAX_INSTRUCTION_CHARS = 160;

/**
 * Does the message carry an un-negated instruction to contact somebody?
 *
 * The CHEAP half of the test, and it runs first on purpose: the phonebook
 * lookup is a query, and this keeps it off every message that cannot possibly
 * need it.
 */
export function looksLikeContactInstruction(message: string): boolean {
  const text = message.trim();
  if (text.length === 0 || text.length > MAX_INSTRUCTION_CHARS) return false;
  if (!CONTACT_VERB_RE.test(text)) return false;
  return !NEGATED_CONTACT_RE.test(text);
}
