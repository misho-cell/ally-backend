/**
 * Board #67 (a loyal old Ally customer, 1 Oct, via Tornike): she asked Netai
 * to ask her questions and learn her business first. It told her what she
 * does, went straight to finding leads, and after „I don't need leads now, ask
 * me first" still put lead-finding into the plan. Only „let's discuss" switched
 * it, once.
 *
 * So the owner's word holds in code. Once the owner asks to discuss, to be
 * asked first, or says no leads or no searching now, every turn of that
 * conversation is talk: no goal is opened, the turn has no tools (so no
 * search, no plan, no lead), and the reply is questions about them. It lasts
 * until the owner asks for action in so many words, and only the owner's own
 * lines decide it.
 */
const DISCUSS_FIRST_RE = new RegExp(
  [
    // Georgian: „ask me first", „ask me questions", „let's discuss / talk",
    // „no leads (now)", „don't search".
    'ჯერ\\s+(მკითხე|დამისვი|მომისმინე|გამიცანი|გაიგე)',
    'მკითხე\\s+ჯერ',
    'კითხვები\\s+დამისვი',
    'განვიხილოთ',
    'ვისაუბროთ',
    'ვილაპარაკოთ',
    'ლიდები\\s+(ახლა\\s+)?არ\\s+(მინდა|მჭირდება)',
    'ლიდებს\\s+(ნუ|არ)\\s+(ეძებ|მოძებნი)',
    'ნუ\\s+(ეძებ|მოძებნი)',
    'არ\\s+მოძებნო',
    'ძებნა\\s+არ\\s+მინდა',
    // English
    "let'?s\\s+(discuss|talk)",
    'ask\\s+me\\s+(questions\\s+)?first',
    'ask\\s+me\\s+questions',
    "(don'?t|do\\s+not)\\s+(look\\s+for|search\\s+for|find)\\s+leads",
    "(don'?t|do\\s+not)\\s+need\\s+leads",
    'no\\s+leads\\s+(now|yet|for\\s+now)',
    "(don'?t|do\\s+not)\\s+search",
    // Russian
    'давай\\s+обсудим',
    'сначала\\s+спроси',
    'задай\\s+(мне\\s+)?вопросы',
    'не\\s+ищи',
  ].join('|'),
  'iu',
);

/**
 * The owner asking for action in so many words. Imperatives only, so an owner
 * describing their business („my clients find me through…") does not end the
 * discussion by accident.
 */
const ASKS_FOR_ACTION_RE = new RegExp(
  [
    'მოძებნე',
    'დაიწყე',
    'შეადგინე\\s+გეგმა',
    'გეგმა\\s+შემომთავაზე',
    'იმოქმედე',
    'გადადი\\s+საქმეზე',
    'ახლა\\s+(უკვე\\s+)?ეძებე',
    'go\\s+ahead',
    "let'?s\\s+(start|begin|go)",
    '(now\\s+)?(start|begin)\\s+(searching|looking|the\\s+search)',
    '(now|please)\\s+find',
    '^\\s*find\\b',
    '(make|propose|draw\\s+up)\\s+(a|the)\\s+plan',
    'начинай',
    'найди',
    'составь\\s+план',
  ].join('|'),
  'imu',
);

/** How far back the owner's own lines are read for the switch. */
const MAX_OWNER_LINES_READ = 12;

export function asksToDiscussFirst(text: string): boolean {
  return DISCUSS_FIRST_RE.test(text);
}

export function asksForAction(text: string): boolean {
  return ASKS_FOR_ACTION_RE.test(text);
}

/**
 * What one owner line says about it: true asks to discuss, false asks for
 * action, null says neither (an answer to a question). Within one line the
 * request to discuss wins, because there the action word is the negated one:
 * „ნუ მოძებნე", „don't start searching".
 */
export function lineDecidesDiscussion(line: string): boolean | null {
  if (asksToDiscussFirst(line)) return true;
  if (asksForAction(line)) return false;
  return null;
}

/**
 * Whether the conversation is in discussion, read from the owner's own lines,
 * newest first: the newest line that decides, decides. A line that says
 * neither keeps whatever came before it.
 */
export function discussionHolds(ownerLinesNewestFirst: readonly string[]): boolean {
  for (const line of ownerLinesNewestFirst.slice(0, MAX_OWNER_LINES_READ)) {
    const decided = lineDecidesDiscussion(line);
    if (decided !== null) return decided;
  }
  return false;
}

export const DISCUSS_TURN_NOTE =
  '\n\n## This turn\nThe owner asked to discuss first and be asked questions before any ' +
  'action. This turn has no tools: no search, no plan, no leads, no list of people. Do not ' +
  'tell them what their business is — not even from their saved profile or an earlier ' +
  'conversation; let them tell you. Answer what they said in a sentence or two, then ask ' +
  'one or two short questions that help you understand their business and what they want. ' +
  'Action waits until they ask for it in their own words.';

/** A discussion turn writes questions, not a report; this keeps it short. */
export const DISCUSS_MAX_TOKENS = 600;
