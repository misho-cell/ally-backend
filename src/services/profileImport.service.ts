import { query } from '../db/postgres/client';
import { submitContactFact } from './contactFacts.service';

/**
 * Loading Lika's researched profiles at the database level (ticket 9 task 9).
 *
 * Batches 1 (102 files) and 2 (40) were loaded on 14 July; batch 3 (44) never
 * was. The task's one hard instruction is why this service exists at all:
 *
 *   "Key them on phone identity, not on name. From the founder's seat we
 *    matched 104 of 186 by name and 6 of the 15 uncertain matches were plainly
 *    wrong — 'Nino Niauri' landed on Kaxa Niauri, 'Irakli Jinjikhadze' on
 *    Irakli Vekua. We wrote nothing on those."
 *
 * A profile file carries no phone number, so the name still has to be resolved
 * to one. The discipline is in what happens when that resolution is not
 * certain: a name that matches no phone, or more than one, writes NOTHING and
 * is reported as unresolved. A wrong fact about a real person is worse than a
 * missing one, and this is a bulk write — the same mistake made 186 times.
 */

const PROFILE_QUERY_TIMEOUT_MS = 15_000;

/** The section marker: everything after it is the researcher's own notes. */
const PRIVATE_SECTION_MARKER = '# --- PRIVATE';

/**
 * File key → fact field type. `expertise_topic` becomes `expertise`, the key
 * the rest of the product already uses (chat.service's own list).
 *
 * The PRIVATE section is not in this map and is never imported: the files
 * label it "owner-only, never shared", and a curator's facts are published the
 * moment they are written. Nothing about that section is ours to publish.
 */
const FIELD_MAP: Readonly<Record<string, string>> = {
  headline: 'headline',
  country: 'country',
  seniority: 'seniority',
  role: 'role',
  past_role: 'past_role',
  role_type: 'role_type',
  skill: 'skill',
  expertise_topic: 'expertise',
  industry: 'industry',
  education: 'education',
  language: 'language',
  link: 'link',
};

export interface ParsedProfile {
  name: string;
  /** field type → values, in file order, duplicates already collapsed. */
  facts: Record<string, string[]>;
}

/**
 * Read one profile file. Lines are `key: value`; the private section is cut
 * before parsing rather than parsed and filtered, so a future key added down
 * there cannot leak in by being added to FIELD_MAP later.
 */
export function parseProfile(content: string): ParsedProfile | null {
  const publicPart = content.split(PRIVATE_SECTION_MARKER)[0] ?? '';
  const facts: Record<string, string[]> = {};
  let name = '';
  for (const line of publicPart.split('\n')) {
    const match = /^([a-z_]+):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = (rawValue ?? '').trim();
    if (value === '') continue;
    if (key === 'name') {
      name = value;
      continue;
    }
    const fieldType = FIELD_MAP[key ?? ''];
    if (!fieldType) continue;
    const bucket = (facts[fieldType] ??= []);
    if (!bucket.includes(value)) bucket.push(value);
  }
  if (name === '') return null;

  // "Co-Founder & CEO @ KLIPY, San Francisco Bay Area (2022–present)" carries
  // the employer, and employer is one of the five fields the target list reads
  // for fit. Only the CURRENT role gives one — a past_role would make a
  // former employer look current.
  const employer = employerFromRole(facts['role']?.[0]);
  if (employer) facts['employer'] = [employer];
  return { name, facts };
}

function employerFromRole(role: string | undefined): string | null {
  if (!role) return null;
  const at = role.indexOf('@');
  if (at === -1) return null;
  const after = role.slice(at + 1).trim();
  // Cut at the first comma or opening bracket: what follows is a location or
  // a date range, never the company name.
  const employer = after.split(/[,(]/)[0]?.trim() ?? '';
  return employer === '' ? null : employer;
}

export type ResolutionReason = 'resolved' | 'no_match' | 'ambiguous';

export interface ProfileCandidate {
  phone: string;
  /** Distinct people who saved this number under this full name. */
  contributors: number;
}

export interface ProfileResolution {
  name: string;
  reason: ResolutionReason;
  /** The single phone this name resolves to, or null when it does not. */
  phone: string | null;
  /** Every phone the name matched, with its crowd count — the audit trail. */
  candidates: ProfileCandidate[];
}

/**
 * A name almost never matches exactly one number in a base of 2.5 million
 * contacts — the first live dry run resolved 4 of 44 and called 32 ambiguous,
 * with "Giorgi Razmadze" matching 88 phones. Scoping to the founder's own
 * phonebook is the opposite failure: he does not hold 82 of the 186 at all.
 *
 * So the tie is broken by the crowd, which is the same identity signal the
 * rest of this codebase already trusts: the phone the most DISTINCT people
 * saved under that full name. Two conditions, both required, and a failure of
 * either leaves the profile unresolved for a human:
 *   - the winner must be saved by at least this many people, and
 *   - it must be STRICTLY ahead of the runner-up. A tie is not an answer.
 */
const MIN_WINNING_CONTRIBUTORS = 2;

/**
 * Resolve a full name to ONE phone, or to nothing.
 *
 * Both of the profile's name tokens must appear as whole tokens in the same
 * alias, folded through normalize_search_token — the same function search uses,
 * which already covers script and the q/k, ts/c, kh/x spelling drift. A single
 * shared token is not enough: "Nino Niauri" landing on "Kaxa Niauri" is exactly
 * the surname-only match this rule refuses.
 */
export async function resolveProfilePhone(name: string): Promise<ProfileResolution> {
  const tokens = name
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length < 2) {
    return { name, reason: 'no_match', phone: null, candidates: [] };
  }
  const result = await query<{ phone: string; contributors: string }>(
    // The surname drives the index. Without the `<<%` prefilter this is a
    // sequential scan of 8.4 million aliases with normalize_search_token
    // applied to every row — it timed out on the first live run, 44 names
    // deep. `<<%` (strict word similarity) rides idx_user_alias_norm_trgm,
    // the same prefilter the unmet-needs candidate lookup uses, and the two
    // whole-token conditions stay as the precision gate behind it.
    `SELECT ua.phone, COUNT(DISTINCT ua."contactId")::text AS contributors
     FROM "UserAlias" ua
     WHERE normalize_search_token($2) <<% normalize_search_token(ua.alias)
       AND normalize_search_token($1) = ANY(
             regexp_split_to_array(normalize_search_token(ua.alias), '[^a-z0-9]+'))
       AND normalize_search_token($2) = ANY(
             regexp_split_to_array(normalize_search_token(ua.alias), '[^a-z0-9]+'))
     GROUP BY ua.phone
     ORDER BY COUNT(DISTINCT ua."contactId") DESC, ua.phone`,
    [tokens[0], tokens[tokens.length - 1]],
    PROFILE_QUERY_TIMEOUT_MS,
  );
  const candidates: ProfileCandidate[] = result.rows.map((r) => ({
    phone: r.phone,
    contributors: Number(r.contributors),
  }));
  if (candidates.length === 0) return { name, reason: 'no_match', phone: null, candidates };

  const [winner, runnerUp] = candidates;
  if (!winner) return { name, reason: 'no_match', phone: null, candidates };
  const clear =
    winner.contributors >= MIN_WINNING_CONTRIBUTORS &&
    (runnerUp === undefined || winner.contributors > runnerUp.contributors);
  if (!clear) return { name, reason: 'ambiguous', phone: null, candidates };
  return { name, reason: 'resolved', phone: winner.phone, candidates };
}

export interface ProfileImportRow extends ProfileResolution {
  /** How many facts were written (0 on a dry run, or when unresolved). */
  written: number;
  /** How many the file offered — so a dry run still shows the size. */
  available: number;
}

export interface ProfileImportResult {
  dry_run: boolean;
  resolved: number;
  ambiguous: number;
  no_match: number;
  facts_written: number;
  rows: ProfileImportRow[];
}

/**
 * Import a batch. `dryRun` resolves every name and writes nothing — the only
 * responsible way to run a bulk write whose known failure mode is landing a
 * fact on the wrong person.
 */
export async function importProfiles(
  profiles: ParsedProfile[],
  curatorUserId: string,
  dryRun: boolean,
): Promise<ProfileImportResult> {
  const rows: ProfileImportRow[] = [];
  let factsWritten = 0;
  for (const profile of profiles) {
    const resolution = await resolveProfilePhone(profile.name);
    const available = Object.values(profile.facts).reduce((n, v) => n + v.length, 0);
    let written = 0;
    if (resolution.reason === 'resolved' && resolution.phone !== null && !dryRun) {
      for (const [fieldType, values] of Object.entries(profile.facts)) {
        for (const value of values) {
          await submitContactFact(
            curatorUserId,
            resolution.phone,
            fieldType,
            value,
            'sweep',
            'stated',
          );
          written++;
        }
      }
    }
    factsWritten += written;
    rows.push({ ...resolution, written, available });
  }
  return {
    dry_run: dryRun,
    resolved: rows.filter((r) => r.reason === 'resolved').length,
    ambiguous: rows.filter((r) => r.reason === 'ambiguous').length,
    no_match: rows.filter((r) => r.reason === 'no_match').length,
    facts_written: factsWritten,
    rows,
  };
}
