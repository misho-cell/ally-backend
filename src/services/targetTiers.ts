// Types only — the scoring module imports this one at runtime, so a value
// import here would be a load-order cycle.
import type { FitLevel, FitSignal, TargetInviter } from './targetScoring.service';
import { OWNERSHIP_WORDS, ROLE_WORDS } from './labelDictionaries';

/**
 * The criteria file's three tiers, its doors and its pluses, on every row of
 * the target list (Ticket 10 Task 5; `NETAI_CHORUS_CRITERIA_2026-08-31.md`).
 *
 * DOORS are the five gates G1–G5 — the only things that exclude anybody. G1
 * (a trade), G2 (a company line) and „our own people / already paying" are
 * applied before a row exists and counted in the gate ledger. Two are carried
 * on the row itself: G3 (living in Georgia) — readable only where a public
 * city fact exists, unknown otherwise; and G5 (nothing findable), which is the
 * NOT YET state, never an OUT. G4 (too powerful, no gap) is a human judgment
 * and is not faked here.
 *
 * PLUSES are the R-signals the data can read: R1 a role or company word in
 * the labels, R9 a senior manager at a real company, R10 phonebooks (capped),
 * R11 a warm inviter exists, plus membership (THE TARGETS, D103). R2–R8 live
 * on LinkedIn and the web and enter only through the founder's own yes.
 *
 * TIERS: BEST — the facts say owner/founder/C-level, or the founder said yes;
 * GOOD — a role, a company, a membership, a senior post: "GOOD (9) at least";
 * NOT YET — nothing readable yet. Parked, ranked last, never dropped (Rule 6).
 */

export type TargetTier = 'BEST' | 'GOOD' | 'NOT_YET';

export interface TargetDoors {
  /** G3: from a public city fact; null when no such fact exists. */
  in_georgia: boolean | null;
  /** G5: something readable says what this person does. false = NOT YET. */
  findable: boolean;
}

export type PlusCode = 'R1' | 'R9' | 'R10' | 'R11' | 'M' | 'F';

export interface TargetPlus {
  code: PlusCode;
  note: string;
}

/** R10 is capped: above this the criteria file wants a web check first. */
export const REACH_PLUS_CAP = 100;
const REACH_PLUS_MIN = 3;

/** Words that say „a senior manager at a real company" (R9), both scripts. */
export const SENIOR_MANAGER_WORDS = [
  'general manager',
  'country manager',
  'managing director',
  'regional manager',
  'head of',
  'გენერალური მენეჯერი',
  'გენერალური დირექტორი',
  'აღმასრულებელი დირექტორი',
  'დეპარტამენტის უფროსი',
  'executive director',
  'vice president',
  'vp ',
  'senior manager',
  'director',
  'დირექტორი',
];

/**
 * Georgia and its towns and regions, both scripts and the Latin spellings the
 * base actually uses. „Georgia (moved back from LA)" is in Georgia; a place
 * outside this list with a city fact is not. The US state shares the name —
 * a public fact that says only "Georgia" is read as the country, which is
 * where this base lives.
 */
const GEORGIAN_PLACES = [
  'georgia',
  'sakartvelo',
  'საქართველო',
  'tbilisi',
  'თბილისი',
  'batumi',
  'ბათუმი',
  'kutaisi',
  'ქუთაისი',
  'rustavi',
  'რუსთავი',
  'gori',
  'გორი',
  'zugdidi',
  'ზუგდიდი',
  'poti',
  'ფოთი',
  'telavi',
  'თელავი',
  'kobuleti',
  'ქობულეთი',
  'borjomi',
  'ბორჯომი',
  'mtskheta',
  'მცხეთა',
  'sighnaghi',
  'სიღნაღი',
  'kakheti',
  'კახეთი',
  'adjara',
  'achara',
  'აჭარა',
  'imereti',
  'იმერეთი',
  'samegrelo',
  'სამეგრელო',
  'guria',
  'გურია',
  'svaneti',
  'სვანეთი',
  'racha',
  'რაჩა',
  'kazbegi',
  'stepantsminda',
  'ყაზბეგი',
  'ambrolauri',
  'ამბროლაური',
  'ozurgeti',
  'ოზურგეთი',
  'akhaltsikhe',
  'ახალციხე',
  'marneuli',
  'მარნეული',
  'zestafoni',
  'ზესტაფონი',
  'samtredia',
  'სამტრედია',
  'senaki',
  'სენაკი',
  'khashuri',
  'ხაშური',
  'tskaltubo',
  'წყალტუბო',
  'gardabani',
  'გარდაბანი',
  'sagarejo',
  'საგარეჯო',
  'gurjaani',
  'გურჯაანი',
  'lagodekhi',
  'ლაგოდეხი',
  'kaspi',
  'კასპი',
  'chiatura',
  'ჭიათურა',
  'tkibuli',
  'ტყიბული',
  'bolnisi',
  'ბოლნისი',
  'dusheti',
  'დუშეთი',
  'mestia',
  'მესტია',
];

function containsAny(haystack: string, words: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/** G3, read from a public city fact. Null = no fact, so the door is unknown, not failed. */
export function inGeorgia(city: string | null): boolean | null {
  if (city === null || city.trim() === '') return null;
  return containsAny(city, GEORGIAN_PLACES);
}

export interface PlusInputs {
  fit: FitSignal;
  label: string;
  factValues: readonly string[] | undefined;
  reach: number;
  inviter: TargetInviter | null;
  approvedByFounder: boolean;
}

/** The pluses the data can read, each with the evidence that fired it. */
export function plusesFor(input: PlusInputs): TargetPlus[] {
  const pluses: TargetPlus[] = [];
  const facts = (input.factValues ?? []).join(' ');
  if (input.approvedByFounder) {
    pluses.push({ code: 'F', note: 'the founder said yes (his LinkedIn/web judgment, R2–R8)' });
  }
  if (containsAny(input.label, OWNERSHIP_WORDS) || containsAny(input.label, ROLE_WORDS)) {
    pluses.push({ code: 'R1', note: `a role or company word in the labels: „${input.label}"` });
  }
  if (containsAny(facts, SENIOR_MANAGER_WORDS)) {
    const hit = (input.factValues ?? []).find((v) => containsAny(v, SENIOR_MANAGER_WORDS));
    pluses.push({ code: 'R9', note: `a senior manager on the facts: ${hit ?? ''}`.trim() });
  }
  if (facts.toLowerCase().includes('member_of:')) {
    const hit = (input.factValues ?? []).find((v) => v.toLowerCase().startsWith('member_of:'));
    pluses.push({ code: 'M', note: `a member: ${hit ?? ''}`.trim() });
  }
  if (input.reach >= REACH_PLUS_MIN) {
    const shown = Math.min(input.reach, REACH_PLUS_CAP);
    pluses.push({
      code: 'R10',
      note:
        input.reach > REACH_PLUS_CAP
          ? `held by ${input.reach} phonebooks — counted as ${REACH_PLUS_CAP}, web check first`
          : `held by ${shown} phonebooks`,
    });
  }
  if (input.inviter !== null) {
    pluses.push({
      code: 'R11',
      note: `a warm inviter exists (user ${input.inviter.user_id}, warmth ${input.inviter.warmth})`,
    });
  }
  return pluses;
}

/** BEST · GOOD · NOT YET, from fit and the founder's own yes. */
export function tierFor(fit: FitLevel, approvedByFounder: boolean): TargetTier {
  if (approvedByFounder || fit === 'strong') return 'BEST';
  if (fit === 'moderate' || fit === 'weak') return 'GOOD';
  return 'NOT_YET';
}

export function doorsFor(city: string | null, fit: FitLevel): TargetDoors {
  return { in_georgia: inGeorgia(city), findable: fit !== 'not_yet' };
}
