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
 * decision, 1694) — profession and industry only, ranking the search and never
 * shown to the asker. Widening this list changes that decision: ask him first.
 */
export const PROFILE_KEYS_MATCHED: readonly string[] = ['profession', 'industry'];

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
