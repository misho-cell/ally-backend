import { query } from '../db/postgres/client';
import { isCleanNameFor } from './readerSavedName';
import { nameKey } from './tools/transliterate';
import { georgianScriptName, learnGeorgianSpellings } from './georgianScriptName';

/**
 * #7728 (tester's engagement desk C-0020, 25 Oct): newcomers registered as
 * „Giorgi", „Kakha", „okromchedlishvili" — one word or lower case. The people
 * who saved them usually wrote the full name. The fullest clean label that
 * starts with (or holds) the registered word is proposed, most savers first;
 * null when the registered name is already full or nobody saved a full one.
 */
const QUERY_TIMEOUT_MS = 4_000;
const MAX_LABELS_READ = 200;
const MIN_FULL_NAME_WORDS = 2;
const MAX_FULL_NAME_WORDS = 3;
/**
 * Tester 27 Oct 02:20 (4/5): „matsi papava" found nothing — savers wrote
 * „Matsatso Papava". A registered word counts as present when a label word is
 * the same word or shares its first three letters (a short form: matsi, Matsatso; Gio, Giorgi).
 */
const SHARED_START_CHARS = 3;

function sameNameWord(registered: string, labelWord: string): boolean {
  if (registered === labelWord) return true;
  return (
    registered.length >= SHARED_START_CHARS &&
    labelWord.length >= SHARED_START_CHARS &&
    registered.slice(0, SHARED_START_CHARS) === labelWord.slice(0, SHARED_START_CHARS)
  );
}

/** One word, or all lower case: a name worth proposing a fuller form for. */
export function isPartialName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '') return true;
  const words = trimmed.split(/\s+/u);
  return words.length < MIN_FULL_NAME_WORDS || trimmed === trimmed.toLowerCase();
}

/** Two or three words, clean, and holding the registered word by sound. */
function fullFormOf(label: string, registered: string): string | null {
  const words = label.trim().split(/\s+/u);
  if (words.length < MIN_FULL_NAME_WORDS || words.length > MAX_FULL_NAME_WORDS) return null;
  if (!isCleanNameFor(label.trim(), '')) return null;
  const want = nameKey(registered)
    .split(' ')
    .filter((w) => w !== '');
  const has = nameKey(label).split(' ');
  return want.every((w) => has.some((h) => sameNameWord(w, h))) ? label.trim() : null;
}

/**
 * The most common full form among the labels others saved; ties go to the first seen.
 * #7728 retest (tester 76702): savers who wrote the registered name itself
 * („matsi papava") outnumbered those who wrote it in full („Matsatso Papava"),
 * so the suggestion was the name already there. A form that only repeats the
 * registered name counts only when no saver wrote anything fuller.
 */
export function mostCommonFullForm(labels: readonly string[], registered: string): string | null {
  const counts = new Map<string, { label: string; n: number }>();
  for (const label of labels) {
    const full = fullFormOf(label, registered);
    if (full === null) continue;
    const key = nameKey(full);
    const seen = counts.get(key);
    counts.set(key, { label: seen?.label ?? full, n: (seen?.n ?? 0) + 1 });
  }
  const registeredKey = nameKey(registered);
  const fuller = [...counts].filter(([key]) => key !== registeredKey).map(([, c]) => c);
  return mostSaved(fuller.length > 0 ? fuller : [...counts.values()]);
}

function mostSaved(forms: readonly { label: string; n: number }[]): string | null {
  let best: { label: string; n: number } | null = null;
  for (const c of forms) if (best === null || c.n > best.n) best = c;
  return best?.label ?? null;
}

/** A fuller name for a person registered with a partial one; null when none is needed or known. */
export async function suggestedFullName(
  userId: number,
  registered: string,
): Promise<string | null> {
  if (!isPartialName(registered)) return null;
  const result = await query<{ alias: string }>(
    `SELECT TRIM(ua.alias) AS alias
       FROM "UserAlias" ua
       JOIN "UserPhone" up ON up.phone = ua.phone
      WHERE up."userId" = $1 AND ua."contactId" <> $1 AND NULLIF(TRIM(ua.alias), '') IS NOT NULL
      LIMIT $2`,
    [userId, MAX_LABELS_READ],
    QUERY_TIMEOUT_MS,
  );
  const full = mostCommonFullForm(
    result.rows.map((r) => r.alias),
    registered,
  );
  if (full === null) return null;
  // Tester 27 Oct 02:20: „Giorgi Kipiani" came in Latin letters; a name is shown in Georgian.
  await learnGeorgianSpellings([full]);
  return georgianScriptName(full);
}
