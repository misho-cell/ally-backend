import {
  buildRawWordGroups,
  georgianToLatin,
  hasGeorgian,
  toWordStartPattern,
} from './tools/transliterate';
import { RunLanguage, RUN_STRINGS } from './runLanguage';
import { query } from '../db/postgres/client';

const PHONEBOOK_LOOKUP_TIMEOUT_MS = 5_000;
/**
 * The whole gate's wall clock, not one lookup's.
 *
 * This runs on the FINAL reply, the last thing between the model and the
 * person waiting for it, and it looked names up ONE AT A TIME with a
 * five-second timeout each and no cap on how many names a reply can contain.
 * Six officeholders in one answer is thirty seconds added to a reply that is
 * already late — every lookup inside its budget, the answer far outside any.
 *
 * Found on 16 September by looking for this exact shape after it cost
 * get_pending_updates 74,871 ms. It is the third place with it, and the worst
 * placed: those lookups hit "UserAlias" and "UserTags", the 5.7 GB pair whose
 * reads are currently going to disk.
 *
 * Running out of budget is SAFE here and that is why a budget is allowed to be
 * the answer: a name that cannot be checked is treated as unverified and
 * replaced, which is exactly what a failed lookup already does. The gate fails
 * towards refusing to name somebody, never towards naming them.
 */
const GATE_BUDGET_MS = Number(process.env.OFFICEHOLDER_GATE_BUDGET_MS ?? 4_000);

/**
 * Ticket 12 Task 46 (D151, the founder 9 Sep): an official's name only from a
 * page actually read — otherwise „could not verify".
 *
 * One question gave three different names for one office in 35 minutes. The
 * prompt already says „never from memory", and the web tools already say „a
 * name you print must appear in fetched page text"; this is the same rule in
 * code, so it holds when the model does not. The run collects EVIDENCE — the
 * user's own words and every tool result except web-search snippets (a snippet
 * may be stale or name a former holder; the rule is the PAGE) — and the final
 * reply is checked: a sentence that names an office (minister, director, CEO,
 * mayor …) may carry a person's name only if that name is in the evidence. A
 * name that is not is replaced by the scripted line in the run's language. A
 * sentence about a FORMER holder is left alone — that is history, not a live
 * fact, and the rule is about who holds the office today.
 */

const evidenceByRun = new Map<string, string[]>();
const MAX_EVIDENCE_CHARS_PER_RUN = 400_000;

/** Add text the run has actually received (user message, tool result, fetched page). */
export function recordRunEvidence(runId: string | undefined, text: string): void {
  if (!runId || !text) return;
  const list = evidenceByRun.get(runId) ?? [];
  const held = list.reduce((sum, t) => sum + t.length, 0);
  if (held >= MAX_EVIDENCE_CHARS_PER_RUN) return;
  list.push(text.toLowerCase());
  evidenceByRun.set(runId, list);
}

export function clearRunEvidence(runId: string | undefined): void {
  if (runId) evidenceByRun.delete(runId);
}

// Office words. Georgian is caseless and declines, so stems are matched at a
// token start; the English list is whole-word.
const OFFICE_RE_KA =
  /(^|[^ა-ჰ])(მინისტრ|დირექტორ|ხელმძღვანელ|თავმჯდომარ|უფროს|პრეზიდენტ|გუბერნატორ|დეპუტატ|რექტორ|გამგებელ|კომისარ|ელჩ|მერი|მერია|მერის|მერმა|მერს|პრემიერ)/;
const OFFICE_RE_EN =
  /\b(minister|director|ceo|cfo|coo|cto|chair|chairman|chairwoman|chairperson|head|president|mayor|governor|deputy|rector|secretary|commissioner|ambassador|premier)\b/i;
const OFFICE_RE_RU =
  /(министр|директор|председател|глав|президент|мэр|губернатор|посол|руководител)/i;
const OFFICE_RE_ES =
  /\b(ministro|ministra|director|directora|presidente|presidenta|alcalde|alcaldesa|gobernador|gobernadora|embajador|embajadora|jefe|jefa)\b/i;

// A FORMER holder is history, not a live fact: the sentence is left alone.
const FORMER_RE = /(ყოფილ|\bformer\b|\bex-|бывш|\bexpresident|\bantigu[oa]\b|\bex\s)/i;

// Words that look like names in Latin script but are not people.
const LATIN_NOT_A_NAME = new Set([
  'the',
  'in',
  'at',
  'of',
  'and',
  'city',
  'hall',
  'bank',
  'national',
  'ministry',
  'service',
  'agency',
  'revenue',
  'finance',
  'georgia',
  'georgian',
  'tbilisi',
  'batumi',
  'kutaisi',
  'state',
  'office',
  'department',
  'council',
  'committee',
  'parliament',
  'government',
  'university',
  'company',
  'group',
  'holding',
  'llc',
  'jsc',
  'ltd',
  'board',
  'general',
  'executive',
  'managing',
  'prime',
  'first',
  'vice',
  'acting',
  'new',
  'old',
  /**
   * 17 September, thread 17032, inside the owner's own reply, word for word:
   *
   *   Paliskunnat ((name not verified on an official page)' Association,
   *   paliskunnat.fi)
   *
   * The Latin rule is „two capitalised words in a row", and „Paliskunnat
   * Association" satisfies it as neatly as a person's name does — so the gate
   * cut the organisation's own name out of the middle of itself and left the
   * possessive apostrophe behind. Row 154 added the company words for exactly
   * this; these are the ones an institution is called rather than a firm, and
   * the same test applies: a word goes in only if no human being is called it.
   */
  'association',
  'federation',
  'union',
  'institute',
  'foundation',
  'society',
  'chamber',
  'authority',
  'cooperative',
  'guild',
]);

/**
 * Ticket 20 row 154 — a company is not an officeholder.
 *
 * Tornike's choice of 17 September, option (a), after the seat found the gate
 * removing a company name the run's own web search had just returned. On
 * thread 16106 the 07:32 reply listed four agencies and one of them came out
 * as „(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)", followed by the words the
 * earlier reply had used for Infinity Solutions.
 *
 * The Latin rule is „two capitalised words in a row", which „Infinity
 * Solutions" satisfies as neatly as „Giorgi Kapanadze" does. And web snippets
 * are deliberately not evidence (D151's own reasoning), so a company the web
 * found could never verify itself — the gate and the opening search were
 * working against each other, one finding the agency and the other deleting it.
 *
 * Option (b) was to let a web result count as evidence. It was not chosen, and
 * this is the narrower fix: D151 is unchanged for PEOPLE, and the gate simply
 * stops claiming that a company is a person holding an office.
 *
 * THE LIST HOLDS ONLY WORDS THAT CANNOT BE PART OF A PERSON'S NAME, and the
 * asymmetry is why. A company wrongly kept shows an organisation's name the
 * run did not verify — mild, and it came from a search the owner asked for. A
 * PERSON wrongly skipped is D151 broken: somebody named as a minister on no
 * evidence at all. So a word goes in here only if no human being is called it.
 */
const COMPANY_WORDS: ReadonlySet<string> = new Set([
  'solutions',
  'partners',
  'studio',
  'studios',
  'consulting',
  'technologies',
  'systems',
  'digital',
  'media',
  'marketing',
  'labs',
  'works',
  'industries',
  'enterprises',
  'ventures',
  'capital',
  'logistics',
  'motors',
  'clinic',
  'hospital',
  'agencies',
  'services',
  'corporation',
  'corp',
  'inc',
  'plc',
  'gmbh',
]);

// Georgian surname endings — a token pair „X Yშვილი" is a person.
const KA_SURNAME_RE = /(შვილი|ძე|იანი|ავა|უა|აია|ოვი|ევი|სკი)$/;
const KA_NOT_A_FIRST_NAME = new Set([
  'ახალი',
  'ყოფილი',
  'ამჟამინდელი',
  'ბატონი',
  'ქალბატონი',
  'არის',
  'იყო',
  'უფროსი',
  'გენერალური',
  'აღმასრულებელი',
]);

/**
 * Ticket 20 — „ხუთი ადამიანი" is not a person called Adamiani.
 *
 * The Latin side has had LATIN_NOT_A_NAME since the start and COMPANY_WORDS
 * since row 154. The Georgian side has only ever had a list for the FIRST
 * token, so any ordinary word ending like a surname became one.
 *
 * -იანი and -ევი are not only surname endings, they are two of Georgian's most
 * productive suffixes: -იანი makes „having X" out of any noun, and the result
 * ends exactly like ახვლედიანი. So does the plain word for a person.
 *
 * MEASURED over 300 replies, five days. Of 217 candidates, 164 end in -შვილი
 * or -ძე and are people. The other 53 carry an ending that is ambiguous, and
 * they split almost evenly:
 *
 *   28  real people (ფატი დავითულიანი ×13, თინათინ რატიანი, ნინი ღაჭავა …)
 *   25  not people, and 20 of those 25 are two words:
 *         ადამიანი   13   „სამი ადამიანი", „შესაფერისი ადამიანი", „ხუთი …"
 *         მოსაწვევი   7   „პირადი მოსაწვევი", „თეონასთვის მოსაწვევი"
 *
 * Six replies on 17 September carried the „(სახელი ვერ დავადასტურე …)" line
 * where the owner should have read „five people" or „a personal invitation".
 *
 * The other discriminator considered and NOT taken: require the first token to
 * be a known Georgian first name. It has perfect precision here — none of the
 * 25 has one — and it also throws away six of the ten real first tokens
 * (ფატი, დაჯი, ტიკო, თინა … are not in the 275-name list). That is D151
 * broken: someone named as a director on no evidence at all. This list takes
 * the same bargain row 154 wrote down: a word goes in ONLY if no human being
 * is called it.
 *
 * It is a list, so it is incomplete by construction. Every Georgian word that
 * ends like a surname and is not one has to be found the way these were — in
 * what the owners actually read.
 */
const KA_NOT_A_SURNAME: ReadonlySet<string> = new Set([
  'ადამიანი',
  'ადამიანები',
  'მოსაწვევი',
  'გამწევი',
  'დღიანი',
  'ტეგიანი',
  'ერთკაციანი',
]);

const LATIN_NAME_RE = /\b([A-Z][a-z]{1,}(?:-[A-Z][a-z]+)?)\s+([A-Z][a-z]{2,}(?:-[A-Z][a-z]+)?)\b/g;
const KA_TOKEN_RE = /[ა-ჰ]+/g;
const MIN_KA_FIRST_NAME = 3;
const MIN_STEM = 4;
const SENTENCE_SPLIT_RE = /(?<=[.!?…\n])\s+|\n/;

function namesOffice(sentence: string): boolean {
  return (
    OFFICE_RE_KA.test(sentence) ||
    OFFICE_RE_EN.test(sentence) ||
    OFFICE_RE_RU.test(sentence) ||
    OFFICE_RE_ES.test(sentence)
  );
}

function latinNameCandidates(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(LATIN_NAME_RE)) {
    const [, first, last] = m;
    if (LATIN_NOT_A_NAME.has(first.toLowerCase()) || LATIN_NOT_A_NAME.has(last.toLowerCase()))
      continue;
    // Row 154: either half naming a company settles it — „Infinity Solutions"
    // and „Media Group Georgia" are organisations, whatever sentence they
    // appear in.
    if (COMPANY_WORDS.has(first.toLowerCase()) || COMPANY_WORDS.has(last.toLowerCase())) continue;
    if (OFFICE_RE_EN.test(first) || OFFICE_RE_EN.test(last)) continue;
    out.push(`${first} ${last}`);
  }
  return out;
}

function georgianNameCandidates(sentence: string): string[] {
  const tokens = sentence.match(KA_TOKEN_RE) ?? [];
  const out: string[] = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const first = tokens[i - 1];
    const last = tokens[i];
    if (!KA_SURNAME_RE.test(last)) continue;
    if (KA_NOT_A_SURNAME.has(last)) continue;
    if (first.length < MIN_KA_FIRST_NAME || KA_NOT_A_FIRST_NAME.has(first)) continue;
    if (OFFICE_RE_KA.test(` ${first}`)) continue;
    out.push(`${first} ${last}`);
  }
  return out;
}

export function nameCandidates(sentence: string): string[] {
  return [...latinNameCandidates(sentence), ...georgianNameCandidates(sentence)];
}

// A declined Georgian name („დავითაშვილმა", „დავითაშვილის") still carries its
// stem, so the check is on stems; a Latin name is checked whole per token.
function stemOf(token: string): string {
  const lower = token.toLowerCase();
  if (hasGeorgian(lower) && lower.length > MIN_STEM) return lower.slice(0, -1);
  return lower;
}

function nameInEvidence(name: string, evidence: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  const direct = tokens.every((t) => evidence.includes(stemOf(t)));
  if (direct) return true;
  if (!hasGeorgian(name)) return false;
  // A Georgian reply about an English page: the transliterated name may be there.
  return tokens.every((t) => evidence.includes(stemOf(georgianToLatin(t))));
}

export interface OfficeholderGateOutcome {
  reply: string;
  /** Names replaced by the scripted line. */
  refused: string[];
}

/**
 * Check a final reply against the run's evidence and replace every unverified
 * officeholder name with the scripted line. Pure on its inputs apart from the
 * evidence store; returns the reply unchanged when nothing names an office.
 */
/**
 * Ticket 14 (B7, 10 Sep): asked „ვინ მთავს Arci-ში?", the run named the CEO
 * from the user's own notes without a tool result carrying the name, and the
 * gate printed „(სახელი ვერ დავადასტურე …)" for a man in the user's own
 * phonebook. The rule is about PUBLIC officeholders looked up on the web; a
 * person the user saved is not that. A candidate whose words all appear
 * (spelling-tolerant, word-start) in ONE of the user's own labels — alias or
 * tag on one number — is theirs and is never replaced.
 */
async function inUsersPhonebook(userId: string | undefined, name: string): Promise<boolean> {
  if (!userId) return false;
  const groups = buildRawWordGroups(name);
  if (groups.length < 2) return false;
  const patterns = groups.map((group) => `(${group.map(toWordStartPattern).join('|')})`);
  const aliasConds = patterns.map((_, i) => `LOWER(a.alias) ~ $${i + 2}`).join(' AND ');
  const tagConds = patterns
    .map(
      (_, i) =>
        `EXISTS (SELECT 1 FROM "UserTags" t WHERE t.phone = m.phone AND t."contactId" = $1 AND LOWER(t.tag) ~ $${i + 2})`,
    )
    .join(' AND ');
  try {
    const result = await query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "UserAlias" a WHERE a."contactId" = $1 AND ${aliasConds}
       ) OR EXISTS (
         SELECT 1 FROM (SELECT DISTINCT phone FROM "UserTags" WHERE "contactId" = $1) m
         WHERE ${tagConds}
       ) AS found`,
      [userId, ...patterns],
      PHONEBOOK_LOOKUP_TIMEOUT_MS,
    );
    return result.rows[0]?.found === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[officeholder-gate] phonebook lookup failed:', (err as Error).message);
    return false;
  }
}
/**
 * Georgian glues its grammar onto the end of a name, and a plain string swap
 * leaves that glue behind.
 *
 * Ticket 20, thread 15676 on 16 September: the reply read
 * „(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)ა" — the „ა" is the copula that
 * was attached to the name („კალაძეა" = „is Kaladze"), and split/join took the
 * name out from underneath it. The sentence then reads as though the
 * placeholder itself were somebody's name with an ending on it.
 *
 * So the ending goes with the name. Any Georgian letters running straight on
 * from the match with no space are that name's grammar, not the next word.
 */
const GEORGIAN_LETTER = '[\\u10A0-\\u10FF]';

export function replaceNameWithPlaceholder(
  text: string,
  name: string,
  placeholder: string,
): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`${escaped}${GEORGIAN_LETTER}*`, 'gu'), placeholder);
}

export async function applyOfficeholderGate(
  reply: string,
  runId: string | undefined,
  language: RunLanguage,
  userId?: string,
): Promise<OfficeholderGateOutcome> {
  const evidence = (runId ? (evidenceByRun.get(runId) ?? []) : []).join('\n');
  const refused: string[] = [];
  const sentences = reply.split(SENTENCE_SPLIT_RE);
  let out = reply;
  const startedAt = Date.now();
  // One answer per distinct name, however many sentences carry it. The
  // replacement below already rewrites every occurrence, so the repeat lookups
  // were buying nothing and costing a database round trip each.
  const known = new Map<string, boolean>();
  /**
   * ⚠️ 25 SEPTEMBER, ROW 123 — THE MODEL PUT THE OFFICE IN ONE SENTENCE AND
   * THE NAME IN THE NEXT, AND WALKED THROUGH.
   *
   * Thread 24394, „ვინ არის ახლა თბილისის მერი?". The reply, in order:
   *
   *   1. „…გვერდის ტექსტში MERIS სახელი ვერ წავიკითხე…"   office, no name
   *   2. „ინტერნეტში გვხვდება ვარაუდი, რომ ეს BEKA D… -ია"  name, no office
   *   3. „ვერ დავადასტურე, ვინ იკავებს ამჟამად ამ პოსტს"    neither
   *
   * The gate reads one sentence at a time and asks „does THIS sentence name an
   * office", so it never saw a sentence carrying both. The name went out —
   * a wrong one, offered as a guess from the internet, for a live officeholder.
   * The rule was right and the window was one sentence too short.
   *
   * ONE SENTENCE OF CARRY-OVER, and not the whole reply. „ეს" in sentence 2
   * refers back to sentence 1, which is how the claim was actually made; a
   * reply-wide rule would also reach a contact named three paragraphs later
   * about something else, and replacing a real contact's name is a worse
   * failure than missing a guess. A sentence that starts a new subject by
   * naming an office resets the window anyway, because it is checked itself.
   */
  let officeStillInView = false;
  for (const sentence of sentences) {
    const namesAnOffice = namesOffice(sentence);
    const inView = namesAnOffice || officeStillInView;
    // The carry-over lasts exactly one sentence: it is set by a sentence that
    // names an office and spent by the next one, whatever that one says.
    officeStillInView = namesAnOffice;
    if (!inView || FORMER_RE.test(sentence)) continue;
    for (const name of nameCandidates(sentence)) {
      if (nameInEvidence(name, evidence)) continue;
      let inPhonebook = known.get(name);
      if (inPhonebook === undefined) {
        if (Date.now() - startedAt > GATE_BUDGET_MS) {
          // Out of time. Unchecked means unverified — the same answer a failed
          // lookup gives, and the direction this gate exists to fail in.
          // eslint-disable-next-line no-console
          console.warn(`[officeholder-gate] budget spent; "${name}" treated as unverified`);
          inPhonebook = false;
        } else {
          inPhonebook = await inUsersPhonebook(userId, name);
        }
        known.set(name, inPhonebook);
      }
      if (inPhonebook) continue;
      refused.push(name);
      out = replaceNameWithPlaceholder(out, name, RUN_STRINGS[language].nameNotVerified);
    }
  }
  /**
   * ⚠️ 25 SEPTEMBER — I COULD NOT ANSWER THE ONE QUESTION THAT DECIDED WHOSE
   * FAULT IT WAS.
   *
   * The tester asked: the reply carried a biography, so did the fetched page
   * carry the name? If it did, this gate was wrong to strip it. If it did not,
   * the model wrote it from memory and the gate was right. The run fetched
   * 8,471 characters; nothing recorded whether the name was among them, and
   * tbilisi.gov.ge refuses this container, so I could not read it either.
   * „Could not look" on the only fact that mattered.
   *
   * So the gate says what it had when it refused. NOT THE NAMES — the gate
   * fires on names the model produced from nowhere, and some of those are
   * real private people; a refusal is no reason to write somebody into a log.
   * The COUNT and the SIZE OF THE EVIDENCE are what separate the two
   * explanations, and neither identifies anybody:
   *
   *   evidence 0 chars     — nothing was recorded, so the gate could not have
   *                          passed any name; look at what the run collected.
   *   evidence 8,000+ chars — pages were read and the name was not in them.
   *
   * That is the whole diagnosis I was missing today, and it costs one line.
   */
  if (refused.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[officeholder-gate] run ${runId ?? '-'}: ${refused.length} name(s) unverified against ${evidence.length} chars of evidence`,
    );
  }
  return { reply: out, refused };
}
