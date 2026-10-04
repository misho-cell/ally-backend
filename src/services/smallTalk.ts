import { isBareGreeting } from './greetingTurn';

/**
 * The tester's 1113, the founder's own account, 3 Oct 18:43–18:46Z: after
 * „+ ახალი მიზანი" he typed „გამარჯობა", and in another conversation „რა
 * დღეა დღეს?". The app flag opened a goal from each (titled with the words
 * themselves), so a greeting took a minute, searched the contacts and read out
 * six waiting goals, and the date question was followed by a goal wake offering
 * to close „this goal as solved". Small talk is answered, never made a goal,
 * whatever button it was typed after.
 *
 * NARROW ON PURPOSE: a short question about a need („ვინ იცნობს ვეტერინარს?")
 * typed after that button is a goal, and must stay one.
 */
const SMALL_TALK_RE =
  /^\s*(?:რა\s+დღეა(?:\s+დღეს)?|დღეს\s+რა\s+დღეა|რომელი\s+საათია|რა\s+საათია|რა\s+ამინდია|როგორ\s+ხარ|რას\s+შვრები|მადლობა|გმადლობ|ვინ\s+ხარ|what\s+day\s+is\s+(?:it|today|it\s+today)|what\s+(?:is\s+the\s+)?date|what\s+time\s+is\s+it|how\s+are\s+you|thanks?(?:\s+you)?|thank\s+you|who\s+are\s+you|какой\s+сегодня\s+день|как\s+дела|спасибо)[\s?!.,)😊🙂👋]*$/iu;

export function isSmallTalk(message: string): boolean {
  return isBareGreeting(message) || SMALL_TALK_RE.test(message);
}

/** Small talk that needs something looked up: the weather is live, and is not answered from memory. */
const NEEDS_A_LOOKUP_RE = /(ამინდ|weather|погод|tiempo)/iu;

/**
 * The tester's 1131 (rows 1 and 2): small talk took 6–24 s with no tool doing
 * anything useful, and „მადლობა" inside a goal ran check_my_inbox and answered
 * with a waiting introduction. A listed small-talk line is answered in one
 * short turn with no tools — except the weather, which has to be looked up.
 */
export function isToolFreeSmallTalk(message: string): boolean {
  return isSmallTalk(message) && !NEEDS_A_LOOKUP_RE.test(message);
}
