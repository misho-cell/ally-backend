/**
 * 5446 part (4), founder ruling D792 (16 Oct): from a person's job, where they
 * have working ties. Tiko heads sales at a residential developer, so she works
 * with the banks' mortgage and developer-credit people, and the next friend
 * with a stuck TBC loan should be pointed to her, even before she has solved
 * a case for anyone.
 *
 * The inference is silent. A member found only this way is offered with the
 * approved soft hint and no reason (BP, D792), exactly like a member found by
 * a solved case. It reads only what the member wrote about their own work
 * (profession, industry), never another person's label for them.
 */
interface WorkingTie {
  /** The ask is about this world: words of the owner's search. */
  readonly asks: RegExp;
  /** People whose own work is this have ties into that world (Postgres regex, folded lower case). */
  readonly work: readonly string[];
}

/**
 * „Developer" alone is left out on purpose: in Georgian and English it is as
 * often software as buildings, and a programmer is no way into a bank.
 */
const WORKING_TIES: readonly WorkingTie[] = [
  {
    asks: /ბანკ|სესხ|კრედიტ|იპოთეკ|თიბისი|ლიბერთი|\bloan|\bmortgage|\bbank|\bcredit|\btbc\b|\bbog\b|\bliberty\b/iu,
    work: [
      'უძრავ',
      'რიელტორ',
      'ბროკერ',
      'სამშენებლო',
      'საცხოვრებელი კომპლექს',
      'real estate',
      'realtor',
      'broker',
      'construction',
      'residential',
    ],
  },
];

/** The work pattern for the worlds this search asks about, or null when it asks about none. */
export function tieWorkPatternFor(searchText: string): string | null {
  const work = WORKING_TIES.filter((tie) => tie.asks.test(searchText)).flatMap((tie) => tie.work);
  return work.length === 0 ? null : [...new Set(work)].join('|');
}
