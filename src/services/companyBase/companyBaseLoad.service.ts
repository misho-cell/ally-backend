import { query } from '../../db/postgres/client';
import { numbersByHash } from '../axelLoad/axelBaseLoad.service';
import {
  CompanyNameRow,
  CompanyRow,
  IndustryRow,
  LinkRow,
  PublicPersonRow,
  companyNameRows,
  companyRows,
  industryRows,
  linkRows,
  publicPeopleRows,
} from './companyBasePlan';

/**
 * D847 — loads the company base, one file at a time (TECH_TASK §3: industries,
 * then companies, then names, then public people, then links). Every write is
 * an upsert by the file's own key, so a reload never doubles anything. A dry
 * run parses and counts and writes nothing.
 */
export enum CompanyBasePart {
  Industries = 'industries',
  Companies = 'companies',
  Names = 'names',
  PublicPeople = 'public_people',
  Links = 'links',
}

export interface CompanyBaseReport {
  readonly part: CompanyBasePart;
  readonly dry_run: boolean;
  readonly rows_in_file: number;
  readonly rows_written: number;
  readonly skipped: Readonly<Record<string, number>>;
}

const LOAD_QUERY_TIMEOUT_MS = 60_000;
/** Rows per statement: well under Postgres' parameter limits, few round trips. */
const BATCH_ROWS = 1_000;

function batches<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_ROWS) out.push(rows.slice(i, i + BATCH_ROWS));
  return out;
}

async function writeIndustries(rows: readonly IndustryRow[]): Promise<number> {
  for (const b of batches(rows)) {
    await query(
      `INSERT INTO company_industries (industry_id, industry, synonyms_en, synonyms_ka)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
       ON CONFLICT (industry_id) DO UPDATE SET industry = EXCLUDED.industry,
         synonyms_en = EXCLUDED.synonyms_en, synonyms_ka = EXCLUDED.synonyms_ka`,
      [
        b.map((r) => r.industryId),
        b.map((r) => r.industry),
        b.map((r) => r.synonymsEn),
        b.map((r) => r.synonymsKa),
      ],
      LOAD_QUERY_TIMEOUT_MS,
    );
  }
  return rows.length;
}

const COMPANY_COLUMNS = [
  'company_id',
  'legal_name_ka',
  'name_en',
  'brand_names',
  'country',
  'city',
  'legal_form',
  'size_band',
  'activity_code',
  'activity_ka',
  'industry_id',
  'industry_2_id',
  'what_it_does',
  'service_words',
  'website',
  'parent_group',
  'confidence',
  'search_text',
] as const;

function companyValues(r: CompanyRow): (string | null)[] {
  return [
    r.companyId,
    r.legalNameKa,
    r.nameEn,
    r.brandNames,
    r.country,
    r.city,
    r.legalForm,
    r.sizeBand,
    r.activityCode,
    r.activityKa,
    r.industryId,
    r.industry2Id,
    r.whatItDoes,
    r.serviceWords,
    r.website,
    r.parentGroup,
    r.confidence,
    r.searchText,
  ];
}

async function writeCompanies(rows: readonly CompanyRow[]): Promise<number> {
  const columns = COMPANY_COLUMNS.join(', ');
  const arrays = COMPANY_COLUMNS.map((_, i) => `$${i + 1}::text[]`).join(', ');
  const updates = COMPANY_COLUMNS.slice(1)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  for (const b of batches(rows)) {
    const values = b.map(companyValues);
    await query(
      `INSERT INTO companies (${columns})
       SELECT * FROM unnest(${arrays})
       ON CONFLICT (company_id) DO UPDATE SET ${updates}, updated_at = NOW()`,
      COMPANY_COLUMNS.map((_, i) => values.map((v) => v[i])),
      LOAD_QUERY_TIMEOUT_MS,
    );
  }
  return rows.length;
}

/** A name whose company is not loaded yet would break the foreign key; it is counted instead. */
async function knownCompanies(ids: readonly string[]): Promise<Set<string>> {
  const result = await query<{ company_id: string }>(
    'SELECT company_id FROM companies WHERE company_id = ANY($1::text[])',
    [[...new Set(ids)]],
    LOAD_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.company_id));
}

async function writeNames(rows: readonly CompanyNameRow[]): Promise<number> {
  for (const b of batches(rows)) {
    await query(
      `INSERT INTO company_names (company_id, name, name_normalised, name_latin_key, kind, strength)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (company_id, name_normalised) DO UPDATE SET name = EXCLUDED.name,
         name_latin_key = EXCLUDED.name_latin_key, kind = EXCLUDED.kind, strength = EXCLUDED.strength`,
      [
        b.map((r) => r.companyId),
        b.map((r) => r.name),
        b.map((r) => r.nameNormalised),
        b.map((r) => r.nameLatinKey),
        b.map((r) => r.kind),
        b.map((r) => r.strength),
      ],
      LOAD_QUERY_TIMEOUT_MS,
    );
  }
  return rows.length;
}

async function writePublicPeople(rows: readonly PublicPersonRow[]): Promise<number> {
  for (const b of batches(rows)) {
    await query(
      `INSERT INTO company_public_people
         (company_id, name_ka, name_latin, role, ownership_pct, current_or_former, source)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::text[], $7::text[])
       ON CONFLICT (company_id, name_latin, name_ka, role) DO UPDATE SET
         ownership_pct = EXCLUDED.ownership_pct, current_or_former = EXCLUDED.current_or_former,
         source = EXCLUDED.source`,
      [
        b.map((r) => r.companyId),
        b.map((r) => r.nameKa),
        b.map((r) => r.nameLatin),
        b.map((r) => r.role),
        b.map((r) => r.ownershipPct),
        b.map((r) => r.currentOrFormer),
        b.map((r) => r.source),
      ],
      LOAD_QUERY_TIMEOUT_MS,
    );
  }
  return rows.length;
}

interface PlacedLink extends Omit<LinkRow, 'hashes'> {
  readonly phone: string;
}

/** Each link on every number its tokens resolve to; the numbers never travel (axelBaseLoad). */
function placeLinks(
  rows: readonly LinkRow[],
  numbers: ReadonlyMap<string, string>,
  skipped: Record<string, number>,
): PlacedLink[] {
  const placed = new Map<string, PlacedLink>();
  for (const { hashes, ...link } of rows) {
    const phones = hashes.map((h) => numbers.get(h)).filter((p): p is string => !!p);
    if (phones.length === 0) skipped.number_not_found = (skipped.number_not_found ?? 0) + 1;
    for (const phone of phones) {
      // One row per (number, company, evidence, role): the table's own key.
      placed.set([phone, link.companyId, link.evidence, link.role].join('\u0000'), {
        ...link,
        phone,
      });
    }
  }
  return [...placed.values()];
}

async function writeLinks(rows: readonly PlacedLink[]): Promise<number> {
  for (const b of batches(rows)) {
    await query(
      `INSERT INTO person_company_links
         (phone, company_id, person_name, role, tie, evidence, status, savers, source)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::text[], $7::text[], $8::int[], $9::text[])
       ON CONFLICT (phone, company_id, evidence, role) DO UPDATE SET
         person_name = EXCLUDED.person_name, tie = EXCLUDED.tie, status = EXCLUDED.status,
         savers = EXCLUDED.savers, source = EXCLUDED.source`,
      [
        b.map((r) => r.phone),
        b.map((r) => r.companyId),
        b.map((r) => r.personName),
        b.map((r) => r.role),
        b.map((r) => r.tie),
        b.map((r) => r.evidence),
        b.map((r) => r.status),
        b.map((r) => r.savers),
        b.map((r) => r.source),
      ],
      LOAD_QUERY_TIMEOUT_MS,
    );
  }
  return rows.length;
}

/** Rows whose company is not loaded are counted and left out; the rest are kept. */
async function withKnownCompany<T extends { readonly companyId: string }>(
  rows: readonly T[],
  skipped: Record<string, number>,
): Promise<T[]> {
  const known = await knownCompanies(rows.map((r) => r.companyId));
  const kept = rows.filter((r) => known.has(r.companyId));
  if (kept.length < rows.length) skipped.company_not_loaded = rows.length - kept.length;
  return kept;
}

async function loadLinks(
  linksCsv: string,
  personNumbersCsv: string,
  dryRun: boolean,
  skipped: Record<string, number>,
): Promise<{ inFile: number; written: number }> {
  const { rows, withoutNumber } = linkRows(linksCsv, personNumbersCsv);
  if (withoutNumber > 0) skipped.person_without_number = withoutNumber;
  const placed = placeLinks(await withKnownCompany(rows, skipped), await numbersByHash(), skipped);
  return {
    inFile: rows.length + withoutNumber,
    written: dryRun ? placed.length : await writeLinks(placed),
  };
}

export async function loadCompanyBasePart(
  part: CompanyBasePart,
  csv: string,
  dryRun: boolean,
  personNumbersCsv = '',
): Promise<CompanyBaseReport> {
  const skipped: Record<string, number> = {};
  const report = (inFile: number, written: number): CompanyBaseReport => ({
    part,
    dry_run: dryRun,
    rows_in_file: inFile,
    rows_written: written,
    skipped,
  });
  switch (part) {
    case CompanyBasePart.Industries: {
      const rows = industryRows(csv);
      return report(rows.length, dryRun ? rows.length : await writeIndustries(rows));
    }
    case CompanyBasePart.Companies: {
      const rows = companyRows(csv);
      return report(rows.length, dryRun ? rows.length : await writeCompanies(rows));
    }
    case CompanyBasePart.Names: {
      const all = companyNameRows(csv);
      const rows = await withKnownCompany(all, skipped);
      return report(all.length, dryRun ? rows.length : await writeNames(rows));
    }
    case CompanyBasePart.PublicPeople: {
      const all = publicPeopleRows(csv);
      const rows = await withKnownCompany(all, skipped);
      return report(all.length, dryRun ? rows.length : await writePublicPeople(rows));
    }
    case CompanyBasePart.Links: {
      const { inFile, written } = await loadLinks(csv, personNumbersCsv, dryRun, skipped);
      return report(inFile, written);
    }
  }
}
