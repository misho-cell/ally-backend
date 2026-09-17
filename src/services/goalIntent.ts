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

export function looksLikeGoalRequest(message: string): boolean {
  const text = message.trim();
  if (text.length < MIN_GOAL_MESSAGE_CHARS) return false;
  if (isQuestionNotGoal(text)) return false;
  return NEED_RE_KA.test(text) || NEED_RE_EN.test(text) || NEED_RE_ES.test(text);
}

// Instructions to the assistant that are not part of the goal itself.
const TITLE_NOISE_RE =
  /(\.?\s*(ეს\s+)?მიზნად\s+შეინახე\.?|\.?\s*ეს\s+მიზანია\.?|\.?\s*(მნიშვნელოვანი:|important:)[^.]*\.?|\.?\s*არავის\s+არ\s+მისწერო[^.]*\.?|\.?\s*set (this|it) as a goal\.?)/gi;

/** The goal's title from the message: the first sentence, without the instructions, capped. */
export function goalTitleFrom(message: string): string {
  const cleaned = message.replace(TITLE_NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
  const firstSentence = cleaned.split(/(?<=[.!?…])\s+/)[0] ?? cleaned;
  const base = (firstSentence.trim() || cleaned || message.trim()).replace(/[.!…]+$/, '');
  if (base.length <= MAX_TITLE_CHARS) return base;
  const cut = base.slice(0, MAX_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_TITLE_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}
