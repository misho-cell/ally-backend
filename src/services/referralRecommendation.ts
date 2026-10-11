import { phoneForWords } from './instructedAsk';
import { contactInstructionIn } from './instructionUnsent';

/**
 * 3731 (MASTER TEST RUN chat #8, IN-025, 2 of 2): the helper answered
 * „შემიძლია დაგაკავშირო. თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით
 * დაუკავშირდი." — a recommendation of one of her own contacts, told to the
 * asker. 1696's card (shall I ask her for the asker, with my name or without)
 * reads only an order to ask („ჰკითხე ეკას"), so this line went to the asker
 * and the recommended person heard nothing. A line that recommends getting in
 * touch with somebody, and names exactly one of the helper's own contacts, is
 * the same referral: the same card, nothing sent before her tap.
 */
const RECOMMENDS_RE =
  /(?<![\p{L}\p{M}])(?:დაუკავშირდი(?:თ)?|მიწერე(?:თ)?|დაურეკე(?:თ)?|მიმართე(?:თ)?|დაგაკავშირებ\p{L}*|დაგაკავშირო|contact (?:her|him|them)|reach out to|get in touch with|talk to|call (?:her|him|them))(?![\p{L}\p{M}])/iu;

/** Words that are never a person's name in such a line. */
const NOT_A_NAME: ReadonlySet<string> = new Set([
  'ჩემი',
  'შენი',
  'მისი',
  'სახელით',
  'შემიძლია',
  'მაგრამ',
  'ისიც',
  'ის',
  'და',
  'კი',
  'არა',
  'my',
  'name',
  'her',
  'him',
  'them',
  'can',
  'you',
]);
/** How many words of the line are tried as the start of a name. */
const NAME_POSITIONS_TRIED = 8;
const MIN_NAME_CHARS = 2;

export interface RecommendedContact {
  readonly phone: string;
  /** The word the helper typed where the name begins. */
  readonly typed: string;
}

/** Does the line recommend getting in touch with somebody? */
export function recommendsSomebody(line: string): boolean {
  return RECOMMENDS_RE.test(line);
}

/**
 * 3731 (box 52112, 0 of 2): when no card could be shown, the reader's own run
 * called relay_ask at once, and the recommended person was asked before any
 * tap. A line that refers the asker to somebody — an order to ask her, or a
 * recommendation — is answered by the 1696 card or not at all: that run does
 * not hold relay_ask. Nothing goes to the referred person before the tap.
 */
export function refersSomebody(line: string): boolean {
  return contactInstructionIn(line) !== null || recommendsSomebody(line);
}

function nameWordsOf(line: string): string[] {
  return line
    .split(/[^\p{L}\p{M}]+/u)
    .filter((w) => w.length >= MIN_NAME_CHARS && !NOT_A_NAME.has(w.toLowerCase()))
    .filter((w) => !RECOMMENDS_RE.test(w));
}

/**
 * The one contact of this helper's own that the recommendation names: every
 * word is tried as the start of a name, and the answer stands only when all
 * the names found are one person. Null for none or for two different people.
 */
export async function recommendedContact(
  userId: string,
  line: string,
): Promise<RecommendedContact | null> {
  if (!recommendsSomebody(line)) return null;
  const words = nameWordsOf(line).slice(0, NAME_POSITIONS_TRIED);
  const found = await Promise.all(
    words.map(async (typed, at) => ({
      typed,
      phone: await phoneForWords(userId, words.slice(at)),
    })),
  );
  const hits = found.filter((f): f is RecommendedContact => f.phone !== null);
  const phones = new Set(hits.map((h) => h.phone));
  return phones.size === 1 ? hits[0] : null;
}
