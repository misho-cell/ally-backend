import { classifyToken, labelTokens, orgWordStats, OrgWordStat } from '../labelReader.service';
import { COMPANY_MARKERS, NOT_A_WORD, ORGANISATION_WORDS } from '../labelDictionaries';

/**
 * Ticket 17 Task 8 (D202, the founder, 12 Sep): the label's own word may stand
 * as the employer — „if that is not a private thing".
 *
 * Confirmed in one line before building, as he asked: **only the company or
 * the trade word is ever shown here, never the other words of the label.**
 *
 * Why that is safe under his condition: a second-circle row ALREADY shows the
 * whole saved label as the person's name — „მერი ჩაჩანიძე TBC Capital" is on
 * the screen either way. Lifting „TBC Capital" out of it and calling it the
 * employer discloses nothing the reader could not already read. What must
 * never happen is the opposite — the REST of the label travelling into a field
 * nobody asked for — so every token is classified and only two kinds survive:
 *
 *   organisation → employer      („TBC Capital", „ასოციაცია")
 *   trade / profession → title   („ელექტრიკოსი", „ადვოკატი")
 *
 * and name, surname, relation („მეზობელი"), place („ბათუმი") and bare role
 * words are dropped. The classifier is `classifyToken` — the same one the
 * target engine reads labels with, not a second private copy of the rules.
 *
 * A confirmed public fact always wins; this runs only where the fact layer is
 * empty, which on the founder's own „TBC" and „ელექტრიკოსი" runs was 16 rows
 * out of 16.
 */

/** One switch back to the old behaviour if the week wants it (deploy freeze). */
const LABEL_ROLES_OFF = process.env.LABEL_ROLES === 'off';

/**
 * How many different people in the base must carry a word before it may be
 * called somebody's employer. `classifyToken` calls every word it cannot place
 * an "organisation" — which is right for a trigger and far too loose for a
 * field on the screen, because a first name the Georgian list happens not to
 * hold lands there too. Counted live on 12 Sep: tbc 6,369 phones, insurance
 * 441, capital 375 — and „mehmeti", a name, 2. Forty separates them with room
 * to spare.
 */
const ORG_SIZE_MIN = 40;

/**
 * Ticket 19 [8], the tester's three: „Elen", „Near", „თარგმნა and Service",
 * and „100 არა" on three contacts.
 *
 * Three things were wrong and they are separable.
 *
 * FIRST, the count was a substring count (see orgWordStats). „near" scored 43
 * out of NEAR inside other words and cleared this floor by three; counted as a
 * whole word it is 29 and does not.
 *
 * SECOND, a word can be common and still be a person. „elen" is on 112 labels
 * as a whole word — over the floor and staying over it — but it BEGINS 73 of
 * them, which is where a first name goes and not where a company does. More
 * often than not at the front of the label means it is somebody's name.
 */
const MAX_LEAD_SHARE = 0.5;

/**
 * THIRD, some words are not company words however they are counted. A bare
 * number is not an organisation — „100" is on 1,916 labels as a whole word and
 * is a flat number, a year, a price. And a conjunction or a negation is the
 * label's grammar, not its content: „არა" survives whole-word counting at 230
 * and „and" at 923, and neither has ever been anybody's employer.
 *
 * Kept short on purpose. This is not a list of words that are not companies —
 * that list is infinite. It is the handful that the counting genuinely cannot
 * reach, and every one of them was measured.
 */
const DIGITS_ONLY = /^\d+$/u;
const NEVER_A_COMPANY = new Set([
  // Conjunctions and negations: the label's grammar, not its content.
  'and',
  'or',
  'the',
  'not',
  'no',
  'none',
  'other',
  'და',
  'ან',
  'არა',
  'სხვა',
  // Ticket 19 [8], found after the first fix and worse than what was
  // reported. Of the 400 commonest tokens in the whole base, 71 classify as
  // „organisation" — and ten of those cleared the two gates above. They are
  // not companies and never were:
  //
  //   დედა / deda    23,734 carriers, lead share .47 — MOTHER
  //   მამა / mama    16,536                    .72 — father
  //   კლიენტი         9,471                    .19 — client
  //   სახლი           7,295                    .16 — house
  //   მანქანა         5,146                    .25 — car
  //   უნდა            5,920                    .05 — „wants"
  //
  // „დედა" would have been printed as somebody's EMPLOYER. It is the
  // commonest word a person writes in a phonebook and it is in none of the
  // dictionaries — see the note in TASKS.md, which is where the rest of this
  // belongs: the dictionaries also miss the trades (მძღოლი, ბუღალტერი,
  // მაკლერი) and the towns (რუსთავი, გორი, ქუთაისი), and those are shared
  // with the target engine, so they are measured before they are moved.
  //
  // Exact match, both scripts, the spellings people actually type. A prefix
  // rule would read „ახალგაზრდული ასოციაცია" as „new" and drop half a real
  // company's name.
  'დედა',
  'deda',
  'მამა',
  'mama',
  'ბებო',
  'bebo',
  'ბებია',
  'bebia',
  'ჩემი',
  'chemi',
  'კლიენტი',
  'klienti',
  'სახლი',
  'saxli',
  'sakhli',
  'მანქანა',
  'manqana',
  'mankana',
  'ახალი',
  'axali',
  'akhali',
  'უნდა',
  'unda',
  'new',
]);

/**
 * Ticket 19 [8] found these words; Ticket 20 row 8 moved them.
 *
 * They lived here for four hours because putting them in the shared
 * dictionaries changed WHO GETS INVITED — „ნათია ბუღალტერი" stopped being a
 * full name and left the target list, and so did „Gia Gldani". Three
 * target-engine tests went red and were right to. That is a product decision,
 * not a side effect of a display fix, so it was put to the founder.
 *
 * He ruled on 16 September: yes, a label is not a name, and an invitation built
 * on one would address the person wrongly. So the words are in
 * labelDictionaries now, read by classifyToken for both consumers, and the
 * private copies are gone rather than left here to drift against them.
 */
/**
 * `NOT_A_WORD` is read here too, and the private copy of `undefined` that used
 * to sit in NEVER_A_COMPANY is gone.
 *
 * It was in this file and nowhere else, so the employer FIELD was protected
 * from „Undefined" and the target ENGINE was not — `classifyToken` went on
 * calling it an organisation for all 42,694 people who carry it. That is the
 * exact split the 16 September ruling ended for the other words, reappearing
 * for this one. One list now, read from both sides.
 */
function cannotBeACompany(token: string): boolean {
  return DIGITS_ONLY.test(token) || NEVER_A_COMPANY.has(token) || NOT_A_WORD.has(token);
}

/** Does the crowd say this word is a company rather than a person? */
function crowdSaysCompany(stat: OrgWordStat | undefined): boolean {
  if (stat === undefined) return false;
  return stat.carriers >= ORG_SIZE_MIN && stat.leadShare <= MAX_LEAD_SHARE;
}
/** Words asked about in one read. Above this the count query is the search's cost, not a detail. */
const MAX_WORDS_ASKED = 40;
/** A field on a row is a couple of words; more than this is the label leaking. */
const MAX_FIELD_WORDS = 4;

const DICTIONARY_ORG = [...ORGANISATION_WORDS, ...COMPANY_MARKERS].map((w) => w.toLowerCase());

/**
 * Words that are an organisation whatever else they look like.
 *
 * `classifyToken` asks the surname endings before it gives up, and Georgian
 * organisation words end exactly like surnames — „ასოციაცია", „კავშირი",
 * „სამსახური" all carry „ია"/„ური". Read in that order „ახალგაზრდული
 * ასოციაცია" comes back as somebody's family name. These are the ones the
 * dictionary is certain about, so they are asked first here. The rest of
 * COMPANY_MARKERS is not: „inc" sits inside ordinary words, and a marker is
 * only trusted once the classifier has already said organisation.
 */
const CERTAIN_ORG = [...ORGANISATION_WORDS, 'შპს'].map((w) => w.toLowerCase());

/** A word the dictionaries already know is an organisation — no count needed. */
function knownOrganisation(token: string): boolean {
  return DICTIONARY_ORG.some((w) => token.includes(w));
}

function certainOrganisation(token: string): boolean {
  return CERTAIN_ORG.some((w) => token.includes(w));
}

export interface LabelRoleInput {
  /** The row's displayed label, exactly as the network wrote it. */
  readonly label: string | null | undefined;
  /** True when a confirmed fact already gave the employer — then it is not touched. */
  readonly hasEmployer: boolean;
  /** True when a confirmed fact already gave the title. */
  readonly hasTitle: boolean;
}

export interface LabelRoles {
  /** The company words of the label, in the label's own order and spelling. */
  readonly employer?: string;
  /** The trade or profession word of the label. */
  readonly title?: string;
}

interface Candidate {
  readonly raw: string;
  readonly lower: string;
  readonly kind: 'employer' | 'title';
  /** An organisation word no dictionary knows needs the crowd count first. */
  readonly needsCount: boolean;
}

function candidatesIn(label: string, wantEmployer: boolean, wantTitle: boolean): Candidate[] {
  const out: Candidate[] = [];
  labelTokens(label).forEach((token, index) => {
    const kind = classifyToken(token.lower, index === 0);
    const isTrade = kind === 'trade' || kind === 'profession_with_clients';
    if (wantTitle && isTrade) {
      out.push({ raw: token.raw, lower: token.lower, kind: 'title', needsCount: false });
    } else if (isTrade || cannotBeACompany(token.lower)) {
      // A number or a conjunction never reaches the field, counted or not.
    } else if (wantEmployer && (kind === 'organisation' || certainOrganisation(token.lower))) {
      out.push({
        raw: token.raw,
        lower: token.lower,
        kind: 'employer',
        needsCount: !knownOrganisation(token.lower),
      });
    }
  });
  return out;
}

function join(words: readonly string[]): string | undefined {
  if (words.length === 0) return undefined;
  return words.slice(0, MAX_FIELD_WORDS).join(' ');
}

/**
 * The company and trade words inside each label, for the rows a fact did not
 * already answer. Keyed by the label itself.
 *
 * One `orgSizes` read for every word of every label together. The per-word
 * shape timed the target route out once already and must not come back.
 */
/**
 * Row 108, sixth cut — a decoration may not cost more than the search.
 *
 * This is the second thing I have tried on this cost and the first one did not
 * work, so the numbers matter more than the reasoning. Caching the word counts
 * (3ba0dd3) was supposed to make `labels` collapse after the first search. It
 * did not. Live, on the build that has the cache:
 *
 *   rows 30  labels 2904 / 2071 / 4615 / 2000 / 4114 / 1786 ms
 *   rows  2  labels  505 ms
 *   rows  5  labels  595 ms
 *
 * The cost tracks the number of RESULTS, not repeated words — thirty results
 * are thirty different people with thirty different labels, and the words in
 * them mostly do not recur between searches. I predicted on the board that this
 * would halve and it did not move; the cache was the wrong instrument.
 *
 * What is true regardless of which words arrive: this is a DECORATION. It fills
 * employer and title from the row's own label where no fact answered. Paying
 * two to four and a half seconds of a seven-second search for it is a bad
 * trade at any hit rate, and the module already knows how to do without it —
 * the catch below drops every word that needed the crowd and keeps the ones the
 * dictionaries answer.
 *
 * So the wait is bounded and the degrade is the one that already existed. The
 * query is NOT cancelled when the budget runs out: it finishes in the
 * background and writes its answers into the word cache, so the next search
 * gets for nothing what this one could not wait for. That is what makes the
 * cache worth keeping after it failed on its own.
 */
const ORG_WORD_BUDGET_MS = Number(process.env.ORG_WORD_BUDGET_MS ?? 700);

function withinBudget<T>(work: Promise<T>): Promise<T> {
  // The loser keeps running on purpose (it fills the cache), so its eventual
  // rejection must not surface as an unhandled one.
  work.catch(() => undefined);
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`org word counts over ${ORG_WORD_BUDGET_MS} ms budget`)),
        ORG_WORD_BUDGET_MS,
      ).unref?.(),
    ),
  ]);
}

export async function rolesFromLabels(
  rows: readonly LabelRoleInput[],
): Promise<Map<string, LabelRoles>> {
  const out = new Map<string, LabelRoles>();
  if (LABEL_ROLES_OFF) return out;

  const byLabel = new Map<string, Candidate[]>();
  for (const row of rows) {
    if (typeof row.label !== 'string' || row.label.trim() === '') continue;
    if (row.hasEmployer && row.hasTitle) continue;
    if (byLabel.has(row.label)) continue;
    byLabel.set(row.label, candidatesIn(row.label, !row.hasEmployer, !row.hasTitle));
  }
  if (byLabel.size === 0) return out;

  const unknown = [
    ...new Set(
      [...byLabel.values()]
        .flat()
        .filter((c) => c.needsCount)
        .map((c) => c.lower),
    ),
  ].slice(0, MAX_WORDS_ASKED);

  let sizes = new Map<string, OrgWordStat>();
  if (unknown.length > 0) {
    try {
      sizes = await withinBudget(orgWordStats(unknown));
    } catch (err) {
      // No count, no guess. The dictionary words still answer; every word that
      // needed the crowd is dropped, and the row keeps the empty field it had.
      // eslint-disable-next-line no-console
      console.error('rolesFromLabels org sizes failed:', (err as Error).message);
    }
  }

  for (const [label, candidates] of byLabel) {
    const employer: string[] = [];
    const title: string[] = [];
    for (const candidate of candidates) {
      if (candidate.kind === 'title') {
        title.push(candidate.raw);
      } else if (!candidate.needsCount || crowdSaysCompany(sizes.get(candidate.lower))) {
        employer.push(candidate.raw);
      }
    }
    const roles: LabelRoles = {
      ...(join(employer) !== undefined && { employer: join(employer) }),
      ...(join(title) !== undefined && { title: join(title) }),
    };
    if (roles.employer !== undefined || roles.title !== undefined) out.set(label, roles);
  }
  return out;
}
