import { matchOccupation } from './labelParser.service';
import { professionFamilyIn, professionFamilyKey } from './professionFamilies';

/**
 * 3730 (3) and 3732 (MASTER TEST RUN chat #8, 9 Oct, 2 of 2 each): „please
 * introduce me to <seat>" and „როგორ მივწვდე ბახვა გამოგონილს?" ran web_search
 * on the person's name, and the reply quoted real people from the web who
 * share it. A person the owner names is reached through the owner's own
 * network; the web knows strangers with the same name.
 *
 * #8779 group 4 (the founder, 4 Nov): no fixed word lists. The web tools were
 * taken away when MEET_OR_REACH_RE matched the owner's line; the rule is now in
 * web_search's own description and the model reads the line. A line that names
 * a trade, or asks who holds a post (#8350), keeps the web as before.
 */
export const NAMED_PERSON_NOT_ON_THE_WEB =
  ' A person the owner NAMES to meet or reach is found in their network (the contact ' +
  'searches, then find_warm_path) — never on the web, which only knows strangers with the ' +
  'same name. A trade („a good accountant") or who holds a post („who heads X") may be ' +
  'looked up on the web.';

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

const SENTENCE_END_RE = /(?<=[.!?…])\s+/u;

/**
 * #8350 (tester 78497, threads 74491-74492, 2 of 10 twice): „ვინ არის ჯანდაცვის
 * მინისტრი ახლა და როგორ მივწვდე მის აპარატს" and „who is the current head of
 * Enterprise Georgia and how can I reach them" lost the web tools, and the reply
 * said „I don't have live web access". The owner asks WHO holds a post: there
 * is no name to reach through the network yet, and finding it is the web's job.
 */
const ASKS_WHO_RE =
  /(?<![\p{L}\p{M}])(?:ვინ\s+(?:არის|არიან|ხელმძღვანელობს|მართავს|უძღვება|განაგებს|იკავებს)|who\s+(?:is|are|heads|runs|leads|manages)|кто\s+(?:сейчас\s+)?(?:возглавляет|руководит|является))(?![\p{L}\p{M}])/iu;

/** Does the line ask who holds a post („ვინ არის …", „who heads …")? */
export function asksWhoHoldsAPost(line: string): boolean {
  return line.split(SENTENCE_END_RE).some((sentence) => ASKS_WHO_RE.test(sentence));
}
