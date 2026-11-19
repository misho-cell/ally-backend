import { query } from '../../db/postgres/client';
import { joinedNetai } from '../netaiMembership';
import { georgianToLatin, latinToGeorgian } from '../tools/transliterate';
import { ResearchSubject, SubjectKind } from './deepResearch.types';

/**
 * Who one number belongs to, for research — and whether they may be researched
 * at all. Only three kinds of person are:
 *   - a Netai member: someone who joined Netai (`joinedNetai` — a legacy Ally
 *     account that never opened Netai is NOT one);
 *   - a company head a public register names, matched to our number by a
 *     confirmed link;
 *   - a person on a list Misho gave by name (APPROVED_LISTS).
 * A private contact, or a person who has removed a researched fact about
 * themselves, is never looked up.
 *
 * The context is our base only — the account's own profile, the companies a
 * link ties them to (confirmed first) — never an earlier research find, so a
 * test against what was found before measures the research and not its input.
 */

/**
 * Lists Misho gave by name, whose people may be researched though they are not
 * members: the LinkedIn 50 (his list, 18 Nov; „გაუშვი ტესტი", 19 Nov).
 * A person is on it when the list's load wrote a fact on their number.
 */
export const APPROVED_LISTS: readonly string[] = ['load-linkedin-50'];

export enum SubjectRefusal {
  PrivateContact = 'private_contact',
  RemovedByPerson = 'removed_by_person',
  NoName = 'no_name',
}

const SUBJECT_QUERY_TIMEOUT_MS = 8_000;
const MAX_COMPANIES = 5;
const MAX_NAME_CHARS = 120;
const GEORGIAN_RE = /\p{Script=Georgian}/u;
const LATIN_RE = /\p{Script=Latin}/u;

interface AccountRow {
  readonly name: string | null;
  readonly job: string | null;
  readonly employer: string | null;
  readonly city: string | null;
  readonly joined: boolean;
}

interface HeadRow {
  readonly name_ka: string;
  readonly name_latin: string;
  readonly role: string;
}

/** Pure: a name in both alphabets, the given spelling first, no repeats or blanks. */
export function nameSpellings(names: readonly string[]): string[] {
  const all = names.flatMap((raw) => {
    const name = raw.trim().slice(0, MAX_NAME_CHARS);
    if (name === '') return [];
    if (GEORGIAN_RE.test(name)) return [name, georgianToLatin(name)];
    if (LATIN_RE.test(name)) return [name, latinToGeorgian(name)];
    return [name];
  });
  const seen = new Set<string>();
  return all.filter((name) => {
    const key = name.trim().toLocaleLowerCase();
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function accountRow(phone: string): Promise<AccountRow | null> {
  const result = await query<AccountRow>(
    `SELECT u.name, u."jobPosition" AS job, u.employer, u.city, ${joinedNetai('u')} AS joined
       FROM "UserPhone" p JOIN "User" u ON u.id = p."userId"
      WHERE p.phone = $1 AND u.status = 'ACTIVE'
        AND u."deletedAt" IS NULL AND u."disabledAt" IS NULL
      LIMIT 1`,
    [phone],
    SUBJECT_QUERY_TIMEOUT_MS,
  );
  return result.rows[0] ?? null;
}

async function headRows(phone: string): Promise<HeadRow[]> {
  const result = await query<HeadRow>(
    `SELECT DISTINCT c.name_ka, c.name_latin, c.role
       FROM person_company_links l
       JOIN company_public_people c ON c.company_id = l.company_id
        AND (LOWER(c.name_latin) = LOWER(l.person_name) OR c.name_ka = l.person_name)
      WHERE l.phone = $1 AND l.status = 'confirmed'
      LIMIT $2`,
    [phone, MAX_COMPANIES],
    SUBJECT_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

async function linkedCompanies(phone: string): Promise<string[]> {
  const result = await query<{ name: string }>(
    `SELECT COALESCE(NULLIF(co.name_en, ''), co.legal_name_ka) AS name
       FROM person_company_links l JOIN companies co ON co.company_id = l.company_id
      WHERE l.phone = $1
      GROUP BY 1
      ORDER BY BOOL_OR(l.status = 'confirmed') DESC, 1
      LIMIT $2`,
    [phone, MAX_COMPANIES],
    SUBJECT_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.name).filter((name) => name.trim() !== '');
}

async function onApprovedList(phone: string): Promise<boolean> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM contact_facts
      WHERE neo4j_contact_id = $1 AND research_load = ANY($2::text[])`,
    [phone, [...APPROVED_LISTS]],
    SUBJECT_QUERY_TIMEOUT_MS,
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

async function removedByPerson(phone: string): Promise<boolean> {
  const result = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM contact_facts
      WHERE neo4j_contact_id = $1 AND removed_by_subject_at IS NOT NULL`,
    [phone],
    SUBJECT_QUERY_TIMEOUT_MS,
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

/** What the base holds about one number, read before the subject is decided. */
export interface BaseRecord {
  readonly account: AccountRow | null;
  readonly heads: readonly HeadRow[];
  readonly companies: readonly string[];
  readonly listed: boolean;
}

function kindOf(base: BaseRecord): SubjectKind | null {
  if (base.account?.joined === true) return SubjectKind.Member;
  if (base.heads.length > 0) return SubjectKind.PublicPerson;
  return base.listed ? SubjectKind.Listed : null;
}

/** Pure: the subject from what the base holds, or the reason there is none. */
export function subjectFrom(phone: string, base: BaseRecord): ResearchSubject | SubjectRefusal {
  const kind = kindOf(base);
  if (kind === null) return SubjectRefusal.PrivateContact;
  const { account, heads } = base;
  const names = nameSpellings([
    account?.name ?? '',
    ...heads.flatMap((h) => [h.name_latin, h.name_ka]),
  ]);
  if (names.length === 0) return SubjectRefusal.NoName;
  const ownEmployer = account?.employer?.trim() ?? '';
  return {
    phone,
    kind,
    names,
    companies: [...new Set([ownEmployer, ...base.companies].filter((c) => c !== ''))],
    role: account?.job?.trim() || heads[0]?.role || '',
    city: account?.city?.trim() ?? '',
  };
}

export async function researchSubject(phone: string): Promise<ResearchSubject | SubjectRefusal> {
  const [account, heads, companies, listed, removed] = await Promise.all([
    accountRow(phone),
    headRows(phone),
    linkedCompanies(phone),
    onApprovedList(phone),
    removedByPerson(phone),
  ]);
  if (removed) return SubjectRefusal.RemovedByPerson;
  return subjectFrom(phone, { account, heads, companies, listed });
}
