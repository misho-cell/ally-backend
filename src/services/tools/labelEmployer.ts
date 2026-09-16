import { classifyToken, labelTokens, orgWordStats, OrgWordStat } from '../labelReader.service';
import { COMPANY_MARKERS, ORGANISATION_WORDS } from '../labelDictionaries';

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
  // Not a word at all: 42,694 labels carry it because something wrote it there.
  'undefined',
]);

/**
 * Ticket 19 [8], the audit of 16 September, and why these words are HERE and
 * not in labelDictionaries.
 *
 * I ran the 400 commonest whole-word tokens in the base through the real
 * pipeline. Thirty-four would be printed as somebody's EMPLOYER. Eight of them
 * are trades, four are relations, four are places and two are car parts — all
 * missing for the same reason „Elektrikosi" was: the Georgian word is in the
 * shared dictionaries and the Latin spelling people actually type is not.
 *
 * Putting them in the shared dictionaries is the tidy answer and it is the
 * wrong one. Those dictionaries are read by the TARGET engine too, and adding
 * them changed WHO GETS INVITED: „ნათია ბუღალტერი" stopped being a full name
 * and left the invite list, and so did „Gia Gldani". Both of those reads are
 * more correct than what they replace — but who the product invites is a
 * product decision and not a side effect of a display fix. Three target tests
 * caught it, which is what they are for.
 *
 * So the same words, scoped to this file, where they only decide what is shown
 * in `employer` and `jobPosition`. Moving them into the shared dictionaries is
 * written up for whoever owns the invite list.
 *
 * Each entry is a prefix, matched the way the shared dictionaries are matched,
 * and carries its measured cost: how many people the substring wrongly catches
 * inside a LARGER word.
 */
const LOCAL_TRADES = [
  'მძღოლ',
  'mdzgoli', //     7,937 driver        +156 (2%)
  'ბუღალტერ',
  'bugalter', //    6,557 accountant    +542 (8%)
  'დაცვ',
  'dacva', //       5,358 security      +921 (15%)
  'მაკლერ',
  'makleri', //     4,878 broker        +119 (2%)
  'ტაქსი',
  'taqsi', //       4,151 taxi          +246 (6%)
  'taksi',
  'მალიარ',
  'maliari', //     4,054 plasterer      +48 (1%)
  'პრორაბ',
  'prarabi', //     2,852 foreman        +45 (2%)
  'prorabi',
  'მკერავ',
  'mkeravi', //     2,499 tailor         +65 (3%)
];

/**
 * Not a company: a place, a relation or a thing. Dropped rather than shown.
 *
 * NOT here, and this is what measuring bought: „gori" is inside „grigori", a
 * first name — 3,440 of its 7,716 carriers (45%) are the word stuck inside
 * another one. The same for dzia (51%), didi (52%), bagi (32%), aveji (24%),
 * lilo (17% on four characters) and gazi (74% — „magazia" is a shop). A
 * substring rule cannot hold a short word however common it is, so those seven
 * stay wrong for now and are named in TASKS.md rather than quietly guessed at.
 */
const LOCAL_NOT_A_COMPANY = [
  // Places. „ქუთაისი" was in the shared list twice, as Georgian and as
  // `kutaisi`, and still missed `qutaisi` — ქ is written both ways.
  'rustavi', //     4,767  +696 (13%)
  'qutaisi', //     4,144  +466 (10%)
  'დიღომი',
  'digomi', //      3,874  +229 (6%)
  'გლდანი',
  'gldani', //      3,326  +610 (16%)
  // Relations. The Georgian spellings are already shared; the Latin ones were
  // nowhere, and „klaseli" was in neither script.
  'natlia', //      4,642  +313 (6%)
  'bicola', //      3,700  +237 (6%)
  'კლასელ',
  'klaseli', //     3,254  +381 (10%)
  // Car parts read as a company name.
  'დაშლილები',
  'dashlilebi', //  3,386   +40 (1%)
  'ნაწილები',
  'nawilebi', //    2,917  +197 (6%)
];

function matchesLocal(token: string, words: readonly string[]): boolean {
  return words.some((w) => token.includes(w));
}

function cannotBeACompany(token: string): boolean {
  return (
    DIGITS_ONLY.test(token) ||
    NEVER_A_COMPANY.has(token) ||
    matchesLocal(token, LOCAL_NOT_A_COMPANY)
  );
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
    const isTrade =
      kind === 'trade' ||
      kind === 'profession_with_clients' ||
      matchesLocal(token.lower, LOCAL_TRADES);
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
      sizes = await orgWordStats(unknown);
    } catch (err) {
      // No count, no guess. The dictionary words still answer; every word that
      // needed the crowd is dropped, and the row keeps the empty field it had.
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
