import { isBareGreeting, unquoted } from './greetingTurn';
import { statesANeed } from './goalIntent';

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
  /^\s*(?:რა\s+დღეა(?:\s+დღეს)?|დღეს\s+რა\s+დღეა|რომელი\s+საათია|რა\s+საათია|რა\s+ამინდია|(?:როგორ|კარგად)\s+ხარ|რას\s+შვრები|მადლობა|გმადლობ|ვინ\s+ხარ|what\s+day\s+is\s+(?:it|today|it\s+today)|what\s+(?:is\s+the\s+)?date|what\s+time\s+is\s+it|how\s+are\s+you|thanks?(?:\s+you)?|thank\s+you|who\s+are\s+you|какой\s+сегодня\s+день|как\s+дела|спасибо)[\s?!.,)😊🙂👋]*$/iu;

/**
 * The tester's 44026 (#2114, conversations 41918 and 41919): „კარგად ხარ?" and
 * „ნახვამდის" were not on the list, so each took the long path (17 s and 12 s)
 * and came back with the slips the short prompt's samples fix.
 */
const FAREWELL_RE =
  /^\s*(?:ნახვამდის|დროებით|კარგად\s+იყავი(?:თ)?|ღამე\s+მშვიდობისა|(?:good)?\s*bye|see\s+you|good\s+night|пока|до\s+свидания|adiós|hasta\s+luego)[\s!.,)😊🙂👋]*$/iu;

/** A line that only says goodbye — answered as a goodbye, never as „how are you". */
export function isFarewell(message: string): boolean {
  return FAREWELL_RE.test(unquoted(message));
}

export function isSmallTalk(message: string): boolean {
  const text = unquoted(message);
  return (
    isBareGreeting(text) ||
    SMALL_TALK_RE.test(text) ||
    FAREWELL_RE.test(text) ||
    isPlainThanks(text)
  );
}

/**
 * The tester's 39207 (conversation 39671): „მადლობა, ძალიან დამეხმარე" took
 * 38 s and was followed by the list of waiting goals, because only a bare
 * „მადლობა" was small talk. A short line that OPENS with thanks and asks for
 * nothing — no need stated, no question — is a thank-you, whatever praise
 * follows it.
 */
const OPENS_WITH_THANKS_RE = /^\s*(მადლობ|გმადლობ|thanks|thank\s+you|спасибо|gracias)/iu;
const MAX_THANKS_CHARS = 80;

export function isPlainThanks(message: string): boolean {
  const text = unquoted(message).trim();
  return (
    text.length <= MAX_THANKS_CHARS &&
    OPENS_WITH_THANKS_RE.test(text) &&
    !/[?？]/u.test(text) &&
    !statesANeed(text)
  );
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
