/**
 * What of a person's stored data finds them, at every level of the owner's
 * network (Misho, 13 Nov: „every level should read the way my own contacts
 * are read"). One list, read by the own-circle, second-circle and far
 * searches, so the levels cannot drift apart again.
 */

/**
 * Kinds of fact that never point at anyone, whatever their visibility: a
 * search must not become a covert read of someone's health, money, politics,
 * faith, love life or legal trouble.
 */
export const SENSITIVE_FACT_TYPES: readonly string[] = [
  'health',
  'medical',
  'illness',
  'diagnosis',
  'money',
  'income',
  'salary',
  'finance',
  'debt',
  'wealth',
  'politics',
  'political',
  'party',
  'religion',
  'religious',
  'faith',
  'relationship',
  'love',
  'dating',
  'marital_status',
  'affair',
  'criminal',
  'legal_issue',
  'arrest',
];

/**
 * Kinds that say what someone does, read by the searches that look for a
 * NAME (the name search, the way-in check): wider kinds such as notes or a
 * founder's words mention other people's names and would bring the wrong
 * person up under a name.
 */
export const WORK_FACT_TYPES: readonly string[] = [
  'occupation',
  'employer',
  'industry',
  'role',
  'affiliation',
];

/**
 * A member's own profile keys a search may match: §110.6 (Misho's privacy
 * decision, 1694) — profession and industry; widened by Misho, 13 Nov („წაიკითხე
 * ქალაქი და ინტერესებიც"; ADMIN_WRITE_OPERATIONS §121) to the city and the
 * interests the member told their own assistant. The text ranks the search and
 * is never shown to the asker. Widening this list again changes that decision:
 * ask him first.
 */
export const PROFILE_KEYS_MATCHED: readonly string[] = [
  'profession',
  'industry',
  'city',
  'interests',
];

/**
 * Misho, 13 Nov (stage 4, company base → our people): a person the company
 * base ties to a company, confirmed, is found by the company's name in either
 * script and by their role there, at every level — even when nobody saved
 * them under the company's name. Rows of (phone, text); possible ties (name
 * guesses) are never read, as the company search reads only confirmed ones.
 */
export const COMPANY_TIES_SQL = `SELECT l.phone, concat_ws(' ', c.name_en, c.legal_name_ka, l.role) AS text
       FROM person_company_links l
       JOIN companies c ON c.company_id = l.company_id
      WHERE l.status = 'confirmed'`;

/**
 * Misho, 13 Nov (one shared score): a person matched by several different
 * things said about them — a label, a fact, their profile, a company tie —
 * ranks above one matched by a single mention, after how many of the
 * searched words they match. Three different mentions count in full: past
 * that, closeness decides, so a much-tagged person never buries a closer one.
 */
export const EVIDENCE_COUNTED = 3;

/** How many different matching mentions a person has, at most EVIDENCE_COUNTED (an aggregate). */
export function evidenceScore(mentionExpr: string): string {
  return `LEAST(COUNT(DISTINCT ${mentionExpr}), ${EVIDENCE_COUNTED})`;
}

const SAFE_CONSTANT_RE = /^[a-z_]+$/u;

/**
 * A fixed list as a SQL text list („'a', 'b'"), for the queries that inline
 * their constant kinds. Only lowercase letters and underscores pass, so a
 * value can never carry a quote: these are code constants, never input.
 */
export function sqlConstantList(values: readonly string[]): string {
  return values
    .map((value) => {
      if (!SAFE_CONSTANT_RE.test(value)) throw new Error(`not a safe constant: ${value}`);
      return `'${value}'`;
    })
    .join(', ');
}
