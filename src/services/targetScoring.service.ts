import { query } from '../db/postgres/client';
import { findUnmetNeeds, UnmetNeed } from './unmetNeeds.service';
import { normalizePhone, phoneDigits } from './phone';
import { roundTo } from './number';
import { warmthByPhoneAndUser } from './warmth.service';
import {
  MONTHLY_GROWTH_ASK_BUDGET_BASE,
  MONTHLY_GROWTH_ASK_BUDGET_LADDER,
  FATIGUE_STEP_DOWN_PER_SIGNAL,
} from './askBudget.service';

const SCORE_QUERY_TIMEOUT_MS = 8_000;
// Must mirror askBudget.service's own fatigue window — this is the same
// signal, read here in aggregate rather than per-sender.
const IGNORED_ASK_AFTER_HOURS = 168;

// T7: weekly scored list of non-users per market. All five criteria flags are
// built. The two that were once reported unbuildable joined in ticket 7 task
// 15: "relevance to a specific user's goals" reads the tasks table (the goals
// ARE tasks — the earlier "no goals table" note was wrong), and "lookalike
// match to our best users" uses the founder's D50 definition of a best user —
// any one of: a confirmed search outcome in the last 30 days, three paid
// months, or using Netai at least once a week.

// Score-part weights and saturation points — a handful of holders (Reach) or
// matched searches (Pull) already carries the same signal as a hundred would,
// so each part is capped before combining rather than left unbounded.
const REACH_SATURATION = 10;
const PULL_SATURATION = 5;
// Rule 14 (founder D102, 3 September 2026): "chorus works two direction ways
// — right targets and right inviters who have good/warm relations with
// targets". The two halves never mix. FIT × REACH chooses the TARGET; warmth
// chooses the INVITER and has been taken out of the target score entirely.
//
// What forced it: on 3 September every row of the live list scored
// 0.45 + 0.3 × warmth + bonuses. Warmth is how well the FOUNDER knows someone,
// so the list answered "who do you know well?" instead of "who is a good
// customer?" — a colleague ranked first, and his real targets (Tika Rukhadze,
// Lasha Kiviladze, Vaxo Burchuladze) were not on it at all, because his ties to
// them are formal. There was no input for fit anywhere in the formula.
const FIT_REACH_WEIGHT = 0.7;
// Rule 1: "demand may add at most a tenth of the score, and can never lift
// anyone over a gate." It was carrying 0.35 — which is how a violin teacher
// reached the list 54 minutes after somebody searched for one.
const PULL_BONUS = 0.1;
const NEEDS_NETAI_BONUS = 0.1;
const GAP_FILLING_BONUS = 0.05;
// Ticket 7 task 15: the two remaining criteria flags. A target an open goal
// is actually looking for outranks a merely-popular one; a lookalike bonus is
// softer — a correlation, not a demand signal.
const GOAL_RELEVANCE_BONUS = 0.1;
const BEST_USER_LOOKALIKE_BONUS = 0.05;

// D50's best-user definition, verbatim: any ONE of the three qualifies.
const BEST_USER_OUTCOME_DAYS = 30;
const BEST_USER_PAID_MONTHS = 3;
// "uses Netai at least once a week", read over the last four weeks: a chat
// run in four distinct weeks (token_transactions' chat_debit rows — every
// conversation run writes one, the broadest real usage signal in the schema).
const BEST_USER_ACTIVE_WEEKS = 4;
const BEST_USER_ACTIVITY_WINDOW_DAYS = 28;
// A "confirmed outcome" is any rung at or beyond accepted on D39's ladder.
const CONFIRMED_OUTCOMES = ['accepted', 'sent', 'replied', 'followed_up'];
// The lookalike vocabulary comes from the trade-shaped facts recorded about
// best users themselves — occupations match occupations, never name tokens.
const LOOKALIKE_FACT_TYPES = ['occupation', 'industry', 'employer'];
// A topic this scarce in candidates (this or fewer non-user matches) counts
// its matched trade as gap-filling — genuinely hard to find in the network.
const GAP_FILLING_POOL_THRESHOLD = 2;

const OLD_ALLY_COLOUR_BONUS: Record<string, number> = {
  allies: 0.3,
  loyal: 0.2,
  connections: 0.1,
  contacts: 0.05,
};
const OLD_ALLY_COLOUR_RANK = ['allies', 'loyal', 'connections', 'contacts'];

// Explainable keyword flag, not a classifier — the spec's own examples
// (business owner, hirer, organiser). Deliberately short: a false negative
// here only withholds a small bonus already backed by Reach/Pull/Warmth; a
// false positive would misrepresent why someone was ranked highly.
const NEEDS_NETAI_KEYWORDS = [
  'დირექტორი',
  'დამფუძნებელი',
  'მფლობელი',
  'მენეჯერი',
  'ხელმძღვანელი',
  'director',
  'founder',
  'owner',
  'ceo',
  'hr',
  'recruiter',
  'ორგანიზატორი',
  'organizer',
];

// ─── Rule 14 (a): fit is read from the facts FIRST ─────────────────────────
// The founder's order, verbatim: "the public facts already in the store
// (occupation, role, employer, industry, expertise — live since 1 September,
// hundreds of people) → the label words (Rule 3) → the company register
// (Rule 7) → a LinkedIn look-up on the shortlist. Step 4 of the criteria file
// is no longer 'LinkedIn first'; it is 'LinkedIn last'."
//
// Only the first two of the four are readable from this codebase. The register
// (Rule 7) and LinkedIn (Step 5) are outside it, so a person the facts and the
// labels cannot judge lands in NOT YET — Rule 6: "'we could not find anything'
// is a state called NOT YET. It never produces an OUT." They stay on the list
// and rank last, they are never dropped.
const FIT_FACT_TYPES = ['occupation', 'role', 'employer', 'industry', 'expertise'];
// The same three statuses membership.ts counts as an active Netai
// subscription — an inviter must be a Netai user (Rule 13).
const NETAI_ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

// Owning or running something (Rule 5 / R2 / R9). A managing partner is an
// owner; a "senior manager at a real company" is the founder's own IN.
const OWNERSHIP_WORDS = [
  'დამფუძნებელი',
  'თანადამფუძნებელი',
  'მფლობელი',
  'პარტნიორი',
  'თავმჯდომარე',
  'დირექტორი',
  'founder',
  'co-founder',
  'cofounder',
  'owner',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'partner',
  'chairman',
  'chairwoman',
  'president',
  'investor',
  'angel',
];
// A commercial or client-facing job — the founder's 8 July ruling that BD and
// sales count, "their job IS who do I call".
const ROLE_WORDS = [
  'მენეჯერი',
  'ხელმძღვანელი',
  'დეპარტამენტი',
  'კონსულტანტი',
  'director',
  'manager',
  'head',
  'lead',
  'consultant',
  'business development',
  'sales',
  'commercial',
  'hr',
  'recruiter',
  'board',
];

// ─── Rule 2's exclusion pass, and Rule 14 (c) ──────────────────────────────
// The founder, 31 August: "I think this is a good ranker, but after some
// filtering, when you exclude taxi, mechanics, us, hotlines, people who are
// already paid users, you can see rest as good target."
//
// Five of the exclusions are readable from this database and are applied here.
// Three are NOT, and are named rather than faked: "not living in Georgia",
// "too powerful with no gap to fill", and the Argentine cohort — no column in
// this schema carries any of them, and a gate that guesses is worse than a
// gate that is missing, because it removes people silently.
// G1, in the founder's own words: "Only a trade or a service. Plumber,
// electrician, mechanic, vet, sculptor, calligrapher, photographer, violin
// teacher, taxi driver." Deliberately NOT the label parser's occupation
// dictionary, which also holds lawyer, architect, accountant and programmer —
// those are professions, and gating them out would remove real targets. This
// list is the founder's examples and the criteria file's own
// (khelosani, karobka, avtomatika, airbagi), nothing more.
const TRADE_WORDS = [
  'ხელოსან',
  'khelosani',
  'xelosani',
  'სანტექნიკ',
  'santeknik',
  'plumber',
  'ელექტრიკ',
  'eleqtrik',
  'electrician',
  'მექანიკ',
  'mechanic',
  'karobka',
  'კარობკა',
  'avtomatika',
  'ავტომატიკა',
  'airbagi',
  'ეარბეგ',
  'shpana',
  'შპანა',
  'ვეტერინარ',
  'veterinar',
  'მოქანდაკე',
  'moqandake',
  'sculptor',
  'კალიგრაფ',
  'calligraph',
  'ფოტოგრაფ',
  'fotograf',
  'photographer',
  'ვიოლინ',
  'violino',
  'violin',
  'ტაქსი',
  'taxi',
  'taksi',
  'მძღოლ',
  'დურგალ',
  'მღებავ',
  'შემდუღებ',
];

// A first name is not an identification (ticket 9 task 23).
const MIN_AGREED_NAME_TOKENS = 2;

/** One person calling him a taxi is an opinion; two is the crowd's verdict. */
const MIN_TRADE_VOTES = 2;

/**
 * Our own company, as the crowd writes it. A phone whose aliases carry it from
 * this many different savers belongs to one of ours (ticket 9 task 10 item 3).
 * Three, not one: a stray „ally" in somebody's label is a typo, three people
 * agreeing is a job.
 */
const OWN_COMPANY_MARKERS = ['ally', 'ელაი', 'netai', 'ნეტაი'];
const MIN_OWN_COMPANY_VOTES = 3;

const MIN_OWN_CONTACTS = 200;
// The founder, 31 August: "people with less then 200 contacts are very young
// and possibly even not working". This also swallows the register-once-and-
// never-return pattern (one contact or none), which is the same rule at a
// lower number.

// Rule 14 (c): "a label is never a target — 'Maxin.ai Ceo' names a company;
// the person is found first, then judged." A label carrying a company marker
// is only a target once a real person has been confirmed behind the number.
const COMPANY_MARKERS = [
  '.ai',
  '.ge',
  '.com',
  '.io',
  'llc',
  'ltd',
  'inc',
  'შპს',
  'ooo',
  'ооо',
  'group',
  'studio',
  'agency',
  'company',
];

// Words that make a label an ORGANISATION rather than a person (ticket 9 task
// 23: „ახალგაზრდული ასოციაცია" passed `person_confirmed: true`).
const ORGANISATION_WORDS = [
  'ასოციაცია',
  'asociacia',
  'association',
  'კავშირი',
  'ფონდი',
  'fondi',
  'foundation',
  'კლუბი',
  'klubi',
  'club',
  'სკოლა',
  'skola',
  'school',
  'ცენტრი',
  'centri',
  'center',
  'centre',
  'ორგანიზაცია',
  'organization',
  'organisation',
  'სააგენტო',
  'agency',
  'სამსახური',
  'ministry',
  'სამინისტრო',
];

// How people label a relative or a neighbour. „Tornike Mezobeli" is Tornike
// the neighbour — the second word is a relationship, not a surname, and the
// list must not treat it as one (ticket 9 task 23).
const RELATIONSHIP_WORDS = [
  'მეზობელ',
  'mezobel',
  'ძმა',
  'dzma',
  // 'და' is deliberately absent. It means "sister" AND "and", and it opens
  // დათო, დავით and დარეჯან — it removed „დათო ხაზარაძე" from the list during
  // testing, which is a real person losing his first name to a conjunction.
  'ბიძა',
  'bidza',
  'დეიდა',
  'deida',
  'მამიდა',
  'mamida',
  'ბიცოლა',
  'ნათლია',
  'კუმბარი',
  'kumbari',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'neighbour',
  'neighbor',
  'cousin',
];

// Words for a dwelling, a door or a price. After the relabelling, two rows
// said out loud what they are: „Wina Korpusis Karebis Nomeri" (the number of
// the front building's door) and „Orbi Batumi bina 60 GEL" (a flat at sixty
// lari). Generic words, not a brand list — every one of them is a thing rather
// than a person, in any building in the country.
const THING_WORDS = [
  'ბინა',
  'bina',
  'კორპუს',
  'korpus',
  'კარები',
  'karebi',
  'ნომერი',
  'nomeri',
  'სადარბაზო',
  'sadarbazo',
  'ბინის',
  'ოთახი',
  'otaxi',
  'flat',
  'apartment',
  'ლარი',
  'gel',
  'usd',
];

// A city is where somebody is, never who they are — and „ბათუმი ორბი 2" is a
// building, not a person.
const PLACE_WORDS = [
  'თბილისი',
  'tbilisi',
  'ბათუმი',
  'batumi',
  'ქუთაისი',
  'kutaisi',
  'რუსთავი',
  'გორი',
  'ზუგდიდი',
  'ფოთი',
  'თელავი',
  'ბაკურიანი',
  'bakuriani',
  'გუდაური',
];

export type TargetExclusion =
  | 'trade_only'
  | 'company_label'
  | 'not_a_person'
  | 'our_own_people'
  | 'already_paying'
  | 'phonebook_too_small'
  /** What most savers call it is a place or a thing — a flat, not a person. */
  | 'place_or_thing';

export type FitLevel = 'strong' | 'moderate' | 'weak' | 'not_yet';

/**
 * How much of the target half of the score a fit level earns. `not_yet` is
 * zero on this term and keeps every bonus — parked, never rejected (Rule 6).
 */
const FIT_SCORE: Readonly<Record<FitLevel, number>> = {
  strong: 1,
  moderate: 0.6,
  weak: 0.3,
  not_yet: 0,
};

export interface FitSignal {
  level: FitLevel;
  /** Which of the four sources answered: the facts, the labels, or neither. */
  source: 'facts' | 'label' | 'none';
  /** The stored values that decided it — so a human can check the machine. */
  evidence: string[];
}

function containsAny(haystack: string, words: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/**
 * Fit from the public facts store, per phone. Public only: a fit judgment
 * built on somebody's private note would put a private claim into a list the
 * founder reads.
 */
async function fitFromFacts(phones: string[]): Promise<Map<string, string[]>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; values: string[] }>(
    `SELECT neo4j_contact_id AS phone,
            array_agg(DISTINCT field_type || ': ' || COALESCE(canonical_value, value)) AS values
     FROM contact_facts
     WHERE neo4j_contact_id = ANY($1)
       AND is_public = true
       AND retracted_at IS NULL
       AND field_type = ANY($2::text[])
     GROUP BY neo4j_contact_id`,
    [phones, FIT_FACT_TYPES],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, r.values]));
}

interface AccountFacts {
  subscriptionStatus: string;
  /**
   * Whether their own phonebook reaches MIN_OWN_CONTACTS — a threshold, not a
   * number, and counted as one. The exact count meant a correlated
   * COUNT(DISTINCT) over every alias row of every candidate's account, which
   * timed out the whole route on the first live read; stopping at the
   * threshold reads at most MIN_OWN_CONTACTS index entries per account.
   */
  hasEnoughContacts: boolean;
}

/**
 * Everything the gates need to know about the ACCOUNT behind a candidate
 * phone. A phone with no account is absent — it cannot be a paying user and
 * has no phonebook of its own, so neither of those two gates can apply to it.
 */
async function accountFactsForPhones(phones: string[]): Promise<Map<string, AccountFacts>> {
  if (phones.length === 0) return new Map();
  const digits = phones.map(phoneDigits).filter(Boolean);
  const result = await query<{
    phone: string;
    subscription_status: string | null;
    own_contacts: string;
  }>(
    `SELECT up.phone,
            u.subscription_status,
            (SELECT COUNT(*) FROM (
               SELECT 1 FROM "UserAlias" a WHERE a."contactId" = u.id LIMIT $2::int
             ) capped) AS own_contacts
     FROM "UserPhone" up
     JOIN "User" u ON u.id = up."userId"
     WHERE regexp_replace(up.phone, '\\D', '', 'g') = ANY($1) AND u."deletedAt" IS NULL`,
    [digits, MIN_OWN_CONTACTS],
    SCORE_QUERY_TIMEOUT_MS,
  );
  const map = new Map<string, AccountFacts>();
  for (const row of result.rows) {
    const key = phoneDigits(row.phone);
    const facts = {
      subscriptionStatus: row.subscription_status ?? '',
      hasEnoughContacts: Number(row.own_contacts) >= MIN_OWN_CONTACTS,
    };
    const current = map.get(key);
    // One person, several phone rows: keep the fullest phonebook and any
    // paying status, so neither gate is dodged by a second row.
    if (!current) {
      map.set(key, facts);
    } else {
      map.set(key, {
        subscriptionStatus: current.subscriptionStatus || facts.subscriptionStatus,
        hasEnoughContacts: current.hasEnoughContacts || facts.hasEnoughContacts,
      });
    }
  }
  return map;
}

/** Our own team and every test account, from the env list auth already owns. */
export function ownPeopleDigits(): Set<string> {
  return new Set(
    (process.env.REVIEW_PHONE ?? '')
      .split(',')
      .map((p) => phoneDigits(p.trim()))
      .filter(Boolean),
  );
}

/**
 * The gates of Rule 2, in the founder's own order. Returns the reason a
 * candidate is out, or null if they stay. Deliberately NOT a score: an
 * excluded person is not a low-ranked person, they are absent (the file's own
 * negative test — "a violin teacher, a calligrapher and a petrol-station line
 * must not be able to reach the list at all").
 */
function exclusionFor(
  label: string,
  fit: FitSignal,
  tradeVotes: number,
  nameConfirmed: boolean,
  account: AccountFacts | undefined,
  isOurOwn: boolean,
  crowd: { dominantIsPlaceOrThing: boolean; ownCompanyVotes: number },
): TargetExclusion | null {
  if (isOurOwn) return 'our_own_people';
  // The crowd knows our own people better than any internal list: 38 savers
  // wrote „Luka Iashvili (Ally)" and 15 more „Luka Iashvili Ally". A real
  // person, a fine target for somebody, not for us (task 10 item 3).
  if (crowd.ownCompanyVotes >= MIN_OWN_COMPANY_VOTES) return 'our_own_people';
  // What MOST people call the number decides what it IS. „ბათუმი ორბი 2" is a
  // flat, whatever a single saver's „ORBI IAFAD" tokenises to (task 23).
  if (crowd.dominantIsPlaceOrThing) return 'place_or_thing';
  if (account && NETAI_ACTIVE_SUBSCRIPTION_STATUSES.includes(account.subscriptionStatus)) {
    return 'already_paying';
  }
  if (account && !account.hasEnoughContacts) return 'phonebook_too_small';
  // "Only a trade or a service" — the trade word is the gate, but only when
  // nothing else speaks for the person. A stored fact or a role word in the
  // label means there IS something else, and Rule 5 keeps them.
  const crowdSaysTrade = tradeVotes >= MIN_TRADE_VOTES;
  if (
    (containsAny(label, TRADE_WORDS) || crowdSaysTrade) &&
    fit.level !== 'strong' &&
    fit.level !== 'moderate'
  ) {
    if (!containsAny(label, OWNERSHIP_WORDS) && !containsAny(label, ROLE_WORDS)) {
      return 'trade_only';
    }
  }
  // Rule 14 (c): a company name is not a person until a person is confirmed.
  if (containsAny(label, COMPANY_MARKERS) && !nameConfirmed) return 'company_label';
  // Task 23: "person_confirmed is a check, not a flag." An organisation, a
  // first name with no surname, and „Tornike Mezobeli" — Tornike the
  // neighbour — all used to pass it as a ranking bonus. Nobody the crowd
  // cannot name twice is a target.
  if (!nameConfirmed) return 'not_a_person';
  return null;
}

/** The facts first, then the label words, then NOT YET. Never a rejection. */
function fitFor(factValues: string[] | undefined, label: string): FitSignal {
  if (factValues && factValues.length > 0) {
    const joined = factValues.join(' ');
    if (containsAny(joined, OWNERSHIP_WORDS)) {
      return { level: 'strong', source: 'facts', evidence: factValues };
    }
    return { level: 'moderate', source: 'facts', evidence: factValues };
  }
  if (containsAny(label, OWNERSHIP_WORDS) || containsAny(label, ROLE_WORDS)) {
    return { level: 'weak', source: 'label', evidence: [label] };
  }
  return { level: 'not_yet', source: 'none', evidence: [] };
}

// ─── Ticket 7 Task 4 item 1: a target must be a PERSON ─────────────────────
// The signals used, stated per the tester's own ask ("change them if you
// have better signals, but say which you used"):
//   HARD EXCLUDE (never on the list):
//   - phone not a Georgian personal mobile (+9955########, 13 chars after
//     normalizePhone) — kills 0-800 hotlines, short codes and anything that
//     normalised to a foreign prefix out of a Georgian phonebook;
//   - a brand/company stoplist word is the phone's MOST FREQUENT alias token
//     AND reach > 100 — the tester's own draft, literally (wissol at reach
//     644, maksima, a bank line). Reach alone is deliberately NOT an
//     exclusion: a popular tradesman ("დათო ვეტერინარი", reach 143) is a
//     person; his top token is his trade or name, not a brand.
//   RANK, not exclude:
//   - person_confirmed = at least 2 distinct contributors saved this phone
//     with aliases sharing a non-stoplist word token (people are known by
//     the same name across phonebooks; unconfirmed phones sort last).
const GEORGIAN_MOBILE_RE = /^\+9955\d{8}$/;
const HOTLINE_REACH_THRESHOLD = 100;
const BRAND_STOPLIST: ReadonlySet<string> = new Set([
  'wissol',
  'rompetrol',
  'socar',
  'sokari',
  'maksima',
  'gulf',
  'magti',
  'magticom',
  'silknet',
  'geocell',
  'beeline',
  'bank',
  'banki',
  'tbc',
  'bog',
  'liberty',
  'servisi',
  'service',
  'servis',
  'delivery',
  'express',
  'hotline',
  'taxi',
  'taksi',
]);
// How many aliases per phone the token analysis samples — enough to see the
// dominant token on a hotline without pulling a 644-row fan-in whole.
const ALIAS_SAMPLE_PER_PHONE = 25;
const MIN_TOKEN_LENGTH = 3;

export interface TargetScoreParts {
  // Rule 14 (a): how well this person fits, and which source said so.
  fit: FitLevel;
  fit_source: 'facts' | 'label' | 'none';
  fit_evidence: string[];
  reach: number;
  pull: number;
  needs_netai_signs: boolean;
  gap_filling_trade: boolean;
  // An OPEN goal of an active subscriber whole-word-matches this target's
  // label — someone on Netai is looking for exactly this right now.
  goal_relevant: boolean;
  // The target's label shares a trade token with facts recorded about D50's
  // best users — the people Netai demonstrably works for.
  best_user_lookalike: boolean;
  // ≥2 distinct contributors know this phone by a shared, non-brand name
  // token — the "this is a person" signal. Unconfirmed entries rank last.
  person_confirmed: boolean;
  // How many active/trialing subscribers (with human-sized phonebooks — the
  // same predicate as the registration gate's social proof) hold this number.
  // The founder's target rule (31 Aug, via Misho): invite ONLY people the
  // door would let in, i.e. holders >= the gate's own threshold.
  subscribed_holders: number;
}

/**
 * The best name the crowd has for each of these phones, right now (ticket 9
 * task 13.6).
 *
 * A campaign stores the label it had when it opened, and an ask sent on day 4
 * or day 10 still reads it out: the founder was asked to invite „Kato" and
 * „Maxin.ai Ceo" while the same numbers already resolved to „Ekaterine
 * Bezhanishvili" and „Nika Kucia Finance". The label the ask SAYS should be
 * the one the network knows today, not the one it knew in August.
 *
 * Returns only phones for which some alias actually names a person; a caller
 * with no entry keeps whatever it had.
 */
export async function bestPersonLabels(phones: string[]): Promise<Map<string, string>> {
  const analysis = await analyzeAliases(phones);
  const labels = new Map<string, string>();
  for (const [phone, a] of analysis) {
    if (a.personLabel !== null && a.personLabel.trim().length > 0) {
      labels.set(phone, a.personLabel.trim());
    }
  }
  return labels;
}

export interface TargetScoreEntry {
  phone: string;
  label: string;
  // Same "market" limitation as T6(b): the ASKER's city from a matched
  // topic, not a location the non-user actually reported.
  city: string | null;
  score: number;
  parts: TargetScoreParts;
  // Rule 14 (b): chosen by warmth, separately, and never folded into `score`.
  inviter: TargetInviter | null;
  // A target with no warm inviter is worked directly rather than demoted.
  route: 'chorus' | 'direct';
}

interface CandidateContext {
  label: string;
  city: string | null;
  pull: number;
  smallestPoolForItsTopics: number;
}

function gatherCandidates(needs: UnmetNeed[]): Map<string, CandidateContext> {
  const byPhone = new Map<string, CandidateContext>();
  for (const need of needs) {
    for (const candidate of need.candidates) {
      const existing = byPhone.get(candidate.phone);
      if (existing) {
        existing.pull += 1;
        existing.smallestPoolForItsTopics = Math.min(
          existing.smallestPoolForItsTopics,
          need.candidates.length,
        );
        existing.city = existing.city ?? need.city;
      } else {
        byPhone.set(candidate.phone, {
          label: candidate.label,
          city: need.city,
          pull: 1,
          smallestPoolForItsTopics: need.candidates.length,
        });
      }
    }
  }
  return byPhone;
}

/** Reach: how many users have this phone saved — current Netai contacts UNION old-Ally connections. */
async function reachForPhones(phones: string[]): Promise<Map<string, number>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; reach: string }>(
    `SELECT phone, COUNT(DISTINCT uid) AS reach FROM (
       SELECT phone, "contactId"::text AS uid FROM "UserAlias" WHERE phone = ANY($1)
       UNION
       SELECT ucp.phone, uc."originUserId"::text AS uid
       FROM "UserConnectionPhone" ucp JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = ANY($1)
     ) x GROUP BY phone`,
    [phones],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, Number(r.reach)]));
}

/**
 * Rule 14 (b): warmth chooses the INVITER, not the target.
 *
 * Only a Netai user can be asked to carry an invitation — an old-Ally account
 * has never opened the app, so asking it to invite anyone reaches nobody
 * (Rule 13). Warmth is read from the two places it exists: the old-Ally colour
 * on the connection, and the enrichment-computed relationship strength.
 *
 * A target with no warm inviter is NOT pushed down the list. The founder's
 * own words: "a target with no warm inviter goes to direct outreach, not to
 * the bottom of the list."
 */
export interface TargetInviter {
  user_id: number;
  warmth: number;
  /** The old-Ally colour behind it, when that is what made them warm. */
  colour: string | null;
}

/** The Netai users, all forty-two of them — read once, passed as a list. */
async function netaiUserIds(): Promise<number[]> {
  const result = await query<{ id: number }>(
    `SELECT u.id FROM "User" u
     WHERE u."deletedAt" IS NULL
       AND (EXISTS (SELECT 1 FROM threads t WHERE t.user_id = u.id)
         OR EXISTS (SELECT 1 FROM search_activity sa WHERE sa.user_id = u.id::text)
         OR u.subscription_status = ANY($1::text[]))`,
    [NETAI_ACTIVE_SUBSCRIPTION_STATUSES],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.id);
}

async function bestInviterForPhones(phones: string[]): Promise<Map<string, TargetInviter>> {
  if (phones.length === 0) return new Map();
  const inviters = await netaiUserIds();
  if (inviters.length === 0) return new Map();
  const inviterSet = new Set(inviters);

  // Two plain queries rather than one with a subquery, and the ids arrive as a
  // list rather than as `IN (SELECT …)`. The single-statement version timed
  // out the whole route live: with the netai set inside the query the planner
  // walked every connection of every Netai user — tens of thousands of rows
  // out of a 7.2-million-row table — instead of driving from the phones, which
  // are indexed on both sides.
  const [colourRows, strengthRows] = await Promise.all([
    query<{ phone: string; user_id: number; colour: string }>(
      `SELECT ucp.phone, uc."originUserId" AS user_id, uc."relationshipStatus"::text AS colour
       FROM "UserConnectionPhone" ucp
       JOIN "UserConnection" uc ON uc.id = ucp."connectionId"
       WHERE ucp.phone = ANY($1)
         AND uc."originUserId" = ANY($2::int[])
         AND uc."relationshipStatus"::text = ANY($3::text[])`,
      [phones, inviters, OLD_ALLY_COLOUR_RANK],
      SCORE_QUERY_TIMEOUT_MS,
    ),
    query<{ phone: string; user_id: number; strength: number | null }>(
      `SELECT contact_phone AS phone, user_id, strength_score AS strength
       FROM contact_relationship_scores
       WHERE contact_phone = ANY($1) AND user_id = ANY($2::int[])`,
      [phones, inviters],
      SCORE_QUERY_TIMEOUT_MS,
    ),
  ]);

  const best = new Map<string, TargetInviter>();
  const consider = (phone: string, userId: number, warmth: number, colour: string | null): void => {
    if (warmth <= 0) return;
    const current = best.get(phone);
    if (!current || warmth > current.warmth) {
      best.set(phone, { user_id: userId, warmth: roundTo(warmth), colour });
    }
  };
  for (const row of colourRows.rows) {
    consider(row.phone, row.user_id, OLD_ALLY_COLOUR_BONUS[row.colour] ?? 0, row.colour);
  }
  for (const row of strengthRows.rows) {
    consider(row.phone, row.user_id, Math.min(1, Number(row.strength ?? 0) * 0.5), null);
  }
  // The third input, and the only one that grows by itself (ticket 9 task
  // 13.1): what these two have actually done inside Netai, and what the user
  // said about them. Considered on the same footing as a colour, so a tie
  // proved this month can carry a campaign even where the 2021 phonebook
  // colour is missing — which is the whole point, since the colours are a
  // finite 105,000 and do not grow.
  const events = await warmthByPhoneAndUser(phones);
  for (const [phone, byUser] of events) {
    for (const [userId, score] of byUser) {
      if (inviterSet.has(userId)) consider(phone, userId, score, null);
    }
  }
  return best;
}

function hasNeedsNetaiSignal(label: string): boolean {
  const lower = label.toLowerCase();
  return NEEDS_NETAI_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

interface AliasAnalysis {
  /** Most frequent alias token across contributors (normalized), if any. */
  topToken: string | null;
  /**
   * What MOST people call this number, and whether that label is a place or a
   * thing rather than a person (ticket 9 task 23, second pass).
   *
   * „ბათუმი ორბი 2" is what 38 of 39 savers call +995557582210, and the rest
   * of its cloud is „Orbi Batumi bina 60 GEL", „Orbi Plaza", „ბინა ბათუმი",
   * „bina batumshi" — a Batumi flat-rental number. It reached the target list
   * anyway, because ONE saver had written „ORBI IAFAD", which tokenises to two
   * unknown words and reads as a full name. A single outlier must not outvote
   * the crowd about what a number IS.
   */
  dominantLabel: string | null;
  dominantIsPlaceOrThing: boolean;
  /**
   * How many DISTINCT people saved this number under OUR OWN company's name.
   *
   * Task 10 item 3 keeps our own people off the list, and the crowd says who
   * they are better than any internal list can: 38 people saved
   * +995571232023 as „Luka Iashvili (Ally)", 15 more as „Luka Iashvili Ally".
   * He is a real person and a fine target for somebody — just not for us.
   */
  ownCompanyVotes: number;
  /**
   * How many DISTINCT people saved this number under a trade word.
   *
   * The gates used to read one label — the one the candidate happened to
   * arrive with — while the evidence is spread across everything anybody ever
   * called this number. „Zura T" carries no trade word and is a taxi driver:
   * two other people saved him as „Taxi Zura" and „ზურა ტაქსი ყვარელი"
   * (ticket 9 task 23).
   */
  tradeVotes: number;
  /** ≥2 distinct contributors share a non-stoplist token — the person test. */
  personConfirmed: boolean;
  /** The same, but the shared token must be a NAME — Rule 14 (c). */
  nameConfirmed: boolean;
  /**
   * The alias most people actually use for this number, among those that
   * carry a name at all — Rule 14 (c)'s "the person is found first, then
   * judged". Null when no alias names anybody.
   */
  personLabel: string | null;
}

/**
 * The tokens of a label that could be somebody's NAME (Rule 14 c).
 *
 * Split on whitespace first, and drop a whole chunk that carries a company
 * marker: in „Maxin.ai Ceo" the marker is glued to the company name, so
 * tokenizing straight through turns „maxin" into a plausible surname — which
 * is exactly how that row reached rank four. What is left is then stripped of
 * brands, roles and ownership words, because none of those is a name either.
 */
function nameTokens(label: string): string[] {
  return label
    .split(/\s+/)
    .filter((chunk) => chunk !== '' && !containsAny(chunk, COMPANY_MARKERS))
    .flatMap((chunk) => tokenize(chunk))
    .filter(
      (token) =>
        !BRAND_STOPLIST.has(token) &&
        !containsAny(token, OWNERSHIP_WORDS) &&
        !containsAny(token, ROLE_WORDS) &&
        !containsAny(token, ORGANISATION_WORDS) &&
        !containsAny(token, RELATIONSHIP_WORDS) &&
        !containsAny(token, PLACE_WORDS) &&
        !containsAny(token, THING_WORDS) &&
        !containsAny(token, TRADE_WORDS),
    );
}

function tokenize(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-zა-ჿ0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && /[a-zა-ჿ]/.test(t));
}

/**
 * Samples up to ALIAS_SAMPLE_PER_PHONE aliases per phone (LATERAL, 21ms for
 * 3 phones via idx_user_alias_phone — EXPLAIN ANALYZE on prod) and computes
 * the two Task 4 person-signals per phone: the dominant token (the hotline
 * test's input) and whether ≥2 distinct contributors share a non-brand token.
 */
async function analyzeAliases(phones: string[]): Promise<Map<string, AliasAnalysis>> {
  const result = new Map<string, AliasAnalysis>();
  if (phones.length === 0) return result;
  const rows = await query<{ phone: string; contactId: number; alias: string }>(
    `SELECT p.phone, a."contactId", a.alias
     FROM UNNEST($1::text[]) AS p(phone)
     CROSS JOIN LATERAL (
       SELECT "contactId", alias FROM "UserAlias" ua WHERE ua.phone = p.phone
       LIMIT ${ALIAS_SAMPLE_PER_PHONE}
     ) a`,
    [phones],
    SCORE_QUERY_TIMEOUT_MS,
  );

  const byPhone = new Map<
    string,
    { contactId: number; alias: string; tokens: string[]; names: string[] }[]
  >();
  for (const row of rows.rows) {
    if (!byPhone.has(row.phone)) byPhone.set(row.phone, []);
    byPhone.get(row.phone)?.push({
      contactId: row.contactId,
      alias: row.alias,
      tokens: tokenize(row.alias),
      names: nameTokens(row.alias),
    });
  }

  for (const phone of phones) {
    const entries = byPhone.get(phone) ?? [];
    const tokenCounts = new Map<string, number>();
    const tokenContributors = new Map<string, Set<number>>();
    const nameContributors = new Map<string, Set<number>>();
    for (const entry of entries) {
      for (const token of new Set(entry.tokens)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
        if (!tokenContributors.has(token)) tokenContributors.set(token, new Set());
        tokenContributors.get(token)?.add(entry.contactId);
      }
      for (const token of new Set(entry.names)) {
        if (!nameContributors.has(token)) nameContributors.set(token, new Set());
        nameContributors.get(token)?.add(entry.contactId);
      }
    }
    let topToken: string | null = null;
    let topCount = 0;
    for (const [token, count] of tokenCounts) {
      // Deterministic: ties broken alphabetically, never by Map order.
      if (count > topCount || (count === topCount && topToken !== null && token < topToken)) {
        topToken = token;
        topCount = count;
      }
    }
    const personConfirmed = Array.from(tokenContributors.entries()).some(
      ([token, contributors]) => !BRAND_STOPLIST.has(token) && contributors.size >= 2,
    );
    // Rule 14 (c) and task 23 ask a stricter question than person_confirmed
    // does: is a PERSON confirmed, not merely a shared word. Two people typing
    // „ceo" confirms nothing, „Maxin.ai" is the company rather than a surname,
    // and „Kato" with fifty savers is still just Kato.
    //
    // So the test is on the TOKENS: at least two distinct name words, each of
    // them written by at least two different people. Per token rather than per
    // string, because the same person is written slightly differently by
    // everyone — „Lika Chxirodze Maxin.ai" and „Lika Chxirodze" are two people
    // agreeing on a name, and demanding the identical string would have thrown
    // that away. It keeps out an organisation, a bare first name, and
    // „Tornike Mezobeli" — Tornike the neighbour, whose second word is a
    // relationship and is stripped before counting.
    //
    // The same map gives the label to display: the one most contributors use
    // among those that name somebody. „Maxin.ai Ceo" is the commonest alias on
    // Nika Kutsia's number and names nobody, so it is not eligible.
    const aliasContributors = new Map<string, Set<number>>();
    const aliasNameCount = new Map<string, number>();
    for (const entry of entries) {
      if (entry.names.length === 0) continue;
      if (!aliasContributors.has(entry.alias)) aliasContributors.set(entry.alias, new Set());
      aliasContributors.get(entry.alias)?.add(entry.contactId);
      aliasNameCount.set(entry.alias, new Set(entry.names).size);
    }
    // Two conditions, and they answer two different questions. The crowd must
    // agree on at least one name word — that is what says a person is behind
    // the number rather than a shop. And SOMEBODY must know them by a full
    // name — a label carrying two name words — which is what „a first name
    // without a surname" fails. Requiring the crowd to agree on both halves
    // would be stricter than the data supports: „Gia Melashvili" and „Gia
    // Gldani" on one number is one Gia whose surname the crowd is unsure of,
    // and one number is one person.
    // The crowd's own verdict on what this number IS, counted in people rather
    // than in labels: one person calling him a taxi is an opinion, two is
    // evidence.
    const tradeContributors = new Set<number>();
    const ownCompanyContributors = new Set<number>();
    for (const entry of entries) {
      if (containsAny(entry.alias, TRADE_WORDS)) tradeContributors.add(entry.contactId);
      if (containsAny(entry.alias, OWN_COMPANY_MARKERS)) {
        ownCompanyContributors.add(entry.contactId);
      }
    }
    // What most people call this number — counted in PEOPLE, not in rows.
    const labelContributors = new Map<string, Set<number>>();
    for (const entry of entries) {
      if (!labelContributors.has(entry.alias)) labelContributors.set(entry.alias, new Set());
      labelContributors.get(entry.alias)?.add(entry.contactId);
    }
    let dominantLabel: string | null = null;
    let dominantVotes = 0;
    for (const [alias, contributors] of labelContributors) {
      if (
        contributors.size > dominantVotes ||
        (contributors.size === dominantVotes && dominantLabel !== null && alias < dominantLabel)
      ) {
        dominantLabel = alias;
        dominantVotes = contributors.size;
      }
    }
    const dominantIsPlaceOrThing =
      dominantLabel !== null &&
      (containsAny(dominantLabel, PLACE_WORDS) || containsAny(dominantLabel, THING_WORDS));

    const someoneAgreesOnAName = Array.from(nameContributors.values()).some(
      (contributors) => contributors.size >= 2,
    );
    const someoneKnowsTheFullName = entries.some(
      (entry) => new Set(entry.names).size >= MIN_AGREED_NAME_TOKENS,
    );
    const nameConfirmed = someoneAgreesOnAName && someoneKnowsTheFullName;
    // Prefer a label that carries a FULL name over one that carries half of
    // it: „Kato" is what twelve people typed, but „Kato Boxua" is who she is,
    // and a list a human reads in two seconds needs the surname. Within the
    // same number of name words, the most-used label wins; ties break
    // alphabetically, never by Map order.
    let personLabel: string | null = null;
    let bestNames = 0;
    let bestCount = 0;
    for (const [alias, contributors] of aliasContributors) {
      const names = aliasNameCount.get(alias) ?? 0;
      const better =
        names > bestNames ||
        (names === bestNames &&
          (contributors.size > bestCount ||
            (contributors.size === bestCount && personLabel !== null && alias < personLabel)));
      if (better) {
        personLabel = alias;
        bestNames = names;
        bestCount = contributors.size;
      }
    }
    result.set(phone, {
      topToken,
      dominantLabel,
      dominantIsPlaceOrThing,
      ownCompanyVotes: ownCompanyContributors.size,
      tradeVotes: tradeContributors.size,
      personConfirmed,
      nameConfirmed,
      personLabel,
    });
  }
  return result;
}

/**
 * D50's best users, exactly as ruled: active subscribers with ANY one of a
 * confirmed outcome (a rung at or beyond accepted) in the last 30 days,
 * three paid months (distinct monthly token grants), or a chat run in each
 * of the last four weeks.
 */
async function bestUserIds(): Promise<number[]> {
  // Our own people are excluded here too (ticket 9 task 23). Read live on
  // 4 September the set was seven accounts and FIVE of them were us — the
  // founder, Misho, a tester, Lika, and two of the seeded test accounts, which
  // qualify by having been used all week for testing. A "lookalike to our best
  // users" signal trained on ourselves recommends people who look like us, and
  // the only lookalike the list ever produced was Luka Iashvili, ex-Ally staff.
  const ourOwn = Array.from(ownPeopleDigits());
  const result = await query<{ id: number }>(
    `SELECT u.id FROM "User" u
     WHERE u.subscription_status = 'active'
       AND u."deletedAt" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM "UserPhone" up
         WHERE up."userId" = u.id
           AND regexp_replace(up.phone, '\\D', '', 'g') = ANY($6::text[])
       )
       AND (
       EXISTS (
         SELECT 1 FROM search_activity sa
         WHERE sa.user_id = u.id::text AND sa.outcome = ANY($1)
           AND sa.outcome_updated_at > NOW() - make_interval(days => $2)
       )
       OR (
         SELECT COUNT(DISTINCT tt.period_key) FROM token_transactions tt
         WHERE tt.user_id = u.id::text AND tt.reason = 'monthly_grant'
       ) >= $3
       OR (
         SELECT COUNT(DISTINCT date_trunc('week', tt.created_at)) FROM token_transactions tt
         WHERE tt.user_id = u.id::text AND tt.reason = 'chat_debit'
           AND tt.created_at > NOW() - make_interval(days => $4)
       ) >= $5
     )`,
    [
      CONFIRMED_OUTCOMES,
      BEST_USER_OUTCOME_DAYS,
      BEST_USER_PAID_MONTHS,
      BEST_USER_ACTIVITY_WINDOW_DAYS,
      BEST_USER_ACTIVE_WEEKS,
      ourOwn,
    ],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return result.rows.map((r) => r.id);
}

/**
 * The trade tokens describing best users — occupation/industry/employer fact
 * values recorded about their own phones, tokenized, brand words out. Name
 * tokens never enter (facts carry trades, not names), so a lookalike match
 * means "same kind of person", never "same first name".
 */
async function bestUserVocabulary(): Promise<Set<string>> {
  const ids = await bestUserIds();
  if (ids.length === 0) return new Set();
  const phoneRows = await query<{ phone: string }>(
    `SELECT phone FROM "UserPhone" WHERE "userId" = ANY($1)`,
    [ids],
    SCORE_QUERY_TIMEOUT_MS,
  );
  const phones = Array.from(
    new Set(phoneRows.rows.map((r) => normalizePhone(r.phone)).filter((p) => p !== '')),
  );
  if (phones.length === 0) return new Set();
  const facts = await query<{ value: string }>(
    `SELECT value FROM contact_facts
     WHERE neo4j_contact_id = ANY($1) AND field_type = ANY($2) AND retracted_at IS NULL`,
    [phones, LOOKALIKE_FACT_TYPES],
    SCORE_QUERY_TIMEOUT_MS,
  );
  const vocabulary = new Set<string>();
  for (const row of facts.rows) {
    for (const token of tokenize(row.value)) {
      if (!BRAND_STOPLIST.has(token)) vocabulary.add(token);
    }
  }
  return vocabulary;
}

/**
 * Which candidate phones an OPEN goal is actually looking for: each label
 * word matched whole-word (`<<%`, the same strict word-similarity operator
 * the unmet-needs matching uses — goal text is inflected prose, so exact
 * token equality would miss "სანტექნიკოსი" inside "სანტექნიკოსს ვეძებ")
 * against active subscribers' open tasks. Explainable and per-goal real —
 * the criterion the earlier "no goals table" note wrongly skipped.
 */
async function goalRelevantPhones(candidates: Map<string, CandidateContext>): Promise<Set<string>> {
  const pairPhones: string[] = [];
  const pairWords: string[] = [];
  for (const [phone, ctx] of candidates) {
    for (const word of new Set(tokenize(ctx.label))) {
      if (BRAND_STOPLIST.has(word)) continue;
      pairPhones.push(phone);
      pairWords.push(word);
    }
  }
  if (pairPhones.length === 0) return new Set();
  const result = await query<{ phone: string }>(
    `SELECT DISTINCT x.phone
     FROM UNNEST($1::text[], $2::text[]) AS x(phone, word)
     WHERE EXISTS (
       SELECT 1 FROM tasks t
       -- tasks.user_id is TEXT on prod while "User".id is INTEGER — compare
       -- as text (live-caught: integer = text 500'd the whole target list).
       JOIN "User" u ON u.id::text = t.user_id AND u.subscription_status = 'active'
       WHERE t.status = 'open'
         AND normalize_search_token(x.word) <<% normalize_search_token(
           COALESCE(t.title, '') || ' ' || COALESCE(t.description, '') || ' ' || COALESCE(t.brief, ''))
     )`,
    [pairPhones, pairWords],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Set(result.rows.map((r) => r.phone));
}

function isGeorgianPersonalMobile(phone: string): boolean {
  return GEORGIAN_MOBILE_RE.test(phone);
}

/**
 * How many phonebooks must hold a FOREIGN number before it is treated as a
 * person (ticket 9, the Axel list).
 *
 * The rule used to be „a Georgian mobile or nothing", written to kill hotlines,
 * short codes and junk out of Georgian phonebooks. It also killed every
 * Georgian who lives abroad. Measured on 5 September: 488,840 foreign numbers
 * in the base, 7,488 of them held by three or more people and 753 held by ten
 * or more — those are not short codes, they are people, and one of them was on
 * the founder's own seed list („Giga", +34…, saved by five different people).
 *
 * The crowd decides here as it decides everywhere else: a foreign number many
 * phonebooks carry is a person and goes on to the ordinary person gates; one
 * that a single phonebook carries stays out.
 */
const MIN_FOREIGN_SAVERS = Number(process.env.MIN_FOREIGN_SAVERS ?? 3);

/** Shape only: a Georgian mobile, or any plausible international number. */
function isPlausibleMobile(phone: string): boolean {
  return isGeorgianPersonalMobile(phone) || /^\+\d{9,15}$/.test(phone);
}

/** …and a foreign one has to be held by the crowd before it counts as a person. */
function foreignNumberHasCrowd(phone: string, reach: number): boolean {
  return isGeorgianPersonalMobile(phone) || reach >= MIN_FOREIGN_SAVERS;
}

function isHotline(analysis: AliasAnalysis | undefined, reach: number): boolean {
  if (reach <= HOTLINE_REACH_THRESHOLD) return false;
  const topToken = analysis?.topToken;
  return topToken != null && BRAND_STOPLIST.has(topToken);
}

/**
 * The TARGET score. Rule 14 (b): fit × reach, capped, after the filter — and
 * warmth is not in it. Rule 2: "filter, then rank by reach", so reach ranks
 * within a fit level rather than deciding across them. Rule 1: demand is a
 * bonus of at most a tenth and can never lift anyone over a gate, which is why
 * it sits with the other bonuses instead of carrying a third of the weight.
 */
function combinedScore(parts: {
  fit: FitLevel;
  reach: number;
  pull: number;
  needsNetai: boolean;
  gapFilling: boolean;
  goalRelevant: boolean;
  bestUserLookalike: boolean;
}): number {
  const normReach = Math.min(1, parts.reach / REACH_SATURATION);
  const normPull = Math.min(1, parts.pull / PULL_SATURATION);
  let score = FIT_SCORE[parts.fit] * normReach * FIT_REACH_WEIGHT + normPull * PULL_BONUS;
  if (parts.needsNetai) score += NEEDS_NETAI_BONUS;
  if (parts.gapFilling) score += GAP_FILLING_BONUS;
  if (parts.goalRelevant) score += GOAL_RELEVANCE_BONUS;
  if (parts.bestUserLookalike) score += BEST_USER_LOOKALIKE_BONUS;
  // Rounded only here, at the edge — never between the parts (task 31.4).
  return roundTo(Math.min(1, score));
}

/**
 * "List size is driven by ask capacity... not a fixed number": counts active
 * subscribers who have NOT yet used up their T10 monthly growth-ask budget
 * this month — the exact same formula askBudget.service applies per sender,
 * read here in aggregate.
 */
export async function countAskableUsers(): Promise<number> {
  const monthlyBudget = MONTHLY_GROWTH_ASK_BUDGET_BASE * MONTHLY_GROWTH_ASK_BUDGET_LADDER;
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM (
       SELECT u.id,
         COALESCE(sent.cnt, 0) AS sent_this_month,
         COALESCE(optout.cnt, 0) + COALESCE(ignored.cnt, 0) AS fatigue_signals
       FROM "User" u
       LEFT JOIN (
         SELECT from_user_id, COUNT(*) AS cnt FROM task_asks
         WHERE parent_ask_id IS NULL AND created_at > date_trunc('month', NOW())
         GROUP BY from_user_id
       ) sent ON sent.from_user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS cnt FROM ask_optout_events WHERE action = 'opt_out' GROUP BY user_id
       ) optout ON optout.user_id = u.id
       LEFT JOIN (
         SELECT from_user_id, COUNT(*) AS cnt FROM task_asks
         WHERE status = 'sent' AND created_at < NOW() - INTERVAL '${IGNORED_ASK_AFTER_HOURS} hours'
         GROUP BY from_user_id
       ) ignored ON ignored.from_user_id = u.id
       WHERE u.subscription_status = 'active'
     ) x
     WHERE sent_this_month < GREATEST(0, ${monthlyBudget} - fatigue_signals * ${FATIGUE_STEP_DOWN_PER_SIGNAL})`,
    [],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

// T7 is a WEEKLY list — recomputing ~90 seconds of product-wide scoring on
// every read made two consecutive reads disagree whenever a per-word timeout
// skipped one topic under load (live-caught on the double-read check: one
// candidate dropped between reads 2 minutes apart). Inside the TTL every
// read returns the SAME built list by construction; expiry or a restart
// refreshes it. Config, not deploy.
const TARGET_LIST_CACHE_TTL_MS = Number(process.env.TARGET_LIST_CACHE_TTL_MINUTES ?? 60) * 60_000;
interface TargetListCache {
  sinceDays: number;
  builtAt: number;
  entries: TargetScoreEntry[];
}
let targetListCache: TargetListCache | null = null;

/** Test seam: the cache is module-level state and must not leak across tests. */
export function clearTargetListCache(): void {
  targetListCache = null;
}

/**
 * The ranked, explainable target list T7 asks for: every entry carries its
 * score parts (never a bare number), and the list's length is capacity-
 * driven — it grows and shrinks with countAskableUsers(), never a constant.
 */
export async function buildTargetList(sinceDays: number): Promise<TargetScoreEntry[]> {
  if (
    targetListCache !== null &&
    targetListCache.sinceDays === sinceDays &&
    Date.now() - targetListCache.builtAt < TARGET_LIST_CACHE_TTL_MS
  ) {
    return targetListCache.entries;
  }
  const entries = await buildTargetListUncached(sinceDays);
  targetListCache = { sinceDays, builtAt: Date.now(), entries };
  return entries;
}

// The founder's target rule (31 Aug, via Misho): Chorus invites only people
// the registration door would let in. The door's social proof asks for
// MIN_SUBSCRIBED_OWNERS subscribed holders (2 since the same ruling) — this
// mirrors that number and stays env-adjustable in lockstep with it.
const MIN_TARGET_SUBSCRIBED_HOLDERS = Number(
  process.env.CHORUS_MIN_SUBSCRIBED_HOLDERS ?? process.env.SOCIAL_PROOF_MIN_SUBSCRIBED_OWNERS ?? 2,
);
const SUBSCRIBED_STATUSES = ['active', 'trialing'];
// Same human-phonebook cap as the gate's social proof: a purchased 40k-row
// list must not vouch for a target here either.
const MAX_HUMAN_PHONEBOOK_ROWS = Number(process.env.SOCIAL_PROOF_MAX_OWNER_CONTACTS ?? 15000);

// How many gate-passable people the pool source contributes per build — the
// capacity cut happens after scoring anyway; this only bounds the query.
const GATE_PASSABLE_POOL_LIMIT = Number(process.env.CHORUS_POOL_LIMIT ?? 500);

/**
 * The founder's pool (31 Aug): every UNREGISTERED number held by 2+ active
 * subscribers — exactly the people the door would let in. This is the invite
 * engine's PRIMARY candidate source now; unmet-needs matches still add pull
 * on top, but a person nobody searched for is a legitimate target when two
 * subscribers already carry them ("ეს სია შეგიძლია ბაზაში გადაამოწმო ხოლმე").
 * The label is the most common alias — display material, same as tag labels.
 */
async function gatePassablePool(): Promise<{ phone: string; label: string }[]> {
  const result = await query<{ phone: string; label: string }>(
    `SELECT ua.phone, mode() WITHIN GROUP (ORDER BY ua.alias) AS label
     FROM "UserAlias" ua
     JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
       AND u.subscription_status = ANY($1)
     WHERE NOT EXISTS (
         SELECT 1 FROM "UserPhone" up
         WHERE regexp_replace(up.phone, '\\D', '', 'g') =
               regexp_replace(ua.phone, '\\D', '', 'g')
       )
       AND (SELECT COUNT(*) FROM "UserAlias" b
            WHERE b."contactId" = ua."contactId") <= $2
     GROUP BY ua.phone
     HAVING COUNT(DISTINCT ua."contactId") >= $3
     ORDER BY COUNT(DISTINCT ua."contactId") DESC
     LIMIT $4`,
    [
      SUBSCRIBED_STATUSES,
      MAX_HUMAN_PHONEBOOK_ROWS,
      MIN_TARGET_SUBSCRIBED_HOLDERS,
      GATE_PASSABLE_POOL_LIMIT,
    ],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/**
 * How many active/trialing subscribers (human-sized phonebooks only) hold
 * each phone — the SAME predicate as the registration gate's social proof,
 * minus the spelling-variant fan-out: these phones come straight from
 * UserAlias rows, and the gate's variant matching can only find MORE owners,
 * so a target passing here is guaranteed to pass the door.
 */
async function subscribedHoldersForPhones(phones: string[]): Promise<Map<string, number>> {
  if (phones.length === 0) return new Map();
  const result = await query<{ phone: string; holders: string }>(
    `SELECT ua.phone, COUNT(DISTINCT ua."contactId") AS holders
     FROM "UserAlias" ua
     JOIN "User" u ON u.id = ua."contactId" AND u."deletedAt" IS NULL
       AND u.subscription_status = ANY($2)
     WHERE ua.phone = ANY($1)
       AND (SELECT COUNT(*) FROM "UserAlias" b
            WHERE b."contactId" = ua."contactId") <= $3
     GROUP BY ua.phone`,
    [phones, SUBSCRIBED_STATUSES, MAX_HUMAN_PHONEBOOK_ROWS],
    SCORE_QUERY_TIMEOUT_MS,
  );
  return new Map(result.rows.map((r) => [r.phone, Number(r.holders)]));
}

async function buildTargetListUncached(sinceDays: number): Promise<TargetScoreEntry[]> {
  const needs = await findUnmetNeeds(sinceDays);
  const candidates = gatherCandidates(needs);
  // The founder's pool joins as the primary source: gate-passable people
  // nobody happened to search for still belong on the list (pull 0, no
  // gap-filling claim); an unmet-needs match on the same phone keeps its
  // richer context from gatherCandidates.
  for (const person of await gatePassablePool()) {
    if (!candidates.has(person.phone)) {
      candidates.set(person.phone, {
        label: person.label,
        city: null,
        pull: 0,
        smallestPoolForItsTopics: Number.POSITIVE_INFINITY,
      });
    }
  }
  // Hard exclude #1 (Task 4 item 1), widened: the gate is „is this a person",
  // not „is this a Georgian SIM". Shape first — short codes and 0-800 lines
  // out — and a FOREIGN number then has to be held by the crowd (below, once
  // reach is known), because „a Georgian mobile or nothing" also excluded
  // every Georgian living abroad.
  const phones = Array.from(candidates.keys()).filter(isPlausibleMobile);

  const scoredCandidates = new Map(
    Array.from(candidates.entries()).filter(([phone]) => phones.includes(phone)),
  );
  const [
    reachMap,
    inviterMap,
    aliasMap,
    capacity,
    goalRelevant,
    bestVocabulary,
    holdersMap,
    factsMap,
    accountMap,
  ] = await Promise.all([
    reachForPhones(phones),
    bestInviterForPhones(phones),
    analyzeAliases(phones),
    countAskableUsers(),
    goalRelevantPhones(scoredCandidates),
    bestUserVocabulary(),
    subscribedHoldersForPhones(phones),
    fitFromFacts(phones),
    accountFactsForPhones(phones),
  ]);
  const ourOwn = ownPeopleDigits();

  const entries: TargetScoreEntry[] = [];
  for (const phone of phones) {
    const ctx = candidates.get(phone) as CandidateContext;
    const reach = reachMap.get(phone) ?? 0;
    // A foreign number one person saved is noise; one that many phonebooks
    // carry is a person who happens to live abroad.
    if (!foreignNumberHasCrowd(phone, reach)) continue;
    const analysis = aliasMap.get(phone);
    // Hard exclude #2: a brand word dominating the aliases at hotline reach
    // is a line, not a person (the tester's wissol/maksima/0-800 evidence).
    if (isHotline(analysis, reach)) continue;
    // Hard exclude #3 (the founder's target rule, 31 Aug via Misho): invite
    // ONLY people the registration door would let in — held by at least the
    // gate's own threshold of subscribers. An invited person who cannot
    // register is a wasted ask and a bad first impression.
    const subscribedHolders = holdersMap.get(phone) ?? 0;
    if (subscribedHolders < MIN_TARGET_SUBSCRIBED_HOLDERS) continue;
    const fit = fitFor(factsMap.get(phone), ctx.label);
    // Rule 2's exclusion pass runs BEFORE the score: an excluded person is
    // absent from the list, not ranked low on it.
    const excluded = exclusionFor(
      ctx.label,
      fit,
      analysis?.tradeVotes ?? 0,
      analysis?.nameConfirmed ?? false,
      accountMap.get(phoneDigits(phone)),
      ourOwn.has(phoneDigits(phone)),
      {
        dominantIsPlaceOrThing: analysis?.dominantIsPlaceOrThing ?? false,
        ownCompanyVotes: analysis?.ownCompanyVotes ?? 0,
      },
    );
    if (excluded !== null) continue;
    const inviter = inviterMap.get(phone) ?? null;
    const needsNetai = hasNeedsNetaiSignal(ctx.label);
    const gapFilling = ctx.smallestPoolForItsTopics <= GAP_FILLING_POOL_THRESHOLD;
    const isGoalRelevant = goalRelevant.has(phone);
    const isBestUserLookalike = tokenize(ctx.label).some((t) => bestVocabulary.has(t));
    // Rule 14 (c): the person is found first, then judged. When the candidate
    // label names nobody but the phonebooks do, the row carries the person's
    // name — a list a human reads must say who it is about.
    const label =
      analysis?.personLabel &&
      nameTokens(analysis.personLabel).length > nameTokens(ctx.label).length
        ? analysis.personLabel
        : ctx.label;
    entries.push({
      phone,
      label,
      city: ctx.city,
      score: combinedScore({
        fit: fit.level,
        reach,
        pull: ctx.pull,
        needsNetai,
        gapFilling,
        goalRelevant: isGoalRelevant,
        bestUserLookalike: isBestUserLookalike,
      }),
      inviter,
      route: inviter ? 'chorus' : 'direct',
      parts: {
        fit: fit.level,
        fit_source: fit.source,
        fit_evidence: fit.evidence,
        reach,
        pull: ctx.pull,
        needs_netai_signs: needsNetai,
        gap_filling_trade: gapFilling,
        goal_relevant: isGoalRelevant,
        best_user_lookalike: isBestUserLookalike,
        person_confirmed: analysis?.personConfirmed ?? false,
        subscribed_holders: subscribedHolders,
      },
    });
  }

  // Deterministic order (Task 4's "two reads a minute apart match"):
  // person-confirmed first, then score, then the phone string as the final
  // total tiebreak — no cluster of equal scores can shuffle the top-20 cut.
  entries.sort((a, b) => {
    if (a.parts.person_confirmed !== b.parts.person_confirmed) {
      return a.parts.person_confirmed ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.phone.localeCompare(b.phone);
  });
  return entries.slice(0, capacity);
}
