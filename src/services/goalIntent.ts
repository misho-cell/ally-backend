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
const ASK_ABOUT_RE =
  /^\s*(რა\s+ვიცი|ვინ\s+არის|ვინ\s+არიან|რას\s+აკეთებს|სად\s+მუშაობს|იცნობ|ერთმანეთს\s+იცნობენ|what do (i|you) know|who is|who are|tell me about|რა\s+იცი)\b/i;

export function looksLikeGoalRequest(message: string): boolean {
  const text = message.trim();
  if (text.length < MIN_GOAL_MESSAGE_CHARS) return false;
  if (ASK_ABOUT_RE.test(text)) return false;
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
