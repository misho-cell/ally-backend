import { query } from '../db/postgres/client';
import { getExcludedPhones } from './block.service';
import { normalizePhone } from './phone';
import { RunLanguage } from './runLanguage';
import { isDisplayableTag } from './tools/getContactFullProfile';
import { exactMatchesWithPhones } from './tools/searchByTag';

/**
 * 3170 (SE-031 step 3, seat 179960, 8 Oct): „ვინ მყავს ისეთი, ვინც ინვესტორი
 * არ არის…?" — the run searched nothing and named nobody: once it said a
 * negative cannot be searched, once it asked whether to leave non-investors
 * out of an investor search. The server answers it: the owner's tagged
 * contacts minus everyone the ordinary search finds for the word, a few by
 * name with what they are saved as. No model runs.
 */
const QUERY_TIMEOUT_MS = 6_000;
/** How many tagged contacts are read to choose from. */
const CANDIDATES_READ = 200;
export const NOT_TAGGED_SHOWN = 3;
const TAGS_SHOWN = 3;
/** A word shorter than this is a particle, not something a person is saved as. */
const MIN_TERM_CHARS = 3;
/** A Georgian noun this long or longer loses its last vowel to a case ending. */
const STEM_FROM_CHARS = 5;

const NEGATED_RES: readonly RegExp[] = [
  /ვინ[\s\S]{0,60}?ვინც\s+(\p{L}{3,})\s+არ\s+არის/u,
  /ვინ\s+არ\s+არის\s+(\p{L}{3,})/u,
  /\bwho(?:\s+is|'s)?\s+(?:not|isn't|is\s+not)\s+an?\s+(\p{L}{3,})/iu,
  /\bwho\s+isn't\s+an?\s+(\p{L}{3,})/iu,
];

/** The word a „who is NOT a …" question negates, or null when it is not one. */
export function negatedTerm(message: string): string | null {
  for (const re of NEGATED_RES) {
    const term = message.match(re)?.[1]?.toLowerCase();
    if (term !== undefined && term.length >= MIN_TERM_CHARS) return term;
  }
  return null;
}

function stemOf(term: string): string {
  return term.length >= STEM_FROM_CHARS ? term.slice(0, -1) : term;
}

export interface NotTaggedContact {
  readonly name: string;
  readonly tags: readonly string[];
}

interface TaggedRow {
  readonly phone: string;
  readonly name: string | null;
  readonly tags: string[] | null;
}

/** The owner's own tagged contacts, by name, each with their own tags. */
async function ownTaggedContacts(userId: string): Promise<TaggedRow[]> {
  const result = await query<TaggedRow>(
    `SELECT ut.phone,
            MAX(NULLIF(TRIM(ua.alias), '')) AS name,
            array_agg(DISTINCT ut.tag) AS tags
       FROM "UserTags" ut
       LEFT JOIN "UserAlias" ua ON ua.phone = ut.phone AND ua."contactId" = $1
      WHERE ut."contactId" = $1
      GROUP BY ut.phone
      ORDER BY name ASC NULLS LAST
      LIMIT $2`,
    [userId, CANDIDATES_READ],
    QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

/** A few of the owner's contacts who are NOT what the word says, with their tags. */
export async function contactsNotTagged(userId: string, term: string): Promise<NotTaggedContact[]> {
  const [matched, excluded, tagged] = await Promise.all([
    exactMatchesWithPhones(userId, term),
    getExcludedPhones(userId),
    ownTaggedContacts(userId),
  ]);
  // Only a word somebody is actually saved as: otherwise „who is not
  // available" would get three tagged people who are merely not tagged so.
  if (matched.length === 0) return [];
  const left = new Set([...matched.map((m) => m.phone), ...excluded].map(normalizePhone));
  const stem = stemOf(term);
  return tagged
    .filter((row) => !left.has(normalizePhone(row.phone)))
    .map((row) => ({
      name: (row.name ?? '').trim(),
      tags: (row.tags ?? []).filter(isDisplayableTag),
    }))
    .filter((c) => c.name !== '' && c.tags.length > 0)
    .filter((c) => !c.tags.some((tag) => tag.toLowerCase().includes(stem)))
    .slice(0, NOT_TAGGED_SHOWN)
    .map((c) => ({ name: c.name, tags: c.tags.slice(0, TAGS_SHOWN) }));
}

const LEAD: Readonly<Record<'ka' | 'en', (term: string) => string>> = {
  ka: (term) => `ამ ხალხთან „${term}" შენახული არ გაქვს:`,
  en: (term) => `None of these is saved as „${term}":`,
};

/** The server's answer: who is not, each with what they are saved as. */
export function notTaggedAnswer(
  term: string,
  contacts: readonly NotTaggedContact[],
  language: RunLanguage,
): string {
  const lead = (language === 'ka' ? LEAD.ka : LEAD.en)(term);
  const lines = contacts.map((c) => `• ${c.name} — ${c.tags.join(', ')}`);
  return [lead, ...lines].join('\n');
}
