import { csvRecords } from '../axelLoad/axelBasePlan';

/**
 * D847 — the company base (TECH_TASK_COMPANY_BASE, Tornike's Claude, 20 Oct;
 * Misho's word 21 Oct). Pure: the package's company files become the rows the
 * loader writes. Nothing here reads or writes the database.
 */

type Row = Readonly<Record<string, string>>;

/** A column of any text file stays inside this, so a wrong file cannot write a novel. */
const MAX_FIELD_CHARS = 2_000;
const HASH_RE = /^[0-9a-f]{24}$/u;
/** The ties the Axel package itself calls loadable (axelBasePlan's LOADABLE_TIES). */
const LOADABLE_TIES: ReadonlySet<string> = new Set(['roster', 'roster — likely', 'strong']);

export enum LinkStatus {
  Confirmed = 'confirmed',
  Possible = 'possible',
}
const STATUSES: ReadonlySet<string> = new Set(Object.values(LinkStatus));

export interface IndustryRow {
  readonly industryId: string;
  readonly industry: string;
  readonly synonymsEn: string;
  readonly synonymsKa: string;
}

export interface CompanyRow {
  readonly companyId: string;
  readonly legalNameKa: string;
  readonly nameEn: string;
  readonly brandNames: string;
  readonly country: string;
  readonly city: string;
  readonly legalForm: string;
  readonly sizeBand: string;
  readonly activityCode: string;
  readonly activityKa: string;
  readonly industryId: string | null;
  readonly industry2Id: string | null;
  readonly whatItDoes: string;
  readonly serviceWords: string;
  readonly website: string;
  readonly parentGroup: string;
  readonly confidence: string;
  readonly searchText: string;
}

export interface CompanyNameRow {
  readonly companyId: string;
  readonly name: string;
  readonly nameNormalised: string;
  readonly nameLatinKey: string;
  readonly kind: string;
  readonly strength: string;
}

export interface PublicPersonRow {
  readonly companyId: string;
  readonly nameKa: string;
  readonly nameLatin: string;
  readonly role: string;
  readonly ownershipPct: string;
  readonly currentOrFormer: string;
  readonly source: string;
}

/** A tie of one of our people to a company, before the server finds the number. */
export interface LinkRow {
  /** The package's person key: one person may hold many links. */
  readonly personKey: string;
  readonly hashes: readonly string[];
  readonly companyId: string;
  readonly personName: string;
  readonly role: string;
  readonly tie: string;
  readonly evidence: string;
  readonly status: LinkStatus;
  readonly savers: number;
  readonly source: string;
}

function cut(value: string | undefined): string {
  return (value ?? '').slice(0, MAX_FIELD_CHARS);
}

function orNull(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  return v === '' ? null : v;
}

export function industryRows(csv: string): IndustryRow[] {
  return csvRecords(csv)
    .filter((r) => (r.industry_id ?? '') !== '')
    .map((r) => ({
      industryId: r.industry_id,
      industry: cut(r.industry),
      synonymsEn: cut(r.synonyms_en),
      synonymsKa: cut(r.synonyms_ka),
    }));
}

/** The meaning match reads one lower-case text: names, brands, what it does, its words, its activity. */
export function searchTextOf(r: Row): string {
  return [r.name_en, r.brand_names, r.what_it_does, r.service_words, r.activity_ka, r.legal_name_ka]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' · ')
    .toLocaleLowerCase()
    .slice(0, MAX_FIELD_CHARS);
}

export function companyRows(csv: string): CompanyRow[] {
  return csvRecords(csv)
    .filter((r) => (r.company_id ?? '') !== '')
    .map((r) => ({
      companyId: r.company_id,
      legalNameKa: cut(r.legal_name_ka),
      nameEn: cut(r.name_en),
      brandNames: cut(r.brand_names),
      country: cut(r.country),
      city: cut(r.city),
      legalForm: cut(r.legal_form),
      sizeBand: cut(r.size_band),
      activityCode: cut(r.activity_code),
      activityKa: cut(r.activity_ka),
      industryId: orNull(r.industry_id),
      industry2Id: orNull(r.industry_2_id),
      whatItDoes: cut(r.what_it_does),
      serviceWords: cut(r.service_words),
      website: cut(r.website),
      parentGroup: cut(r.parent_group),
      confidence: cut(r.confidence),
      searchText: searchTextOf(r),
    }));
}

export function companyNameRows(csv: string): CompanyNameRow[] {
  return csvRecords(csv)
    .filter((r) => (r.company_id ?? '') !== '' && (r.name_normalised ?? '') !== '')
    .map((r) => ({
      companyId: r.company_id,
      name: cut(r.name),
      nameNormalised: cut(r.name_normalised),
      nameLatinKey: cut(r.name_latin_key),
      kind: cut(r.kind),
      strength: r.strength === 'strong' ? 'strong' : 'weak',
    }));
}

/**
 * The register's and public pages' roles (sheet 2). A row with no role is one of
 * our people's jobs, which arrives through the links file instead.
 */
export function publicPeopleRows(csv: string): PublicPersonRow[] {
  return csvRecords(csv)
    .filter((r) => (r.company_id ?? '') !== '' && (r.role ?? '').trim() !== '')
    .filter((r) => (r.person_name_latin ?? '') !== '' || (r.person_name_georgian ?? '') !== '')
    .map((r) => ({
      companyId: r.company_id,
      nameKa: cut(r.person_name_georgian),
      nameLatin: cut(r.person_name_latin),
      role: cut(r.role),
      ownershipPct: cut(r.ownership_pct),
      currentOrFormer: cut(r.current_or_former),
      source: cut(r.source),
    }));
}

/** person key → its loadable number tokens, from the Axel package's person_numbers.csv. */
export function tokensByPerson(personNumbersCsv: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of csvRecords(personNumbersCsv)) {
    const hash = (r.number_hash ?? '').toLowerCase();
    if (!LOADABLE_TIES.has(r.tie ?? '') || !HASH_RE.test(hash)) continue;
    out.set(r.person_key, [...(out.get(r.person_key) ?? []), hash]);
  }
  return out;
}

/** People the Axel package ties to a number only weakly: a name, no second signal. */
export function weaklyTiedPeople(personNumbersCsv: string): Set<string> {
  const weak = new Set<string>();
  for (const r of csvRecords(personNumbersCsv)) {
    if (!LOADABLE_TIES.has(r.tie ?? '')) weak.add((r.person_key ?? '').trim());
  }
  return weak;
}

/**
 * The links, each with the number tokens it can sit on: the key itself when it
 * is a token, else the person's loadable tokens. #7525 (Misho, 29 Oct: „make a
 * new list"): a person the package never tied to a number keeps the link with
 * no token, for the loader to place by the name members saved them under. A
 * person tied only weakly stays out (tester, 29 Oct: skipping those is right).
 */
export function linkRows(
  linksCsv: string,
  personNumbersCsv: string,
): { rows: LinkRow[]; weaklyTied: number } {
  const tokens = tokensByPerson(personNumbersCsv);
  const weak = weaklyTiedPeople(personNumbersCsv);
  const rows: LinkRow[] = [];
  let weaklyTied = 0;
  for (const r of csvRecords(linksCsv)) {
    const key = (r.person_key ?? '').trim();
    if (key === '' || (r.company_id ?? '') === '' || !STATUSES.has(r.status ?? '')) continue;
    const hashes = HASH_RE.test(key.toLowerCase()) ? [key.toLowerCase()] : (tokens.get(key) ?? []);
    if (hashes.length === 0 && weak.has(key)) {
      weaklyTied += 1;
      continue;
    }
    rows.push({
      personKey: key,
      hashes,
      companyId: r.company_id,
      personName: cut(r.person_name),
      role: cut(r.role),
      tie: cut(r.tie),
      evidence: cut(r.evidence),
      status: r.status as LinkStatus,
      savers: Number.parseInt(r.savers ?? '', 10) || 0,
      source: cut(r.source),
    });
  }
  return { rows, weaklyTied };
}
