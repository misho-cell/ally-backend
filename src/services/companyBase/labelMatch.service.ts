import { query } from '../../db/postgres/client';
import { readPhonebooks, readRoster } from '../axelExport/axelData';
import { normalizePhone } from '../phone';
import { buildNameIndex, companiesInLabel, labelLinkStatus, NameRow } from './labelCompanyMatch';

/**
 * D847 trigger 1 (TECH_TASK_COMPANY_BASE §5): the members' phonebook labels
 * matched against the name index. A company named in labels by two or more
 * different members is a confirmed link; by one, a possible one — that saver's
 * own knowledge, never said to anyone else (§4). Re-runnable: each run
 * replaces the label links it wrote before.
 */
export const LABEL_EVIDENCE = 'phone label';

const MATCH_QUERY_TIMEOUT_MS = 60_000;
const BATCH_ROWS = 1_000;
/** One label quoted as the link's detail is enough; the savers count says the rest. */
const MAX_DETAIL_CHARS = 120;

export interface LabelMatchReport {
  readonly dry_run: boolean;
  readonly labels_read: number;
  readonly links: number;
  readonly confirmed: number;
  readonly possible: number;
}

interface LabelLink {
  readonly phone: string;
  readonly companyId: string;
  readonly savers: number;
  readonly detail: string;
}

async function readNameIndex(): Promise<ReturnType<typeof buildNameIndex>> {
  const result = await query<{ company_id: string; name_normalised: string; strength: string }>(
    'SELECT company_id, name_normalised, strength FROM company_names',
    [],
    MATCH_QUERY_TIMEOUT_MS,
  );
  const rows: NameRow[] = result.rows.map((r) => ({
    companyId: r.company_id,
    nameNormalised: r.name_normalised,
    strength: r.strength,
  }));
  return buildNameIndex(rows);
}

/** The members whose phonebooks the base reads: the roster, as the Axel export reads it. */
async function memberIds(): Promise<number[]> {
  const roster = await readRoster();
  return roster.map((m) => m.user_id).filter((id): id is number => id !== null);
}

/** (number, company) → the distinct members whose label for that number names the company. */
function labelLinks(
  rows: readonly { owner_id: number; contact_digits: string; label: string | null }[],
  index: ReturnType<typeof buildNameIndex>,
): LabelLink[] {
  const savers = new Map<string, { owners: Set<number>; detail: string }>();
  for (const row of rows) {
    const label = row.label?.trim() ?? '';
    if (label === '') continue;
    for (const companyId of companiesInLabel(label, index)) {
      const key = `${normalizePhone(row.contact_digits)}\u0000${companyId}`;
      const entry = savers.get(key) ?? {
        owners: new Set<number>(),
        detail: label.slice(0, MAX_DETAIL_CHARS),
      };
      entry.owners.add(row.owner_id);
      savers.set(key, entry);
    }
  }
  return [...savers.entries()].map(([key, v]) => {
    const [phone, companyId] = key.split('\u0000');
    return { phone, companyId, savers: v.owners.size, detail: v.detail };
  });
}

async function replaceLabelLinks(links: readonly LabelLink[]): Promise<void> {
  await query(
    'DELETE FROM person_company_links WHERE evidence = $1',
    [LABEL_EVIDENCE],
    MATCH_QUERY_TIMEOUT_MS,
  );
  for (let i = 0; i < links.length; i += BATCH_ROWS) {
    const b = links.slice(i, i + BATCH_ROWS);
    await query(
      `INSERT INTO person_company_links
         (phone, company_id, tie, evidence, status, savers, source)
       SELECT p, c, 'saved with company name', $5, s, n, d
         FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $6::text[]) AS t(p, c, n, d, s)
       ON CONFLICT (phone, company_id, evidence, role) DO UPDATE SET
         status = EXCLUDED.status, savers = EXCLUDED.savers, source = EXCLUDED.source`,
      [
        b.map((l) => l.phone),
        b.map((l) => l.companyId),
        b.map((l) => l.savers),
        b.map((l) => l.detail),
        LABEL_EVIDENCE,
        b.map((l) => labelLinkStatus(l.savers)),
      ],
      MATCH_QUERY_TIMEOUT_MS,
    );
  }
}

export async function matchMemberLabels(dryRun: boolean): Promise<LabelMatchReport> {
  const [index, ids] = await Promise.all([readNameIndex(), memberIds()]);
  // An empty name index would replace every label link with none.
  if (index.size === 0)
    return { dry_run: dryRun, labels_read: 0, links: 0, confirmed: 0, possible: 0 };
  const rows = await readPhonebooks(ids);
  const links = labelLinks(rows, index);
  if (!dryRun) await replaceLabelLinks(links);
  const confirmed = links.filter((l) => labelLinkStatus(l.savers) === 'confirmed').length;
  return {
    dry_run: dryRun,
    labels_read: rows.length,
    links: links.length,
    confirmed,
    possible: links.length - confirmed,
  };
}

/** Imports come in bursts; the match runs once, this long after the first of them. */
export const MATCH_AFTER_IMPORT_MS = 10 * 60 * 1000;
let matchPending = false;

/**
 * Trigger 1 (TECH_TASK §5): a phonebook was imported, so the labels may name
 * companies they did not before. One run per burst of imports; a failure is
 * logged and the next import tries again.
 */
export function scheduleLabelMatchAfterImport(): void {
  if (matchPending) return;
  matchPending = true;
  setTimeout(() => {
    matchPending = false;
    matchMemberLabels(false)
      .then((report) => {
        // eslint-disable-next-line no-console
        console.log(
          `[company-labels] after import: ${report.links} links (${report.confirmed} confirmed)`,
        );
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[company-labels] match after import failed:', (err as Error).message);
      });
  }, MATCH_AFTER_IMPORT_MS).unref();
}
