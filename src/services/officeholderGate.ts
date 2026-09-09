import { georgianToLatin, hasGeorgian } from './tools/transliterate';
import { RunLanguage, RUN_STRINGS } from './runLanguage';

/**
 * Ticket 12 Task 46 (D151, the founder 9 Sep): an official's name only from a
 * page actually read — otherwise „could not verify".
 *
 * One question gave three different names for one office in 35 minutes. The
 * prompt already says „never from memory", and the web tools already say „a
 * name you print must appear in fetched page text"; this is the same rule in
 * code, so it holds when the model does not. The run collects EVIDENCE — the
 * user's own words and every tool result except web-search snippets (a snippet
 * may be stale or name a former holder; the rule is the PAGE) — and the final
 * reply is checked: a sentence that names an office (minister, director, CEO,
 * mayor …) may carry a person's name only if that name is in the evidence. A
 * name that is not is replaced by the scripted line in the run's language. A
 * sentence about a FORMER holder is left alone — that is history, not a live
 * fact, and the rule is about who holds the office today.
 */

const evidenceByRun = new Map<string, string[]>();
const MAX_EVIDENCE_CHARS_PER_RUN = 400_000;

/** Add text the run has actually received (user message, tool result, fetched page). */
export function recordRunEvidence(runId: string | undefined, text: string): void {
  if (!runId || !text) return;
  const list = evidenceByRun.get(runId) ?? [];
  const held = list.reduce((sum, t) => sum + t.length, 0);
  if (held >= MAX_EVIDENCE_CHARS_PER_RUN) return;
  list.push(text.toLowerCase());
  evidenceByRun.set(runId, list);
}

export function clearRunEvidence(runId: string | undefined): void {
  if (runId) evidenceByRun.delete(runId);
}

// Office words. Georgian is caseless and declines, so stems are matched at a
// token start; the English list is whole-word.
const OFFICE_RE_KA =
  /(^|[^ა-ჰ])(მინისტრ|დირექტორ|ხელმძღვანელ|თავმჯდომარ|უფროს|პრეზიდენტ|გუბერნატორ|დეპუტატ|რექტორ|გამგებელ|კომისარ|ელჩ|მერი|მერია|მერის|მერმა|მერს|პრემიერ)/;
const OFFICE_RE_EN =
  /\b(minister|director|ceo|cfo|coo|cto|chair|chairman|chairwoman|chairperson|head|president|mayor|governor|deputy|rector|secretary|commissioner|ambassador|premier)\b/i;
const OFFICE_RE_RU =
  /(министр|директор|председател|глав|президент|мэр|губернатор|посол|руководител)/i;
const OFFICE_RE_ES =
  /\b(ministro|ministra|director|directora|presidente|presidenta|alcalde|alcaldesa|gobernador|gobernadora|embajador|embajadora|jefe|jefa)\b/i;

// A FORMER holder is history, not a live fact: the sentence is left alone.
const FORMER_RE = /(ყოფილ|\bformer\b|\bex-|бывш|\bexpresident|\bantigu[oa]\b|\bex\s)/i;

// Words that look like names in Latin script but are not people.
const LATIN_NOT_A_NAME = new Set([
  'the',
  'in',
  'at',
  'of',
  'and',
  'city',
  'hall',
  'bank',
  'national',
  'ministry',
  'service',
  'agency',
  'revenue',
  'finance',
  'georgia',
  'georgian',
  'tbilisi',
  'batumi',
  'kutaisi',
  'state',
  'office',
  'department',
  'council',
  'committee',
  'parliament',
  'government',
  'university',
  'company',
  'group',
  'holding',
  'llc',
  'jsc',
  'ltd',
  'board',
  'general',
  'executive',
  'managing',
  'prime',
  'first',
  'vice',
  'acting',
  'new',
  'old',
]);

// Georgian surname endings — a token pair „X Yშვილი" is a person.
const KA_SURNAME_RE = /(შვილი|ძე|იანი|ავა|უა|აია|ოვი|ევი|სკი)$/;
const KA_NOT_A_FIRST_NAME = new Set([
  'ახალი',
  'ყოფილი',
  'ამჟამინდელი',
  'ბატონი',
  'ქალბატონი',
  'არის',
  'იყო',
  'უფროსი',
  'გენერალური',
  'აღმასრულებელი',
]);
const LATIN_NAME_RE = /\b([A-Z][a-z]{1,}(?:-[A-Z][a-z]+)?)\s+([A-Z][a-z]{2,}(?:-[A-Z][a-z]+)?)\b/g;
const KA_TOKEN_RE = /[ა-ჰ]+/g;
const MIN_KA_FIRST_NAME = 3;
const MIN_STEM = 4;
const SENTENCE_SPLIT_RE = /(?<=[.!?…\n])\s+|\n/;

function namesOffice(sentence: string): boolean {
  return (
    OFFICE_RE_KA.test(sentence) ||
    OFFICE_RE_EN.test(sentence) ||
    OFFICE_RE_RU.test(sentence) ||
    OFFICE_RE_ES.test(sentence)
  );
}

function latinNameCandidates(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(LATIN_NAME_RE)) {
    const [, first, last] = m;
    if (LATIN_NOT_A_NAME.has(first.toLowerCase()) || LATIN_NOT_A_NAME.has(last.toLowerCase()))
      continue;
    if (OFFICE_RE_EN.test(first) || OFFICE_RE_EN.test(last)) continue;
    out.push(`${first} ${last}`);
  }
  return out;
}

function georgianNameCandidates(sentence: string): string[] {
  const tokens = sentence.match(KA_TOKEN_RE) ?? [];
  const out: string[] = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const first = tokens[i - 1];
    const last = tokens[i];
    if (!KA_SURNAME_RE.test(last)) continue;
    if (first.length < MIN_KA_FIRST_NAME || KA_NOT_A_FIRST_NAME.has(first)) continue;
    if (OFFICE_RE_KA.test(` ${first}`)) continue;
    out.push(`${first} ${last}`);
  }
  return out;
}

export function nameCandidates(sentence: string): string[] {
  return [...latinNameCandidates(sentence), ...georgianNameCandidates(sentence)];
}

// A declined Georgian name („დავითაშვილმა", „დავითაშვილის") still carries its
// stem, so the check is on stems; a Latin name is checked whole per token.
function stemOf(token: string): string {
  const lower = token.toLowerCase();
  if (hasGeorgian(lower) && lower.length > MIN_STEM) return lower.slice(0, -1);
  return lower;
}

function nameInEvidence(name: string, evidence: string): boolean {
  const tokens = name.split(/\s+/).filter(Boolean);
  const direct = tokens.every((t) => evidence.includes(stemOf(t)));
  if (direct) return true;
  if (!hasGeorgian(name)) return false;
  // A Georgian reply about an English page: the transliterated name may be there.
  return tokens.every((t) => evidence.includes(stemOf(georgianToLatin(t))));
}

export interface OfficeholderGateOutcome {
  reply: string;
  /** Names replaced by the scripted line. */
  refused: string[];
}

/**
 * Check a final reply against the run's evidence and replace every unverified
 * officeholder name with the scripted line. Pure on its inputs apart from the
 * evidence store; returns the reply unchanged when nothing names an office.
 */
export function applyOfficeholderGate(
  reply: string,
  runId: string | undefined,
  language: RunLanguage,
): OfficeholderGateOutcome {
  const evidence = (runId ? (evidenceByRun.get(runId) ?? []) : []).join('\n');
  const refused: string[] = [];
  const sentences = reply.split(SENTENCE_SPLIT_RE);
  let out = reply;
  for (const sentence of sentences) {
    if (!namesOffice(sentence) || FORMER_RE.test(sentence)) continue;
    for (const name of nameCandidates(sentence)) {
      if (nameInEvidence(name, evidence)) continue;
      refused.push(name);
      out = out.split(name).join(RUN_STRINGS[language].nameNotVerified);
    }
  }
  return { reply: out, refused };
}
