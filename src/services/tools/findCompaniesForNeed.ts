import { query } from '../../db/postgres/client';
import { ContactExclusion, fetchExclusionsForPhones } from './contactExclusions';
import { phoneDigits } from '../phone';

/**
 * D847 — „I need transportation in Kazakhstan": a need, not a company name
 * (TECH_TASK_COMPANY_BASE §6). The need's words pick one or two industries,
 * the companies in them are ranked by how many of the words their own
 * description carries, and each company comes with the people tied to it and
 * its public directors. Only CONFIRMED links are shown; a „possible" link is
 * one person's label or a name-only register match and is never said (§4).
 * The warm way to each person is the existing find_warm_path, by phone id.
 */

const COMPANY_QUERY_TIMEOUT_MS = 8_000;
/** Shorter words match too much of any description. */
const MIN_WORD_CHARS = 3;
const MAX_NEED_WORDS = 12;
const MAX_INDUSTRIES = 2;
const MAX_COMPANIES = 8;
const MAX_PEOPLE_PER_COMPANY = 4;
const MAX_PUBLIC_ROLES_PER_COMPANY = 3;
/** The base's size bands (companies.size_band); anything else is no filter. */
export enum CompanySize {
  Large = 'large',
  Medium = 'medium',
}
/** #7525 (founder D879): a role is matched inside the stored one: „director" in „Finance Director". */
const MAX_ROLE_CHARS = 40;
/** A Georgian word's case ending is dropped before matching: ტრანსპორტით → ტრანსპორტ. */
const GEORGIAN_ENDING = /(ის|ში|ზე|ით|ად|ს|მ|ი|ა|ე|ო)$/u;

export interface IndustryWords {
  readonly industryId: string;
  readonly words: readonly string[];
}

/**
 * Words every company description could carry: „big Georgian companies"
 * names no trade, and matching „companies" ranked strangers above the
 * companies where the user has people (#7525).
 */
const WORDS_NAMING_NO_TRADE: ReadonlySet<string> = new Set([
  'company',
  'companies',
  'firm',
  'firms',
  'business',
  'businesses',
  'big',
  'large',
  'georgian',
  'კომპანი',
  'კომპანიებ',
  'ფირმ',
  'ბიზნეს',
  'დიდ',
  'მსხვილ',
  'ქართულ',
]);

/** Every word of the need, lower case, case endings off, the short ones dropped. */
function allNeedWords(need: string): string[] {
  const words = need
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => (/[ა-ჿ]/u.test(w) ? w.replace(GEORGIAN_ENDING, '') : w))
    .filter((w) => w.length >= MIN_WORD_CHARS);
  return [...new Set(words)].slice(0, MAX_NEED_WORDS);
}

/** The need's words that can name a trade. */
export function needWords(need: string): string[] {
  return allNeedWords(need).filter((w) => !WORDS_NAMING_NO_TRADE.has(w));
}

/** An industry's synonyms as single lower-case words, both languages. */
export function industryWords(synonymsEn: string, synonymsKa: string, name: string): string[] {
  return [...new Set(`${name};${synonymsEn};${synonymsKa}`.toLocaleLowerCase().split(/[;,/]+/u))]
    .map((w) => w.trim())
    .filter((w) => w.length >= MIN_WORD_CHARS);
}

/**
 * The one or two industries the need is about: those whose synonyms share the
 * most words with it. A synonym matches a need word when either holds the
 * other („logistic" in „logistics", „transport" in „transportation").
 */
export function industriesForNeed(
  words: readonly string[],
  industries: readonly IndustryWords[],
): string[] {
  const scored = industries
    .map((ind) => ({
      id: ind.industryId,
      score: words.filter((w) => ind.words.some((s) => s.includes(w) || w.includes(s))).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_INDUSTRIES).map((s) => s.id);
}

/** A need word that names a country the base holds is the place, not the trade. */
export function countryInNeed(words: readonly string[], countries: readonly string[]): string {
  const lower = countries.map((c) => c.toLocaleLowerCase());
  return lower.find((c) => words.some((w) => c.startsWith(w) || w.startsWith(c))) ?? '';
}

/** Who and what the search is narrowed to, beyond the need's own words. */
export interface CompanyFilter {
  readonly country: string;
  readonly city: string;
  readonly size: CompanySize | '';
  readonly role: string;
}

/** A size the base knows, or no filter. */
export function sizeFilter(value: string): CompanySize | '' {
  const v = value.trim().toLowerCase();
  return v === CompanySize.Large || v === CompanySize.Medium ? v : '';
}

/** A role to look for, as a LIKE fragment with its wildcards escaped; '' for none. */
export function roleFilter(value: string): string {
  return value
    .trim()
    .slice(0, MAX_ROLE_CHARS)
    .replace(/[\\%_]/gu, (c) => `\\${c}`);
}

interface IndustryRow {
  readonly industry_id: string;
  readonly industry: string;
  readonly synonyms_en: string;
  readonly synonyms_ka: string;
}

interface CompanyHit {
  readonly company_id: string;
  readonly name_en: string;
  readonly legal_name_ka: string;
  readonly what_it_does: string;
  readonly industry_id: string | null;
  readonly country: string;
  readonly city: string;
  readonly website: string;
  readonly size_band: string;
  readonly hits: number;
  readonly people: number;
}

interface PersonHit {
  readonly company_id: string;
  readonly phone: string;
  readonly person_name: string;
  readonly role: string;
  readonly tie: string;
  readonly evidence: string;
}

interface PublicRole {
  readonly company_id: string;
  readonly name_ka: string;
  readonly name_latin: string;
  readonly role: string;
}

async function readIndustries(): Promise<IndustryWords[]> {
  const result = await query<IndustryRow>(
    'SELECT industry_id, industry, synonyms_en, synonyms_ka FROM company_industries LIMIT 200',
    [],
    COMPANY_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => ({
    industryId: r.industry_id,
    words: industryWords(r.synonyms_en, r.synonyms_ka, r.industry),
  }));
}

async function readCountries(): Promise<string[]> {
  const result = await query<{ country: string }>(
    "SELECT DISTINCT country FROM companies WHERE country <> '' LIMIT 300",
    [],
    COMPANY_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.country);
}

/**
 * The companies in those industries (or, with none, any company whose
 * description carries the words), in that place and size, most words first,
 * then the ones holding the role asked for, then the ones with our people.
 * With a size or a role asked for, a need whose words match nothing still
 * lists companies („CFOs of big Georgian companies").
 */
const COMPANIES_SQL = `WITH scored AS (
   SELECT c.company_id, c.name_en, c.legal_name_ka, c.what_it_does, c.industry_id,
          c.country, c.city, c.website, c.size_band,
          (SELECT count(*) FROM unnest($2::text[]) w
            WHERE c.search_text LIKE '%' || w || '%')::int AS hits,
          (SELECT count(*) FROM person_company_links l
            WHERE l.company_id = c.company_id AND l.status = 'confirmed')::int AS people,
          ($7 <> '' AND (
             EXISTS (SELECT 1 FROM person_company_links l WHERE l.company_id = c.company_id
                       AND l.status = 'confirmed' AND l.role ILIKE '%' || $7 || '%')
             OR EXISTS (SELECT 1 FROM company_public_people p WHERE p.company_id = c.company_id
                       AND p.current_or_former <> 'former' AND p.role ILIKE '%' || $7 || '%')
          )) AS holds_role
     FROM companies c
    WHERE (cardinality($1::text[]) = 0 OR c.industry_id = ANY($1) OR c.industry_2_id = ANY($1))
      AND ($3 = '' OR c.country ILIKE $3)
      AND ($4 = '' OR c.city ILIKE $4 || '%')
      AND ($6 = '' OR c.size_band = $6))
 SELECT * FROM scored
  WHERE (cardinality($1::text[]) > 0 OR hits > 0 OR $6 <> '' OR $7 <> '')
    AND ($7 = '' OR holds_role)
  ORDER BY hits DESC, holds_role DESC, people DESC, company_id
  LIMIT $5`;

async function readCompanies(
  industryIds: readonly string[],
  words: readonly string[],
  filter: CompanyFilter,
): Promise<CompanyHit[]> {
  const result = await query<CompanyHit>(
    COMPANIES_SQL,
    [
      industryIds,
      words,
      filter.country.toLocaleLowerCase(),
      filter.city.toLocaleLowerCase(),
      MAX_COMPANIES,
      filter.size,
      filter.role,
    ],
    COMPANY_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function readPeople(companyIds: readonly string[], role: string): Promise<PersonHit[]> {
  const result = await query<PersonHit>(
    `SELECT company_id, phone, person_name, role, tie, evidence
       FROM person_company_links
      WHERE company_id = ANY($1::text[]) AND status = 'confirmed'
      ORDER BY company_id, ($2 <> '' AND role ILIKE '%' || $2 || '%') DESC,
               (tie = 'current') DESC, person_name
      LIMIT 200`,
    [companyIds, role],
    COMPANY_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function readPublicRoles(companyIds: readonly string[], role: string): Promise<PublicRole[]> {
  const result = await query<PublicRole>(
    `SELECT company_id, name_ka, name_latin, role
       FROM company_public_people
      WHERE company_id = ANY($1::text[]) AND current_or_former <> 'former'
      ORDER BY company_id, ($2 <> '' AND role ILIKE '%' || $2 || '%') DESC,
               (role ILIKE 'director%' OR role ILIKE 'ceo%') DESC
      LIMIT 200`,
    [companyIds, role],
    COMPANY_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

export interface CompanyPerson {
  readonly name: string;
  readonly role: string;
  readonly tie: string;
  readonly phone: string;
  readonly excluded?: readonly ContactExclusion[];
}

export interface CompanyResult {
  readonly company_id: string;
  readonly name: string;
  readonly what_it_does: string;
  readonly industry: string | null;
  readonly place: string;
  readonly size: string;
  readonly website: string;
  readonly people: readonly CompanyPerson[];
  readonly public_roles: readonly string[];
}

export interface FindCompaniesResult {
  readonly industries: readonly string[];
  readonly country: string;
  readonly companies: readonly CompanyResult[];
  readonly note: string;
}

const NOTE =
  'Each person here works or worked at the company (confirmed). For the warm way to one, call ' +
  'find_warm_path with their phone. A company with no people has no warm path yet: name it and ' +
  'its public director, and say so plainly.';

function companyResult(
  c: CompanyHit,
  people: readonly PersonHit[],
  roles: readonly PublicRole[],
  exclusions: ReadonlyMap<string, ContactExclusion[]>,
): CompanyResult {
  return {
    company_id: c.company_id,
    name: c.name_en || c.legal_name_ka,
    what_it_does: c.what_it_does,
    industry: c.industry_id,
    place: [c.city, c.country].filter((p) => p !== '').join(', '),
    size: c.size_band,
    website: c.website,
    people: people
      .filter((p) => p.company_id === c.company_id)
      .slice(0, MAX_PEOPLE_PER_COMPANY)
      .map((p) => {
        const excluded = exclusions.get(phoneDigits(p.phone));
        return {
          name: p.person_name,
          role: p.role,
          tie: p.tie,
          phone: p.phone,
          ...(excluded !== undefined && { excluded }),
        };
      }),
    public_roles: roles
      .filter((r) => r.company_id === c.company_id)
      .slice(0, MAX_PUBLIC_ROLES_PER_COMPANY)
      .map((r) => `${r.name_latin || r.name_ka} — ${r.role}`),
  };
}

export async function findCompaniesForNeed(
  userId: string,
  need: string,
  countryGiven = '',
  city = '',
  size = '',
  role = '',
): Promise<FindCompaniesResult> {
  const words = needWords(need);
  const [industries, countries] = await Promise.all([readIndustries(), readCountries()]);
  const industryIds = industriesForNeed(words, industries);
  const filter: CompanyFilter = {
    country: countryGiven.trim() || countryInNeed(allNeedWords(need), countries),
    city: city.trim(),
    size: sizeFilter(size),
    role: roleFilter(role),
  };
  const companies = await readCompanies(industryIds, words, filter);
  const ids = companies.map((c) => c.company_id);
  const [people, roles] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([readPeople(ids, filter.role), readPublicRoles(ids, filter.role)]);
  const exclusions = await fetchExclusionsForPhones(
    userId,
    people.map((p) => p.phone),
  );
  return {
    industries: industryIds,
    country: filter.country,
    companies: companies.map((c) => companyResult(c, people, roles, exclusions)),
    note: NOTE,
  };
}
