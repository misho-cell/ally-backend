/**
 * 3235 (MASTER TEST RUN ME-024, seats 179996 and 180021): „ბახვა გამოგონილი
 * „სანიმუშო ბანკიდან" წამოვიდა, ახლა „საცდელ ლოჯისტიკაში" მუშაობს." The old
 * employer was corrected away — retracted and vetoed — so „who used to work at
 * the bank?" could no longer find him. A job the owner says ENDED is history,
 * not a mistake.
 */
const JOB_ENDED_RE =
  /(წამოვიდა|წავიდა|დატოვა|აღარ\s+მუშაობს|გაეთავისუფლა|გაათავისუფლეს|ადრე\s+მუშაობდა|მუშაობდა|ყოფილი|\bleft\b|\bquit\b|no\s+longer\s+works|used\s+to\s+work|former(?:ly)?|ушёл|ушел|уволил\p{L}*|больше\s+не\s+работает|раньше\s+работал\p{L}*|бывш\p{L}*|dejó|ya\s+no\s+trabaja|trabajaba)/iu;

/** Field types a job lives in; a correction of another field is never a job that ended. */
const JOB_FIELDS: ReadonlySet<string> = new Set(['employer', 'occupation', 'role']);

/** Did the owner's line say a job ended, for a correction of this field? */
export function correctionIsAJobThatEnded(
  ownerLine: string,
  fieldType: string | undefined,
): boolean {
  const field = (fieldType ?? '').trim().toLowerCase();
  if (field !== '' && !JOB_FIELDS.has(field)) return false;
  return JOB_ENDED_RE.test(ownerLine);
}
