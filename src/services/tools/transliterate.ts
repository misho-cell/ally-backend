import { georgianStem } from './georgianStem';
import { normalizeSearchToken } from './normalizeSearchToken';
import { nameFormVariants } from './nameForms';

const GEO_TO_LATIN: readonly [string, string][] = [
  ['ა', 'a'],
  ['ბ', 'b'],
  ['გ', 'g'],
  ['დ', 'd'],
  ['ე', 'e'],
  ['ვ', 'v'],
  ['ზ', 'z'],
  ['თ', 't'],
  ['ი', 'i'],
  ['კ', 'k'],
  ['ლ', 'l'],
  ['მ', 'm'],
  ['ნ', 'n'],
  ['ო', 'o'],
  ['პ', 'p'],
  ['ჟ', 'zh'],
  ['რ', 'r'],
  ['ს', 's'],
  ['ტ', 't'],
  ['უ', 'u'],
  ['ფ', 'f'],
  ['ქ', 'k'],
  ['ღ', 'gh'],
  ['ყ', 'q'],
  ['შ', 'sh'],
  ['ჩ', 'ch'],
  ['ც', 'ts'],
  ['ძ', 'dz'],
  ['წ', 'ts'],
  ['ჭ', 'ch'],
  ['ხ', 'kh'],
  ['ჯ', 'j'],
  ['ჰ', 'h'],
];

const GEO_REGEX = /[ა-ჿ]/;

export function hasGeorgian(text: string): boolean {
  return GEO_REGEX.test(text);
}

export function georgianToLatin(text: string): string {
  let result = text;
  for (const [geo, lat] of GEO_TO_LATIN) {
    result = result.split(geo).join(lat);
  }
  return result;
}

// Common Georgian/Armenian→Latin spelling drift: the canonical multi-letter
// form people are taught vs. how they actually type the sound. Applied to Latin
// terms so one query matches tags stored under either spelling (ISSUE 4 / search
// Bug 3). Each entry rewrites every occurrence of `from` → `to` in the seed.
// Genuinely two-way sounds are listed in BOTH directions — e.g. q↔k, so a query
// for "chikava" also generates "chiqava" (the k→q direction was the gap). One-way
// entries (gh→g "drop the h") are listed once so we don't rewrite every plain
// g/h and flood the query with noise. Not lossless — a fully dropped letter can't
// be reconstructed; full forgiveness needs the normalized index (migration 036).
const DRIFT_PAIRS: readonly [string, string][] = [
  ['gh', 'r'], // ღ — "gh" → typed "r"
  ['gh', 'g'], // ღ — "gh" → typed "g" (drop the h)
  ['kh', 'x'], // ხ — "kh" → "x"
  ['kh', 'h'], // ხ — "kh" → "h" (drop the k)
  ['x', 'kh'], // ხ — "x" → "kh"
  ['ts', 'c'], // ც / წ — "ts" → "c"
  ['c', 'ts'], // ც / წ — "c" → "ts"
  ['q', 'k'], // ყ / ქ — "q" → "k"
  ['k', 'q'], // ქ / ყ — "k" → "q"  (Chikava ↔ Chiqava)
  ['zh', 'j'], // ჟ — "zh" → "j"
  // ფ: the mapping emits "f" but Georgians overwhelmingly spell it "p" in
  // names — ფარქოსაძე generated only farkosadze/farqosadze and never matched
  // the label "Parkosadze", so the two scripts returned different sets
  // (ticket 6 protocol run, task 41).
  ['f', 'p'], // ფ — "f" → "p" (Parkosadze)
  ['p', 'f'], // ფ — "p" → "f"
];

// Armenian surname endings people spell interchangeably (asriants / asriyants /
// asriiants). Fold them so the caller needn't guess which the tag was saved as.
// Longest first so "petrosyants" matches "yants" (stem "petros"), not the "ants"
// substring (which would leave a stray "y" in the stem).
const ARMENIAN_ENDINGS: readonly string[] = ['iants', 'yants', 'ants'];

const MAX_TERMS = 12;

/**
 * Row 222, the other direction — and it is the bigger half, not the smaller.
 *
 * Georgian → Latin has worked since August. Latin → Georgian was never built,
 * and the comment on `wordVariantGroup` has said so in plain words for days:
 * „a contact saved ONLY in Georgian with no Latin tag row is still unreachable
 * by a Latin query." The plate carried that as 58 rows and 13% of traffic,
 * which measured the QUERIES. Nobody had measured the PEOPLE.
 *
 * Counted 21 September, base-wide, phones whose label carries the Georgian
 * spelling and no Latin twin at all:
 *
 *   ექიმ (doctor)        10,126 Georgian   3,584 Latin   8,576 unreachable
 *   მასწავლებ (teacher)   7,088            5,289         6,589
 *   იურისტ (lawyer)       1,556            2,757         1,059
 *   ფოტოგრაფ              540              410           448
 *
 * **16,672 people on four trade words alone.** The seat reopened this with
 * „iuristi 40 vs იურისტი 46, six people one-way" on one account; the base says
 * six on one account is one account's share of a thousand.
 *
 * HOW IT IS DONE, AND WHAT IT CANNOT DO. Latin → Georgian is many-to-one
 * backwards: `t` is თ or ტ, `k` is ქ or კ, `p` is პ or ფ. So one primary
 * reading is emitted, then whole-letter swaps of the ambiguous ones — never a
 * full expansion, which would be 2^n terms for an n-ambiguity word and is
 * exactly the regex cost row 108 is about.
 *
 * Measured on 19 real trade words: the primary alone reaches 6, two terms
 * reach 14, and FOUR reach 17. Beyond four it stops improving, so four is the
 * cap and it is a reading rather than a round number.
 *
 * The two it cannot reach are the honest limit: „elektrikosi" is ელექტრიკოსი,
 * where the first `k` is ქ and the second is კ. A whole-letter swap cannot
 * spell one letter two ways in one word. That needs a character class in the
 * pattern (`ელე[ქკ]ტრი[ქკ]ოსი`) rather than more terms, and the regex path
 * takes plain strings today — a separate change, not a bigger list here.
 */
const LATIN_DIGRAPHS: readonly [string, string][] = [
  ['zh', 'ჟ'],
  ['gh', 'ღ'],
  ['kh', 'ხ'],
  ['sh', 'შ'],
  ['ch', 'ჩ'],
  ['ts', 'ც'],
  ['dz', 'ძ'],
  ['ph', 'ფ'],
  ['th', 'თ'],
];

/**
 * The primary reading of each Latin letter — the more common Georgian one
 * where the letter is ambiguous, so that the FIRST term is right more often
 * than not and the swaps below repair the rest.
 */
const LATIN_SINGLES: Readonly<Record<string, string>> = {
  a: 'ა',
  b: 'ბ',
  c: 'ც',
  d: 'დ',
  e: 'ე',
  f: 'ფ',
  g: 'გ',
  h: 'ჰ',
  i: 'ი',
  j: 'ჯ',
  k: 'ქ',
  l: 'ლ',
  m: 'მ',
  n: 'ნ',
  o: 'ო',
  p: 'პ',
  q: 'ყ',
  r: 'რ',
  s: 'ს',
  t: 'თ',
  u: 'უ',
  v: 'ვ',
  // Not a Georgian sound but how წ is typed on a Latin keyboard —
  // „maswavlebeli" is მასწავლებელი and nothing else.
  w: 'წ',
  x: 'ხ',
  y: 'ი',
  z: 'ზ',
};

/**
 * Ordered by how often the second reading turns out to be the right one.
 *
 * Only the TOP TWO that occur in a word are used, and all four combinations of
 * those two are emitted. That ordering matters and is not cosmetic: „marketing"
 * is მარკეტინგი, which needs თ→ტ AND ქ→კ at once. Trying each ambiguity singly
 * — the obvious way — spends the whole budget on მარქეტინგი, მარკეთინგი and
 * მარქეთინღი and never reaches the word that exists.
 */
const GEORGIAN_AMBIGUITY: readonly [string, string][] = [
  ['თ', 'ტ'],
  ['ქ', 'კ'],
  ['პ', 'ფ'],
  ['ჰ', 'ღ'], // ბუღალტერი typed „buhalteri"
  ['ჯ', 'ჟ'],
  ['ც', 'წ'],
  ['ჩ', 'ჭ'],
  ['ყ', 'ქ'],
  ['გ', 'ღ'],
  ['ზ', 'ძ'],
];

/** Two ambiguities, all four combinations of them — never more. */
const GEORGIAN_AMBIGUITIES_USED = 2;
/** Below this a Georgian term is an exact token (see EXACT_TOKEN_MAX_CHARS) and
 *  a guessed spelling that short is noise rather than reach. */
const MIN_GEORGIAN_TERM_CHARS = 5;

/** The primary reading: digraphs first, then letter by letter. */
export function latinToGeorgian(term: string): string {
  const lower = term.toLowerCase();
  let out = '';
  let i = 0;
  while (i < lower.length) {
    const pair = lower.slice(i, i + 2);
    const digraph = LATIN_DIGRAPHS.find(([latin]) => latin === pair);
    if (digraph) {
      out += digraph[1];
      i += 2;
      continue;
    }
    out += LATIN_SINGLES[lower[i]] ?? lower[i];
    i += 1;
  }
  return out;
}

/**
 * The Georgian readings of a Latin term: the primary one, and the four
 * combinations of its two most-likely ambiguities. Empty when the term is
 * already Georgian, or when the reading is too short to be worth a pattern.
 *
 * At most four terms and usually fewer — measured at 2.71 per word over 21 real
 * trade words, of which 18 are reached. The three it misses are all the same
 * shape: „elektrikosi" is ელექტრიკოსი, where one `k` is ქ and the other is კ,
 * and no whole-letter swap can spell one letter two ways in one word.
 */
export function georgianVariants(term: string): readonly string[] {
  if (hasGeorgian(term)) return [];
  const primary = latinToGeorgian(term);
  if (primary.length < MIN_GEORGIAN_TERM_CHARS) return [];
  const live = GEORGIAN_AMBIGUITY.filter(([from]) => primary.includes(from)).slice(
    0,
    GEORGIAN_AMBIGUITIES_USED,
  );
  const out = new Set<string>([primary]);
  for (const [from, to] of live) out.add(primary.split(from).join(to));
  if (live.length === GEORGIAN_AMBIGUITIES_USED) {
    const [[from1, to1], [from2, to2]] = live;
    out.add(primary.split(from1).join(to1).split(from2).join(to2));
  }
  return [...out];
}

function driftVariants(term: string): string[] {
  const out = new Set<string>([term]);
  for (const [from, to] of DRIFT_PAIRS) {
    const swapped = term.split(from).join(to);
    if (swapped !== term) out.add(swapped);
  }
  return [...out];
}

// If the term ends in one of the interchangeable Armenian endings, also emit the
// term with each of the other endings; otherwise return it unchanged.
function endingVariants(term: string): string[] {
  for (const ending of ARMENIAN_ENDINGS) {
    if (term.endsWith(ending)) {
      const stem = term.slice(0, term.length - ending.length);
      return ARMENIAN_ENDINGS.map((e) => stem + e);
    }
  }
  return [term];
}

/**
 * Query terms to try: the lowercased original, its Latin transliteration when
 * Georgian, common drift variants of the Latin form, Armenian-ending folds, and
 * — for a Latin query — the Georgian readings of it (row 222). Deduped, and
 * capped on each side separately so the Georgian forms cannot crowd out the
 * Latin ones and the Latin ones cannot swallow the budget before the Georgian
 * ones are reached.
 */
export function buildSearchTerms(rawQuery: string): readonly string[] {
  const lower = rawQuery.trim().toLowerCase();
  if (!lower) return [];
  const terms = new Set<string>([lower]);
  const latin = hasGeorgian(lower) ? georgianToLatin(lower) : lower;
  for (const drift of driftVariants(latin)) {
    for (const withEnding of endingVariants(drift)) terms.add(withEnding);
  }
  const capped = [...terms].slice(0, MAX_TERMS);
  return [...new Set([...capped, ...georgianVariants(lower)])];
}

/**
 * Split a multi-word query into per-word variant groups, each holding the RAW
 * variant terms for that word (transliteration + drift folds). A caller ranks a
 * contact by HOW MANY distinct query words it matched — so "Dachi Axel" ranks the
 * one person carrying both above the ~150 who carry only the common "Axel"
 * (search Bug 2) — and builds both an index-backed candidate filter (LIKE
 * '%term%') and a word-start refine from these terms. Single-word queries yield
 * one group, degrading to plain single-term behaviour.
 */
/**
 * Ticket 20 row 108 — the sentence's punctuation was riding into the regex.
 *
 * Splitting „ქორწილის ფოტოგრაფი მჭირდება ქუთაისში." on whitespace alone gives
 * a last word of „ქუთაისში." including the full stop, and toWordStartPattern
 * turns that into `\mქუთაისში\.` — which can only match a tag that literally
 * contains „ქუთაისში." WITH the stop. So it never matched anything, and still
 * cost a full regex pass over 885,942 rows. Ninia's sentence carried four such
 * dead terms („გამარჯობა,", „საწარმო,", „მარკეტინგში,", „აწყობაში.").
 *
 * Trimmed HERE and not in toWordStartPattern, because that function protects
 * a term like „c++" on purpose — the punctuation is part of the word there.
 * What is being removed is the punctuation of the SENTENCE, which is this
 * splitter's business and nobody else's.
 */
const SENTENCE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu;

export function buildRawWordGroups(rawQuery: string): string[][] {
  const words = rawQuery
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(SENTENCE_PUNCTUATION, ''))
    .filter(Boolean);
  return words.map((word) => wordVariantGroup(word)).filter((group) => group.length > 0);
}

// One word's group: its own spelling variants first, then every other form of
// the first name it may be (Bachana → Bacho, Vasil → Vasiko — Answers-12 Part
// B), each with ITS spelling variants. Capped so a common name never floods
// the regex list.
const MAX_GROUP_TERMS = 24;

/**
 * Ticket 20 row 10 / row 104 — a Georgian case ending threw away the half of
 * the name that identified the person.
 *
 * MEASURED, 19 September, on Lika's own phonebook. She has `Tiko Ratiani`
 * saved, and she typed „თიკო რატიანს მისწერე":
 *
 *   „თიკო"     → tiko     → matches Tiko Ratiani
 *   „რატიანს"  → ratians  → matches nothing at all
 *
 * She is found, by her first name, and the surname — the half that tells one
 * Tiko from another — is discarded by a single letter. The result comes back
 * having matched one query word of two, which is what marks it `approximate`.
 *
 * Nothing new is built here. georgianStem has trimmed exactly these endings
 * since 1 September and is tested on its own; it was simply never wired into
 * the NAME path, only into searchByInsight. „რატიანს" reduces to „რატიან",
 * which transliterates to `ratian`, and toWordStartPattern makes that a
 * prefix — so it reaches `Ratiani`, `Ratianis`, and the Georgian spelling too.
 *
 * RECALL ONLY GROWS, AND THE TERM COUNT DOES NOT. A stem term is a PREFIX of
 * the word term it came from, and toWordStartPattern anchors the start only —
 * so `\mratian` matches everything `\mratians` matched and more. Where that
 * holds the longer term is redundant and is dropped, which keeps a Georgian
 * sentence at the same number of terms it costs today. That matters: row 108
 * is about how much regex this search drags over 885,942 rows, and paying for
 * it twice to fix a name would be robbing one row to pay another.
 *
 * The exception is a stem of four characters or fewer, which
 * toWordStartPattern anchors at BOTH ends — `\mbank\M` is an exact token and
 * not a superset of `\mbanki`. Those do not supersede anything and both are
 * kept.
 *
 * WHAT IT DOES NOT FIX, so nobody reads it as more than it is: a Latin query
 * still generates no Georgian spelling, so a contact saved ONLY in Georgian
 * with no Latin tag row is still unreachable by a Latin query. That is a
 * different gap with a different fix — the tag row should exist — and it is
 * measured in the night list rather than guessed at here.
 */
/**
 * Is `term` already covered by one of `stemTerms` — i.e. would dropping it
 * change nothing a caller can observe?
 *
 * Only a stem LONGER than the exact-token threshold supersedes, because at or
 * below it toWordStartPattern anchors both ends and the short form stops being
 * a superset. Compared against the threshold that function uses, so the two
 * cannot drift apart.
 */
function supersededBy(term: string, stemTerms: readonly string[]): boolean {
  return stemTerms.some(
    (stem) => stem.length > EXACT_TOKEN_MAX_CHARS && term !== stem && term.startsWith(stem),
  );
}

/**
 * Ticket 20 row 222, the half that had never been built — a LATIN query is
 * never stemmed, and a Georgian one always is.
 *
 * `georgianStem`'s first line returns the word unchanged when it holds no
 * Georgian letter. So „არქიტექტორი" stems to „არქიტექტორ" and reaches the
 * label `arkitektorebi`, while „arqiteqtori" does not — which is exactly the
 * seat's 69-against-74 on one account.
 *
 * MEASURED before it was built, twice. Reach first, against the live base:
 *
 *   arkitektori   1,746 -> 1,848      bugalteri  12,983 -> 13,320
 *   santekniki    2,740 -> 3,969      elektrikos    289 ->    300
 *   together     17,758 -> 19,437 people, +9.5%
 *
 * Then precision, on 501, by eye, tags only: of the twelve tags only the stem
 * reaches, ELEVEN are the same trade — plurals, genitive plurals, the ღ/ხ and
 * ქ/კ spellings, a feminine form. The twelfth is wrong: „bebia" is grandmother
 * and the stem „bebi" reaches „bebiko", somebody's nickname.
 *
 * AND IT IS WRONG EXACTLY AT THE FLOOR. „bebi" is four characters, which is
 * `georgianStem`'s own minimum, and every stem of five or more was right. So
 * the threshold here is FIVE, and it is the seat's decision on that number
 * rather than my preference.
 *
 * NO ENDING LIST OF MY OWN. The Georgian reading already exists
 * (`latinToGeorgian`, built for the other direction of this same row) and the
 * ending list already exists and is tested. This joins the two and invents
 * nothing: Latin in, Georgian reading, stem it, Latin back out.
 *
 * AND IT HAS TO REFUSE ENGLISH, which the first version did not. Measured over
 * the week's 373 real tag queries before shipping: it was stemming
 * „sustainability" to „sustainabilit", „falconry" to „faltsonr", „wordpress"
 * to „tsordpres" and „agency" to „agents". Those are Georgian CASE endings
 * being applied to English words, and the round trip mangles the rest of the
 * word on the way. It is the same fault as writing „accountant" in Georgian
 * letters, which I removed from this file last night.
 *
 * THE TEST IS THE ROUND TRIP ITSELF, which needs no word list. A word that is
 * really Georgian typed in Latin survives Latin → Georgian → Latin unchanged
 * once the database's own folds are applied: „arqiteqtori" comes back
 * „arkitektori", which normalizes to the same string. „wordpress" comes back
 * „tsordpres", which does not. So the reading is only trusted when it is
 * faithful, and `normalizeSearchToken`'s rule is the one that decides —
 * the same rule the search itself compares by.
 */
const MIN_LATIN_STEM_CHARS = 5;

/**
 * Does the Georgian reading of this Latin word give the word back?
 *
 * Folded with the database's own normalization, so q/k, gh/g and the rest of
 * the drift the search already treats as one thing do not count as damage.
 */
function theReadingIsFaithful(latin: string, reading: string): boolean {
  return normalizeSearchToken(georgianToLatin(reading)) === normalizeSearchToken(latin);
}

export function latinStem(word: string): string {
  const lower = word.toLowerCase();
  // The Georgian path stems already; doing it twice would be the same answer.
  if (hasGeorgian(lower)) return lower;
  const reading = latinToGeorgian(lower);
  if (!theReadingIsFaithful(lower, reading)) return lower;
  const stemmed = georgianStem(reading);
  if (stemmed === reading) return lower;
  const back = georgianToLatin(stemmed);
  return back.length >= MIN_LATIN_STEM_CHARS ? back : lower;
}

function wordVariantGroup(word: string): string[] {
  const lower = word.toLowerCase();
  const latin = hasGeorgian(lower) ? georgianToLatin(lower) : lower;
  // Row 222: the Georgian stem for a Georgian word, the Latin one for a Latin
  // word. Never both — each returns the word untouched on the other's input.
  const stem = hasGeorgian(lower) ? georgianStem(lower) : latinStem(lower);
  const stemTerms = stem === lower ? [] : buildSearchTerms(stem);
  const group = new Set<string>(stemTerms);
  for (const term of buildSearchTerms(word)) {
    if (!supersededBy(term, stemTerms)) group.add(term);
  }
  for (const form of nameFormVariants(latin)) {
    if (form === latin) continue;
    for (const term of buildSearchTerms(form)) group.add(term);
  }
  return [...group].slice(0, MAX_GROUP_TERMS);
}

// A term this short must match a whole token, never a prefix: 'giz' swallowed
// "Gizo"/"giza" in country channels, 'coo' matched "Cooper"/"Mini Cooper"/
// "Cooprogetti" in second degree — one shared matcher, three tools' noise
// (ticket 6 close §6, founder ruling). The cost — 3-4 char prefix typing like
// "law"→"lawyer" stops expanding — was judged smaller than the noise.
const EXACT_TOKEN_MAX_CHARS = 4;

/**
 * A Postgres regex that anchors a term to the START of a word, so "nasa"
 * matches the word "nasa..." but never the fragment inside "Inasaridze"
 * (ISSUE 3). Terms of ≤4 characters additionally anchor the END of the word —
 * an exact token — because at that length a prefix is noise, not forgiveness.
 * Regex metacharacters in the term are escaped.
 */
export function toWordStartPattern(term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \M is only valid after a word character — "c++" ends on '+', where a
  // word-end boundary can never match, so such terms keep the prefix form.
  const exactToken = term.length <= EXACT_TOKEN_MAX_CHARS && /[\p{L}\p{N}]$/u.test(term);
  return exactToken ? `\\m${escaped}\\M` : '\\m' + escaped;
}
