import { classifyToken, labelTokens, orgSizes } from '../labelReader.service';
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
    if (wantTitle && (kind === 'trade' || kind === 'profession_with_clients')) {
      out.push({ raw: token.raw, lower: token.lower, kind: 'title', needsCount: false });
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

  let sizes = new Map<string, number>();
  if (unknown.length > 0) {
    try {
      sizes = await orgSizes(unknown);
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
      } else if (!candidate.needsCount || (sizes.get(candidate.lower) ?? 0) >= ORG_SIZE_MIN) {
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
