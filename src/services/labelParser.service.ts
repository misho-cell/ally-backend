import { query } from '../db/postgres/client';
import { submitContactFact } from './contactFacts.service';
import { buildSearchTerms } from './tools/transliterate';

const PARSE_TIMEOUT_MS = 15_000;
// Live-caught against a real 2,698-contact phonebook (24 Aug): a threshold
// of 2 queued 2,277 of them — 84%. In a Georgian phonebook almost every
// contact IS exactly two words, first name and surname ("Gia Kublashvili",
// "სალომე მიქელაძე") — that is a name, not an unresolved trade. The one
// genuine positive example found in that same run was three words
// ("Zviad Elizbarashvili Arkitektura"). Raised to 3 on that evidence.
const MIN_QUEUE_WORDS = 3;

// v1 dictionary — the common trades and professions that actually show up
// in Georgian phonebook labels ("ზურა სანტექნიკოსი"). Deliberately not
// exhaustive; unresolved labels land in label_parse_queue rather than being
// silently dropped, so gaps here are visible and the dictionary can grow.
const GEORGIAN_OCCUPATIONS: readonly string[] = [
  'სანტექნიკოსი',
  'სანტექნიკი',
  'ხელოსანი',
  'ელექტრიკოსი',
  'ელექტრიკი',
  'ექიმი',
  'სტომატოლოგი',
  'იურისტი',
  'ადვოკატი',
  'მძღოლი',
  'ტაქსისტი',
  'დალაქი',
  'პარიკმახერი',
  'დამლაგებელი',
  'მზარეული',
  'შეფი',
  'მღებავი',
  'დურგალი',
  'მჭედელი',
  'შემდუღებელი',
  'დიზაინერი',
  'არქიტექტორი',
  'პროგრამისტი',
  'დეველოპერი',
  'ბუღალტერი',
  'მთარგმნელი',
  'ფოტოგრაფი',
  'მასაჟისტი',
  'მასწავლებელი',
  'პროფესორი',
  'ინჟინერი',
  'მენეჯერი',
  'დირექტორი',
  'დილერი',
  'აგენტი',
  'ბროკერი',
  'დარაჯი',
  'ვეტერინარი',
  'ფარმაცევტი',
  'მედდა',
  'ბანკირი',
  'ჟურნალისტი',
  'მსახიობი',
  'მუსიკოსი',
  'მხატვარი',
  'სტილისტი',
  'ვიზაჟისტი',
  'მწვრთნელი',
  'ფინანსისტი',
  'ეკონომისტი',
  'ნოტარიუსი',
  'ავტომექანიკოსი',
];

const ENGLISH_OCCUPATIONS: readonly string[] = [
  'plumber',
  'electrician',
  'doctor',
  'lawyer',
  'driver',
  'photographer',
  'engineer',
  'teacher',
  'accountant',
  'designer',
  'developer',
];

// Real labels are as often Latin-typed Georgian ("Santeknikosi") as native
// script, and there is no single canonical spelling (ქ alone types as both
// "k" and "q" depending on the person) — the same drift problem this
// codebase already solves for search (buildSearchTerms). Every Georgian
// entry expands into all of its search-term spelling variants at load time,
// each pointing back at the one canonical (Georgian-script) value to store.
// This is not exhaustive — a spelling buildSearchTerms doesn't generate
// still falls through to the ambiguity queue, not a false negative that
// looks like success.
//
// Live-caught gap (25 Aug): buildSearchTerms's q/k drift is a single global
// swap over the whole word, so a word with BOTH ქ and კ (elektrikosi has
// one of each) can only come out all-k or all-q ("elektriki"/"eleqtriqi") —
// never the mixed spelling a person actually types ("eleqtriki", q for the
// first letter, k for the second). That's a general limit of the shared
// transliteration engine, not something to rework here; these are the
// specific mixed spellings this dictionary is known to be missing.
const MANUAL_SPELLING_VARIANTS: Readonly<Record<string, string>> = {
  eleqtriki: 'ელექტრიკი',
  eleqtrikosi: 'ელექტრიკოსი',
};

// ხელოსანი ("handyman/tradesman") is the one deliberately generic entry in
// this dictionary — every other word names a specific trade. Live-caught
// (24 Aug): when a label carries both ("Vano Xelosani Eleqtrikosi"),
// matchOccupation returned whichever word happened to come first, so the
// vaguer word could win over a more specific one sitting right next to it
// in the same label. It never adds information the specific word doesn't
// already carry, so it always loses when anything else in the label also
// matched.
const GENERIC_OCCUPATION = 'ხელოსანი';

function buildDictionary(): Readonly<Record<string, string>> {
  const dict: Record<string, string> = {};
  for (const word of GEORGIAN_OCCUPATIONS) {
    for (const variant of buildSearchTerms(word)) dict[variant] = word;
  }
  for (const word of ENGLISH_OCCUPATIONS) {
    dict[word] = word.charAt(0).toUpperCase() + word.slice(1);
  }
  Object.assign(dict, MANUAL_SPELLING_VARIANTS);
  return dict;
}

const OCCUPATION_DICTIONARY = buildDictionary();

interface LabelRow {
  contactId: number;
  phone: string;
  alias: string;
}

// A token with no Georgian or Latin letter in it (an emoji, a bare digit) is
// never a real word — live-caught: "ლილუ 🐼😊" counted as two words and
// queued, when it's one name plus decoration.
const HAS_LETTER_RE = /[a-zა-ჿ]/i;

function wordsOf(alias: string): string[] {
  return alias
    .toLowerCase()
    .split(/[\s,._\-/\\]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && HAS_LETTER_RE.test(w));
}

export function matchOccupation(alias: string): string | null {
  let genericMatch: string | null = null;
  for (const word of wordsOf(alias)) {
    const match = OCCUPATION_DICTIONARY[word];
    if (!match) continue;
    if (match === GENERIC_OCCUPATION) {
      genericMatch = match;
      continue;
    }
    return match;
  }
  return genericMatch;
}

/**
 * Engine T2: parse one user's phonebook labels into starter occupation
 * facts. A recognized trade word writes a real contact_facts row (through
 * the existing submitContactFact path, so it gets the same public-matching
 * treatment as anything typed in chat). A label the dictionary can't place
 * — but that looks like it's TRYING to say something beyond a bare name
 * (2+ words) — goes to label_parse_queue instead of being silently dropped.
 * Never re-processes a phone this submitter already has an occupation fact
 * or a queue row for, so re-running an import is cheap.
 */
export async function parsePhonebookLabelsForUser(
  userId: string,
): Promise<{ parsed: number; queued: number }> {
  const candidates = await query<LabelRow>(
    `SELECT ua."contactId" AS "contactId", ua.phone, ua.alias
     FROM "UserAlias" ua
     WHERE ua."contactId" = $1
       AND NOT EXISTS (
         SELECT 1 FROM contact_facts cf
         WHERE cf.submitted_by_user_id = $1::text AND cf.neo4j_contact_id = ua.phone
           AND cf.field_type = 'occupation' AND cf.retracted_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM label_parse_queue q
         WHERE q.contact_id = $1 AND q.phone = ua.phone
       )`,
    [userId],
    PARSE_TIMEOUT_MS,
  );

  let parsed = 0;
  let queued = 0;
  for (const row of candidates.rows) {
    const occupation = matchOccupation(row.alias);
    if (occupation) {
      await submitContactFact(userId, row.phone, 'occupation', occupation, 'label', null);
      parsed++;
      continue;
    }
    if (wordsOf(row.alias).length >= MIN_QUEUE_WORDS) {
      await query(
        `INSERT INTO label_parse_queue (contact_id, phone, alias)
         VALUES ($1, $2, $3)
         ON CONFLICT (contact_id, phone) DO NOTHING`,
        [row.contactId, row.phone, row.alias],
        PARSE_TIMEOUT_MS,
      );
      queued++;
    }
  }
  return { parsed, queued };
}

export interface LabelQueueEntry {
  id: number;
  contact_id: number;
  phone: string;
  alias: string;
  created_at: string;
}

/** The ambiguity queue, newest first — what the parser could not place. */
export async function getLabelQueue(limit: number): Promise<LabelQueueEntry[]> {
  const result = await query<LabelQueueEntry>(
    `SELECT id, contact_id, phone, alias, created_at
     FROM label_parse_queue ORDER BY id DESC LIMIT $1::int`,
    [limit],
    PARSE_TIMEOUT_MS,
  );
  return result.rows;
}

// Live-caught: the admin route was reporting this page's row count as the
// queue's size — reading 2 when there were 2,277. The real total needs its
// own query.
export async function getLabelQueueTotal(): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM label_parse_queue`,
    [],
    PARSE_TIMEOUT_MS,
  );
  return Number(result.rows[0]?.count ?? 0);
}

export interface QueueReprocessResult {
  promoted: number;
  removed: number;
  remaining: number;
}

/**
 * Re-evaluates every row already sitting in label_parse_queue against
 * TODAY's dictionary and word-count rule — not just new phonebook imports.
 * Live-caught (25 Aug): the founder's ruling is that the existing base is
 * the asset, so a dictionary fix must reach contacts already queued or
 * already skipped, not just new ones — but parsePhonebookLabelsForUser's own
 * re-run guard (never touch a phone that already has a fact or a queue row)
 * means a later dictionary change never revisits what an earlier run
 * already decided. Proven live: re-running the backfill on a real account
 * left facts and queue counts completely unchanged after the "Eleqtriki"
 * fix shipped, because every one of its phones was already queued. This is
 * the catch-up pass — a queued row is promoted to a fact if today's
 * dictionary now resolves it, or dropped if today's stricter word-count
 * rule would never have queued it in the first place; a genuine unresolved
 * label is left untouched. Scope with userId for one account, omit for the
 * whole queue.
 */
export async function reprocessLabelQueue(userId?: string): Promise<QueueReprocessResult> {
  const candidates = await query<LabelQueueEntry>(
    userId
      ? `SELECT id, contact_id, phone, alias, created_at FROM label_parse_queue WHERE contact_id = $1::int`
      : `SELECT id, contact_id, phone, alias, created_at FROM label_parse_queue`,
    userId ? [userId] : [],
    PARSE_TIMEOUT_MS,
  );

  let promoted = 0;
  let removed = 0;
  let remaining = 0;
  for (const row of candidates.rows) {
    const occupation = matchOccupation(row.alias);
    if (occupation) {
      await submitContactFact(
        String(row.contact_id),
        row.phone,
        'occupation',
        occupation,
        'label',
        null,
      );
      await query(`DELETE FROM label_parse_queue WHERE id = $1`, [row.id], PARSE_TIMEOUT_MS);
      promoted++;
      continue;
    }
    if (wordsOf(row.alias).length < MIN_QUEUE_WORDS) {
      await query(`DELETE FROM label_parse_queue WHERE id = $1`, [row.id], PARSE_TIMEOUT_MS);
      removed++;
      continue;
    }
    remaining++;
  }
  return { promoted, removed, remaining };
}

export interface SavedFactReprocessResult {
  upgraded: number;
  unchanged: number;
}

/**
 * The counterpart to reprocessLabelQueue, for the OTHER half of what a
 * dictionary/matching fix can touch: facts already written, not just rows
 * still queued. Live-caught 25 Aug: the specificity fix (a generic word
 * like "ხელოსანი" losing to a specific trade sitting in the same label)
 * only changes what a FRESH parse decides — a fact already saved under the
 * old, order-dependent logic keeps whatever it originally matched,
 * forever, unless something re-runs matchOccupation against the ORIGINAL
 * label text. Explicitly asked for on the old (already-parsed) list, not
 * just new ones — re-joins each label-sourced occupation fact back to the
 * UserAlias row it came from, re-matches with TODAY's logic, and only
 * writes when the result actually changed (re-submitting an identical
 * value would be a no-op fact anyway, but skipping it keeps this an
 * honest "how many actually needed it" count). Goes through
 * submitContactFact — same path a fresh parse uses — so a corrected value
 * is re-checked for crowd/public status exactly like any other save, not
 * force-set. Table is tiny (81 rows product-wide) — no batching needed.
 */
export async function reprocessSavedOccupationFacts(): Promise<SavedFactReprocessResult> {
  const candidates = await query<{
    id: number;
    submitted_by_user_id: string;
    neo4j_contact_id: string;
    value: string;
    alias: string;
  }>(
    `SELECT cf.id, cf.submitted_by_user_id, cf.neo4j_contact_id, cf.value, ua.alias
     FROM contact_facts cf
     JOIN "UserAlias" ua
       ON ua."contactId" = cf.submitted_by_user_id::int AND ua.phone = cf.neo4j_contact_id
     WHERE cf.field_type = 'occupation' AND cf.source = 'label' AND cf.retracted_at IS NULL`,
    [],
    PARSE_TIMEOUT_MS,
  );

  let upgraded = 0;
  let unchanged = 0;
  for (const row of candidates.rows) {
    const rematched = matchOccupation(row.alias);
    if (rematched === null || rematched === row.value) {
      unchanged++;
      continue;
    }
    await submitContactFact(
      row.submitted_by_user_id,
      row.neo4j_contact_id,
      'occupation',
      rematched,
      'label',
      null,
    );
    upgraded++;
  }
  return { upgraded, unchanged };
}

export interface OwnLabelQueueEntry {
  phone: string;
  alias: string;
}

/**
 * One user's OWN unresolved labels, scoped by contact_id — the assistant
 * tool this backs. In-app, the phone is used the same way every other
 * in-app tool result is (e.g. to call save_contact_fact on it directly).
 * The MCP handler wraps this and encodes each phone into a contact_ref
 * before it reaches the connector — see mcpGetUnresolvedLabels.
 */
export async function getLabelQueueForUser(
  userId: string,
  limit: number,
): Promise<OwnLabelQueueEntry[]> {
  const result = await query<OwnLabelQueueEntry>(
    `SELECT phone, alias FROM label_parse_queue
     WHERE contact_id = $1::int ORDER BY id DESC LIMIT $2::int`,
    [userId, limit],
    PARSE_TIMEOUT_MS,
  );
  return result.rows;
}
