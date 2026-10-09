import { hasGeorgian, nameKey } from './tools/transliterate';

/**
 * 3169 (SE-005, SE-022–SE-024, SD-023; seat 179960, 8 Oct): names came back in
 * the other alphabet — „დათო ტესტაძე" for Dato Testadze, „მაიკ სემპლი" for
 * Mike Sample, „Ana Tsdelidze" for ანა საცდელიძე — and the owner could not find
 * the person in their phone under the name Netai gave. A name is shown exactly
 * as the owner saved it, whatever language the reply is in.
 *
 * After the reply is written, a run of words that spells one of this run's
 * found names in the OTHER alphabet is put back as saved. Only a name of two
 * or three words, only across alphabets (so a Georgian case ending on a
 * Georgian name is never touched), and each word must read the same up to a
 * small spelling drift.
 */
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 3;
/** A word this long may drift this far in spelling and still be the same word. */
const DRIFT_FROM_CHARS = 4;
const MAX_WORD_DRIFT = 2;
const WORD_RE = /\p{L}[\p{L}'’]*/gu;
const BETWEEN_WORDS_RE = /^\s+$/u;

function asName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  const words = name.split(' ');
  if (words.length < MIN_NAME_WORDS || words.length > MAX_NAME_WORDS) return null;
  return words.every((w) => /^\p{L}[\p{L}'’-]*$/u.test(w)) ? name : null;
}

/** The two- and three-word names a search result shows (name, or the label it was saved as). */
export function savedNamesIn(raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object') return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const names = new Set<string>();
  for (const row of results) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as { name?: unknown; saved_as?: unknown };
    for (const value of [r.name, r.saved_as]) {
      const name = asName(value);
      if (name !== null) names.add(name);
    }
  }
  return [...names];
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** How far a written word drifts from a saved one, or null when they are not the same word. */
function wordDrift(written: string, saved: string): number | null {
  const a = nameKey(written);
  const b = nameKey(saved);
  if (a === '' || b === '') return null;
  if (a === b) return 0;
  if (Math.min(a.length, b.length) < DRIFT_FROM_CHARS) return null;
  const drift = editDistance(a, b);
  return drift <= MAX_WORD_DRIFT ? drift : null;
}

interface Found {
  readonly start: number;
  readonly end: number;
  readonly saved: string;
  /** The words' summed spelling drift from the saved name: 0 is the same spelling. */
  readonly drift: number;
}

function spellingsOf(reply: string, saved: string): Found[] {
  const savedWords = saved.split(' ');
  const words = [...reply.matchAll(WORD_RE)].map((m) => ({
    text: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  const found: Found[] = [];
  for (let i = 0; i + savedWords.length <= words.length; i += 1) {
    const window = words.slice(i, i + savedWords.length);
    const joined = window.every(
      (w, k) => k === 0 || BETWEEN_WORDS_RE.test(reply.slice(window[k - 1].end, w.start)),
    );
    if (!joined) continue;
    const written = reply.slice(window[0].start, window[window.length - 1].end);
    if (hasGeorgian(written) === hasGeorgian(saved)) continue;
    const drifts = window.map((w, k) => wordDrift(w.text, savedWords[k]));
    if (drifts.every((d): d is number => d !== null)) {
      const drift = drifts.reduce((sum, d) => sum + d, 0);
      found.push({ start: window[0].start, end: window[window.length - 1].end, saved, drift });
    }
  }
  return found;
}

/**
 * 3862 (SE-011, seat 181407, runs 1 and 4): „მაკა ადვოკატი" sits two letters
 * from „Nika advokati" as well as none from „Maka advokati", and the first
 * name in the list took the span — so Maka was shown as Nika, twice over.
 * One span, one name: the closest saved spelling wins, and when two are
 * equally close the reply's own words stay, because guessing names the wrong
 * person.
 */
function closestPerSpan(found: readonly Found[]): Found[] {
  const bySpan = new Map<string, Found[]>();
  for (const f of found) {
    const key = `${f.start}:${f.end}`;
    bySpan.set(key, [...(bySpan.get(key) ?? []), f]);
  }
  const kept: Found[] = [];
  for (const candidates of bySpan.values()) {
    const least = Math.min(...candidates.map((c) => c.drift));
    const closest = candidates.filter((c) => c.drift === least);
    if (new Set(closest.map((c) => c.saved)).size === 1) kept.push(closest[0]);
  }
  return kept;
}

/** The reply with every other-alphabet spelling of a found name put back as saved. */
export function withNamesAsSaved(reply: string, names: readonly string[]): string {
  const found = closestPerSpan(names.flatMap((name) => spellingsOf(reply, name))).sort(
    (a, b) => b.start - a.start,
  );
  let out = reply;
  let floor = Number.POSITIVE_INFINITY;
  for (const f of found) {
    if (f.end > floor) continue;
    out = out.slice(0, f.start) + f.saved + out.slice(f.end);
    floor = f.start;
  }
  return out;
}
