import { query } from '../db/postgres/client';
import { submitContactFact } from './contactFacts.service';

const PARSE_TIMEOUT_MS = 15_000;
// A one-word label ("გია", "Nino") is almost certainly a plain name — not
// worth queuing as an unresolved occupation guess. Only multi-word labels
// reach the ambiguity queue.
const MIN_QUEUE_WORDS = 2;

// v1 dictionary — the common trades and professions that actually show up
// in Georgian phonebook labels ("ზურა სანტექნიკოსი"). Deliberately not
// exhaustive; unresolved labels land in label_parse_queue rather than being
// silently dropped, so gaps here are visible and the dictionary can grow.
// Keys are lowercased; values are the occupation fact text to store.
const OCCUPATION_DICTIONARY: Readonly<Record<string, string>> = {
  სანტექნიკოსი: 'სანტექნიკოსი',
  სანტექნიკი: 'სანტექნიკოსი',
  ხელოსანი: 'ხელოსანი',
  ელექტრიკოსი: 'ელექტრიკოსი',
  ექიმი: 'ექიმი',
  სტომატოლოგი: 'სტომატოლოგი',
  იურისტი: 'იურისტი',
  ადვოკატი: 'ადვოკატი',
  მძღოლი: 'მძღოლი',
  ტაქსისტი: 'ტაქსისტი',
  დალაქი: 'დალაქი',
  პარიკმახერი: 'პარიკმახერი',
  დამლაგებელი: 'დამლაგებელი',
  მზარეული: 'მზარეული',
  შეფი: 'შეფ-მზარეული',
  მღებავი: 'მღებავი',
  დურგალი: 'დურგალი',
  მჭედელი: 'მჭედელი',
  შემდუღებელი: 'შემდუღებელი',
  დიზაინერი: 'დიზაინერი',
  არქიტექტორი: 'არქიტექტორი',
  პროგრამისტი: 'პროგრამისტი',
  დეველოპერი: 'დეველოპერი',
  ბუღალტერი: 'ბუღალტერი',
  მთარგმნელი: 'მთარგმნელი',
  ფოტოგრაფი: 'ფოტოგრაფი',
  მასაჟისტი: 'მასაჟისტი',
  მასწავლებელი: 'მასწავლებელი',
  პროფესორი: 'პროფესორი',
  ინჟინერი: 'ინჟინერი',
  მენეჯერი: 'მენეჯერი',
  დირექტორი: 'დირექტორი',
  დილერი: 'დილერი',
  აგენტი: 'აგენტი',
  ბროკერი: 'ბროკერი',
  დარაჯი: 'დარაჯი',
  ვეტერინარი: 'ვეტერინარი',
  ფარმაცევტი: 'ფარმაცევტი',
  მედდა: 'მედდა',
  ბანკირი: 'ბანკირი',
  ჟურნალისტი: 'ჟურნალისტი',
  მსახიობი: 'მსახიობი',
  მუსიკოსი: 'მუსიკოსი',
  მხატვარი: 'მხატვარი',
  სტილისტი: 'სტილისტი',
  ვიზაჟისტი: 'ვიზაჟისტი',
  მწვრთნელი: 'მწვრთნელი',
  ფინანსისტი: 'ფინანსისტი',
  ეკონომისტი: 'ეკონომისტი',
  ნოტარიუსი: 'ნოტარიუსი',
  ავტომექანიკოსი: 'ავტომექანიკოსი',
  plumber: 'Plumber',
  electrician: 'Electrician',
  doctor: 'Doctor',
  lawyer: 'Lawyer',
  driver: 'Driver',
  photographer: 'Photographer',
  engineer: 'Engineer',
  teacher: 'Teacher',
  accountant: 'Accountant',
  designer: 'Designer',
  developer: 'Developer',
};

interface LabelRow {
  contactId: number;
  phone: string;
  alias: string;
}

function wordsOf(alias: string): string[] {
  return alias
    .toLowerCase()
    .split(/[\s,._\-/\\]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function matchOccupation(alias: string): string | null {
  for (const word of wordsOf(alias)) {
    const match = OCCUPATION_DICTIONARY[word];
    if (match) return match;
  }
  return null;
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
      await submitContactFact(userId, row.phone, 'occupation', occupation);
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
