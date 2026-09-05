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

export type ResolutionReason = 'resolved' | 'no_match' | 'ambiguous' | 'name_conflict';

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
 * And the win must be a rout, not a lead. The first crowd-broken run resolved
 * 29 of 44, but several margins were 21 against 15, 12 against 10, 3 against
 * 2 — the shape that put "Nino Niauri" on Kaxa Niauri, and the founder's own
 * count was that 6 of 15 uncertain matches were plainly wrong. Twice the
 * runner-up is the line: a real person's own number is saved by everyone who
 * knows them, a namesake's by their own separate handful.
 */
const MIN_DOMINANCE_RATIO = 2;

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
    (runnerUp === undefined || winner.contributors >= runnerUp.contributors * MIN_DOMINANCE_RATIO);
  if (!clear) return { name, reason: 'ambiguous', phone: null, candidates };
  return { name, reason: 'resolved', phone: winner.phone, candidates };
}

/**
 * A phone supplied by a human, keyed by the profile's own name.
 *
 * Lika researched these people; she knows which number is theirs, and no crowd
 * heuristic beats that. An override skips resolution entirely — it is not a
 * hint that the matcher then weighs, it IS the answer. The matcher only ever
 * runs for names nobody filled in.
 */
export type PhoneOverrides = Readonly<Record<string, string>>;

/**
 * How many savers a number needs before their silence about a name counts as
 * a contradiction. Below this the crowd simply does not know the number, and
 * a researched phone is still the best answer we have.
 */
const MIN_CONTRADICTING_SAVERS = Number(process.env.PROFILE_IMPORT_MIN_CONTRADICTORS ?? 5);

interface CrowdVerdict {
  /** Distinct people who saved this number under any label. */
  savers: number;
  /** Of those, how many wrote a label carrying one of the name's tokens. */
  agreeing: number;
  /** The commonest label — what to show the human when we refuse the row. */
  dominantAlias: string | null;
}

/**
 * What the phonebooks say about a number, measured against a name.
 *
 * A supplied phone is normally the answer and not a hint — Lika researched
 * these people. But on 5 September an 85-row seed file paired Guri Koiava and
 * Levan Lashkarava with each other's numbers, and the import published each
 * one's LinkedIn on the other, because nothing ever asked the 113 and 83
 * phonebooks that knew both numbers by name. A file is one person typing; a
 * hundred phonebooks are not.
 */
async function crowdVerdict(phone: string, name: string): Promise<CrowdVerdict> {
  const tokens = name
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return { savers: 0, agreeing: 0, dominantAlias: null };
  const result = await query<{ savers: string; agreeing: string; dominant: string | null }>(
    `WITH a AS (
       SELECT ua."contactId", ua.alias,
              EXISTS (
                SELECT 1 FROM unnest($2::text[]) tok
                WHERE normalize_search_token(tok) = ANY(
                        regexp_split_to_array(normalize_search_token(ua.alias), '[^a-z0-9]+'))
              ) AS agrees
       FROM "UserAlias" ua
       WHERE regexp_replace(ua.phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
     )
     SELECT COUNT(DISTINCT "contactId")::text AS savers,
            COUNT(DISTINCT "contactId") FILTER (WHERE agrees)::text AS agreeing,
            (SELECT alias FROM a GROUP BY alias ORDER BY COUNT(*) DESC, alias LIMIT 1) AS dominant
     FROM a`,
    [phone, tokens],
    PROFILE_QUERY_TIMEOUT_MS,
  );
  const row = result.rows[0];
  return {
    savers: Number(row?.savers ?? 0),
    agreeing: Number(row?.agreeing ?? 0),
    dominantAlias: row?.dominant ?? null,
  };
}

export interface ProfileImportRow extends ProfileResolution {
  /** Where the phone came from: a person, or the crowd heuristic. */
  matched_by: 'human' | 'crowd' | 'none';
  /** Set only on a refused row: what the phonebooks call that number instead. */
  crowd_says?: { savers: number; dominant_alias: string | null };
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
  /** Rows refused because the phonebooks call that number somebody else. */
  name_conflict: number;
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
  overrides: PhoneOverrides = {},
): Promise<ProfileImportResult> {
  const rows: ProfileImportRow[] = [];
  let factsWritten = 0;
  for (const profile of profiles) {
    const supplied = overrides[profile.name]?.trim();
    const resolution: ProfileResolution = supplied
      ? { name: profile.name, reason: 'resolved', phone: supplied, candidates: [] }
      : await resolveProfilePhone(profile.name);
    const matchedBy: ProfileImportRow['matched_by'] = supplied
      ? 'human'
      : resolution.reason === 'resolved'
        ? 'crowd'
        : 'none';
    // A supplied phone is still the answer — but not against a crowd that
    // knows the number well and never once wrote this name on it.
    let crowdSays: ProfileImportRow['crowd_says'];
    if (supplied && resolution.phone !== null) {
      const verdict = await crowdVerdict(resolution.phone, profile.name);
      if (verdict.savers >= MIN_CONTRADICTING_SAVERS && verdict.agreeing === 0) {
        resolution.reason = 'name_conflict';
        crowdSays = { savers: verdict.savers, dominant_alias: verdict.dominantAlias };
      }
    }
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
    rows.push({
      ...resolution,
      matched_by: matchedBy,
      written,
      available,
      ...(crowdSays === undefined ? {} : { crowd_says: crowdSays }),
    });
  }
  return {
    dry_run: dryRun,
    resolved: rows.filter((r) => r.reason === 'resolved').length,
    ambiguous: rows.filter((r) => r.reason === 'ambiguous').length,
    no_match: rows.filter((r) => r.reason === 'no_match').length,
    name_conflict: rows.filter((r) => r.reason === 'name_conflict').length,
    facts_written: factsWritten,
    rows,
  };
}
