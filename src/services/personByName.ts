import { matchOccupation } from './labelParser.service';
import { professionFamilyIn, professionFamilyKey } from './professionFamilies';

/**
 * 3730 (3) and 3732 (MASTER TEST RUN chat #8, 9 Oct, 2 of 2 each): „please
 * introduce me to <seat>" and „როგორ მივწვდე ბახვა გამოგონილს?" ran web_search
 * on the person's name, and the reply quoted real people from the web who
 * share it („ბახვა ბრეგვაძე, ბახვა ჩიქობავა"). A person the owner names is
 * reached through the owner's own network; the web knows strangers with the
 * same name. So a run whose owner line asks to meet or reach somebody BY NAME
 * does not hold the web tools at all — no new words to the model, the tools
 * are simply not offered (as inviteHeld does for invite_contact).
 *
 * 3732 (box 52742): „მინდა <name>-ს დავუკავშირდე. ვისი გავლით შემიძლია?" asks the same thing
 * („I want to contact <name> — through whom?") and is read the same way.
 *
 * A line that names a trade instead („გამაცანი კარგი ბუღალტერი") keeps them:
 * looking beyond the network for a trade is the 1454 web-people paragraph.
 */
const MEET_OR_REACH_RE =
  /(?<![\p{L}\p{M}])(?:გამაცან\p{L}*|გამაცნობ\p{L}*|დამაკავშირ\p{L}*|დავუკავშირდ\p{L}*|მივწვდე|მივწვდები|მივაღწიო|ვისი გავლით|ვის გავლით|introduce me|connect me|put me in touch|(?:can|do|could) i reach|how (?:can|do) i (?:reach|get to|connect with)|through whom|reach out to)(?![\p{L}\p{M}])/iu;

/** The web tools a run that names a person does not hold. */
export const WEB_TOOL_NAMES: ReadonlySet<string> = new Set(['web_search', 'fetch_page']);

/**
 * Georgian case endings a trade word wears after „-ი" falls away: „ექიმთან",
 * „ბუღალტერს", „იურისტთან". Longest first, so „ისთვის" wins over „ს".
 */
const CASE_ENDINGS: readonly string[] = ['ისთვის', 'თან', 'ით', 'ად', 'ის', 'მა', 'ს', 'ზე', 'ში'];
const NOMINATIVE_ENDING = 'ი';

function isTradeWord(word: string): boolean {
  return professionFamilyKey(word) !== null || matchOccupation(word) !== null;
}

/** The word in its dictionary form when a case ending hides a trade word; else as it is. */
function nominative(word: string): string {
  for (const ending of CASE_ENDINGS) {
    if (word.length <= ending.length || !word.endsWith(ending)) continue;
    const base = `${word.slice(0, -ending.length)}${NOMINATIVE_ENDING}`;
    if (isTradeWord(base)) return base;
  }
  return word;
}

/**
 * The trade a line names, in any of its cases: the profession family's own word
 * when it belongs to one, else the occupation; null when it names no trade.
 * 1689 files a person's answers under it.
 */
export function tradeNamedIn(line: string): string | null {
  const asSaid = line
    .split(/[^\p{L}\p{M}]+/u)
    .map(nominative)
    .join(' ');
  return professionFamilyIn(asSaid) ?? matchOccupation(asSaid);
}

/** Does the line name a trade, in any of its cases? */
function namesATrade(line: string): boolean {
  return tradeNamedIn(line) !== null;
}

/** Does the owner's line ask to meet or reach somebody it names, not a trade? */
export function asksForAPersonByName(ownerLine: string): boolean {
  return MEET_OR_REACH_RE.test(ownerLine) && !namesATrade(ownerLine);
}
