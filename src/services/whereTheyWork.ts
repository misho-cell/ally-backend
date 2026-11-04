/**
 * #8524 (the tester's 80752 item 10, case 77; Misho's yes, 4 Nov, on the recommendation
 * „the server answers from the contact's known job, without the long search"): „სად
 * მუშაობს ნიკა?" took 27–35 s — model rounds spent deciding to look the person up.
 * The server looks the name up in the owner's own contacts before the first turn, and
 * the first turn answers from what it found.
 */
const MAX_NAME_WORDS = 4;
const MAX_NAME_CHARS = 40;
const ASKS_WHERE_RE: readonly RegExp[] = [
  /^სად\s+მუშაობს\s+(.+?)[?？.!]*$/u,
  /^(.+?)\s+სად\s+მუშაობს[?？.!]*$/u,
  /^where\s+does\s+(.+?)\s+work[?.!]*$/iu,
  /^where\s+is\s+(.+?)\s+working[?.!]*$/iu,
];

/** The name in „where does X work?", or null when the line is not that question. */
export function nameAskedWhereTheyWork(line: string): string | null {
  const text = line.trim();
  for (const re of ASKS_WHERE_RE) {
    const name = re.exec(text)?.[1]?.trim();
    if (name === undefined || name === '' || name.length > MAX_NAME_CHARS) continue;
    if (name.split(/\s+/u).length > MAX_NAME_WORDS) continue;
    return name;
  }
  return null;
}

interface FoundContact {
  readonly name?: unknown;
  readonly saved_as?: unknown;
  readonly tags?: unknown;
  readonly employer?: unknown;
  readonly jobPosition?: unknown;
  readonly city?: unknown;
  readonly approximate?: unknown;
}

const MAX_PEOPLE = 3;

function filled(value: unknown): boolean {
  return (
    (typeof value === 'string' && value.trim() !== '') || (Array.isArray(value) && value.length > 0)
  );
}

/** The exact matches, with what can answer „where" — never a phone (the tool path masks those). */
export function peopleToAnswerFrom(result: unknown): Record<string, unknown>[] {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  return (rows as FoundContact[])
    .filter((row) => row.approximate !== true)
    .filter((row) => [row.employer, row.jobPosition, row.tags].some(filled))
    .slice(0, MAX_PEOPLE)
    .map((row) => ({
      name: row.name ?? null,
      saved_as: row.saved_as ?? null,
      labels: row.tags ?? [],
      employer: row.employer ?? null,
      job: row.jobPosition ?? null,
      city: row.city ?? null,
    }));
}

/** Did the lookup find a contact with a job, an employer or a label to answer from? */
export function lookupAnswersIt(result: unknown): boolean {
  return peopleToAnswerFrom(result).length > 0;
}

/** The opening section the first turn answers from. */
export function whereTheyWorkSection(name: string, result: unknown): string {
  return (
    `\n\n## შენი კონტაქტებიდან უკვე მოძებნილია: „${name}"\n` +
    'მფლობელის კითხვაა, სად მუშაობს ეს ადამიანი. ქვემოთ მისი კონტაქტების ძებნის შედეგია — ' +
    'უპასუხე აქედან, მოკლედ, ახალი ძებნის გარეშე. თუ რამდენიმე ადამიანი მოიძებნა, ჰკითხე, რომელს გულისხმობს.\n' +
    JSON.stringify(peopleToAnswerFrom(result))
  );
}
