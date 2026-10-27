import { queryTerms } from './askBoundary.service';
import { offerFieldTerms, placesFit, placesIn, type Places } from './fieldPlaces';
import { fieldTerms } from './prematch.service';

/**
 * #7823 (OUTAGE 27 Oct ~10:15Z): the matcher compared every open goal with
 * every offer, and each comparison re-derived the offer's field words, its
 * family words and its places from scratch. Over thousands of goals that held
 * the event loop for minutes and the whole server stopped answering.
 *
 * Here everything that depends on the offer alone is worked out once, and the
 * offers are filed by the first letters of their terms. Two terms meet only
 * when one starts with the other (prematch termsMeet), and every term has at
 * least KEY_CHARS letters, so they meet only when they share their first
 * KEY_CHARS letters: a goal is compared only with the offers filed under its
 * own words. isSureMatch asks this index too, so there is one rule.
 *
 * #7823 FAIL (tester 76924, 6 of 6 seat pairs): „ეზოს გამწვანება" never met
 * „ლანდშაფტის დიზაინი", „კრევეტების მომწოდებელი" never met „ზღვის პროდუქტები",
 * „ბუღალტერი" never met „საბუღალტრო": only the offer's FIELD was read, and a
 * goal rarely says the field's own name. The offer's own words count now too,
 * without the words every offer says („კომპანია", „საკუთარი"), and two long
 * words meet on their first six letters, so „ბუღალტერ…" meets „(სა)ბუღალტრ…".
 */

/** Every term is at least this long (askBoundary MIN_TERM_CHARS), so its first letters are a safe key. */
const KEY_CHARS = 3;
/** Two words this long that share their first STEM_CHARS letters are one word in two forms. */
const STEM_WORD_CHARS = 7;
const STEM_CHARS = 6;
/** Georgian „სა-" makes an adjective of a field („საბუღალტრო"); the word under it is the field. */
const GEORGIAN_SA_PREFIX = 'sa';
/** Words any offer may say about itself; a goal sharing only these shares no need (transliterated). */
const WORDS_EVERY_OFFER_SAYS: ReadonlySet<string> = new Set([
  'kompani',
  'kompania',
  'kompaniebs',
  'sakutar',
  'stavazob',
  'vucev',
  'mcire',
  'patara',
  'akal',
  'momsakureb',
  'momsakureba',
  'company',
  'companies',
  'service',
  'services',
  'own',
  'offer',
  'small',
  'new',
  'open',
]);

export interface MatchGoal {
  readonly id: number;
  readonly user_id: number;
  readonly title: string;
}

export interface MatchOffer {
  readonly id: number;
  readonly user_id: number;
  readonly field: string | null;
  /** The offer in its owner's own words; its terms count beside the field's. */
  readonly text?: string | null;
}

interface IndexedOffer<O extends MatchOffer> {
  readonly offer: O;
  /** The offer's place in the list it came in, so candidates keep that order. */
  readonly position: number;
  readonly terms: readonly string[];
  readonly places: Places;
}

export interface OfferIndex<O extends MatchOffer> {
  readonly byKey: ReadonlyMap<string, readonly IndexedOffer<O>[]>;
}

function keyOf(term: string): string {
  return term.slice(0, KEY_CHARS);
}

function termsMeet(a: string, b: string): boolean {
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  return (
    a.length >= STEM_WORD_CHARS &&
    b.length >= STEM_WORD_CHARS &&
    a.slice(0, STEM_CHARS) === b.slice(0, STEM_CHARS)
  );
}

/** A „სა-" word also stands as the word under it („sabugaltro" → „bugaltro"). */
function withSaStripped(terms: readonly string[]): string[] {
  const under = terms
    .filter((t) => t.startsWith(GEORGIAN_SA_PREFIX) && t.length >= STEM_WORD_CHARS)
    .map((t) => t.slice(GEORGIAN_SA_PREFIX.length));
  return [...new Set([...terms, ...under])];
}

/**
 * The terms a goal may speak of to fit this offer: the field's (with its
 * families) and the offer's own words, less the words every offer says. An
 * offer with no field stays out (D498: no field, no sure match).
 */
export function offerTerms(offer: MatchOffer): string[] {
  const field = offer.field?.trim() ?? '';
  const fromField = offerFieldTerms(field);
  if (fromField.length === 0) return [];
  const fromText = fieldTerms(offer.text ?? '').filter((t) => !WORDS_EVERY_OFFER_SAYS.has(t));
  return withSaStripped([...fromField, ...fromText]);
}

/** Files each offer under the first letters of its field terms. An offer with no field term is never filed. */
export function indexOffers<O extends MatchOffer>(offers: readonly O[]): OfferIndex<O> {
  const byKey = new Map<string, IndexedOffer<O>[]>();
  offers.forEach((offer, position) => {
    const terms = offerTerms(offer);
    if (terms.length === 0) return;
    const indexed: IndexedOffer<O> = {
      offer,
      position,
      terms,
      places: placesIn(offer.field ?? ''),
    };
    for (const key of new Set(terms.map(keyOf))) {
      const filed = byKey.get(key);
      if (filed === undefined) byKey.set(key, [indexed]);
      else filed.push(indexed);
    }
  });
  return { byKey };
}

/** The offers that are a sure match for this goal, in the order the offers came in. */
export function sureOffersFor<O extends MatchOffer>(goal: MatchGoal, index: OfferIndex<O>): O[] {
  const words = withSaStripped(queryTerms(goal.title)).filter(
    (w) => !WORDS_EVERY_OFFER_SAYS.has(w),
  );
  const candidates = new Set<IndexedOffer<O>>();
  for (const key of new Set(words.map(keyOf))) {
    for (const indexed of index.byKey.get(key) ?? []) candidates.add(indexed);
  }
  let goalPlaces: Places | null = null;
  const fits = (indexed: IndexedOffer<O>): boolean => {
    if (indexed.offer.user_id === goal.user_id) return false;
    if (!words.some((w) => indexed.terms.some((t) => termsMeet(w, t)))) return false;
    goalPlaces ??= placesIn(goal.title);
    return placesFit(indexed.places, goalPlaces);
  };
  return [...candidates]
    .filter(fits)
    .sort((a, b) => a.position - b.position)
    .map((indexed) => indexed.offer);
}
