import { query } from '../../db/postgres/client';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';

// Ticket 4 item 4C: the channel sweep as a TOOL. Six prompt rewrites could not
// make the model go back and search alumni/club/chamber angles after it had
// already written an answer — an instruction to search harder does not fire,
// a tool does. Given a country, this reports which institutional channels
// exist in the user's OWN network, per channel, INCLUDING zeros — "no alumni
// angle" is an answer, not an omission.

const SAMPLE_NAMES_PER_CHANNEL = 3;
const CHANNEL_QUERY_TIMEOUT_MS = 15_000;
// Georgian country names decline (გერმანია → გერმანიის/გერმანელი); matching on
// the stem keeps every case and the derived nationality word.
const GEORGIAN_COUNTRY_SUFFIX = /(ეთი|ია|ა)$/u;

interface Channel {
  readonly key: string;
  readonly keywords: readonly string[];
}

const CHANNELS: readonly Channel[] = [
  {
    key: 'alumni_universities',
    keywords: [
      'უნივერსიტეტ',
      'კურსდამთავრებულ',
      'ალუმნ',
      'სტუდენტ',
      'აკადემი',
      'კოლეჯ',
      'alumni',
      'university',
      'college',
      'academy',
      'mba',
      'phd',
    ],
  },
  {
    key: 'clubs_fellowships',
    keywords: ['კლუბ', 'სტიპენდი', 'როტარი', 'club', 'fellowship', 'fellow', 'rotary', 'lions'],
  },
  {
    key: 'associations_chambers',
    keywords: [
      'ასოციაცი',
      'პალატ',
      'ფედერაცი',
      'გილდი',
      'კავშირ',
      'association',
      'chamber',
      'federation',
      'guild',
      'union',
    ],
  },
  {
    key: 'embassies_diplomacy',
    keywords: [
      'საელჩო',
      'ელჩ',
      'საკონსულო',
      'კონსულ',
      'დიპლომატ',
      'ატაშე',
      'embassy',
      'ambassador',
      'consul',
      'diplomat',
      'attache',
    ],
  },
  {
    key: 'bilateral_councils',
    keywords: ['საბჭო', 'ბიზნეს-საბჭო', 'ორმხრივ', 'council', 'bilateral', 'forum', 'ფორუმ'],
  },
] as const;

// The country field may carry the name in SEVERAL languages at once
// ("Germany გერმანია") — the tool description asks the model to do exactly
// that, because tags are stored in whatever language the contact was saved in
// and an English-only "Germany" matches neither "გერმანია" nor "germania"
// (ticket 6 PART D: that mismatch made Germany all-zeros from the connector).
const MIN_COUNTRY_TOKEN = 2;

function countryPatterns(country: string): string[] {
  const variants = new Set<string>();
  const tokens = country.split(/[\s,/]+/).filter((t) => t.length >= MIN_COUNTRY_TOKEN);
  for (const token of tokens) {
    for (const term of buildSearchTerms(token)) {
      variants.add(term);
      const stemmed = term.replace(GEORGIAN_COUNTRY_SUFFIX, '');
      if (stemmed.length >= 4) variants.add(stemmed);
    }
  }
  return [...variants].map(toWordStartPattern);
}

// Labels are compared LOWER()ed, so institution hints must be lowercased too —
// the raw "GIZ" pattern could never match a lowercased 'giz' tag (ticket 6
// PART D: the case mismatch zeroed named_institutions as well). Hyphen/space
// spellings both occur in tags ("goethe-institut" vs "goethe institut").
function institutionVariants(name: string): string[] {
  const lower = name.trim().toLowerCase();
  const variants = new Set<string>([lower]);
  if (lower.includes('-')) variants.add(lower.replace(/-/g, ' '));
  if (/\s/.test(lower)) variants.add(lower.replace(/\s+/g, '-'));
  return [...variants];
}

// A short acronym must match a whole token, never a prefix: word-start 'giz'
// swallowed the given name "Gizo" and the typo "giza" — 2 of Germany's 3
// samples were false positives (ticket 6 response §3.2). Longer names keep
// the prefix match so "goethe" still finds "goethe-institut".
const EXACT_TOKEN_MAX_CHARS = 4;

function institutionPattern(variant: string): string {
  const wordStart = toWordStartPattern(variant);
  return variant.length <= EXACT_TOKEN_MAX_CHARS ? `${wordStart}\\M` : wordStart;
}

interface ChannelHit {
  phone: string;
  name: string | null;
}

/**
 * One channel = contacts matching the country on ANY of their labels AND the
 * channel's keywords on any label. Labels = every contributor's tags, the
 * user's aliases, their saved insights and facts — the same surfaces search
 * reads. Every branch is driven FROM the materialized mine set (the
 * estimate-proof plan the search outage taught us).
 */
async function sweepChannel(
  userId: string,
  channelRegexes: readonly string[],
  countryRegexes: readonly string[],
  blockedPhones: readonly string[],
): Promise<ChannelHit[]> {
  // $1 userId(int-инferred), then country patterns, then channel patterns,
  // then facts userId (uncast — prod column is TEXT), then blocked.
  const countryStart = 2;
  const channelStart = countryStart + countryRegexes.length;
  const factsUserIdx = channelStart + channelRegexes.length;
  const insightsUserIdx = factsUserIdx + 1;
  const blockIdx = insightsUserIdx + 1;
  const orChain = (start: number, patterns: readonly string[]): string =>
    patterns.map((_, i) => `(LOWER(label) || '') ~ $${start + i}`).join(' OR ');

  const result = await query<ChannelHit>(
    `WITH mine AS MATERIALIZED (
       SELECT phone FROM "UserTags"  WHERE "contactId" = $1
       UNION
       SELECT phone FROM "UserAlias" WHERE "contactId" = $1
     ),
     labels AS MATERIALIZED (
       SELECT m.phone, lt.label
       FROM mine m
       CROSS JOIN LATERAL (
         SELECT LOWER(t.tag) AS label FROM "UserTags" t WHERE t.phone = m.phone
         UNION ALL
         SELECT LOWER(a.alias) FROM "UserAlias" a WHERE a.phone = m.phone
       ) lt
       UNION ALL
       SELECT cf.neo4j_contact_id, LOWER(cf.value)
       FROM contact_facts cf
       WHERE cf.submitted_by_user_id = $${factsUserIdx} AND cf.retracted_at IS NULL
       UNION ALL
       SELECT ci.neo4j_contact_id, LOWER(ci.data::text)
       FROM contact_insights ci
       WHERE ci.user_id = $${insightsUserIdx}
     ),
     country_hits AS (SELECT DISTINCT phone FROM labels WHERE ${orChain(countryStart, countryRegexes)}),
     channel_hits AS (SELECT DISTINCT phone FROM labels WHERE ${orChain(channelStart, channelRegexes)})
     SELECT c.phone, MAX(ua.alias) AS name
     FROM country_hits c
     JOIN channel_hits h ON h.phone = c.phone
     LEFT JOIN "UserAlias" ua ON ua.phone = c.phone AND ua."contactId" = $1
     WHERE c.phone != ALL($${blockIdx})
     GROUP BY c.phone`,
    [userId, ...countryRegexes, ...channelRegexes, userId, userId, [...blockedPhones]],
    CHANNEL_QUERY_TIMEOUT_MS,
  );
  return result.rows;
}

// The model supplies these — institution names imply their country without
// containing it: a "GIZ" tag never matches the word Germany, which made
// Germany return all zeros on a network full of GIZ contacts (ticket 5 PART
// D). Capped: this is a hint list, not a directory.
const MAX_KNOWN_INSTITUTIONS = 10;

export async function getCountryChannels(
  userId: string,
  country: string,
  knownInstitutions: readonly string[] = [],
): Promise<object> {
  try {
    const trimmed = country.trim();
    if (!trimmed) return { found: false, error: 'Pass a country name.' };
    const institutionRegexes = knownInstitutions
      .map((i) => i.trim())
      .filter((i) => i.length >= 2)
      .slice(0, MAX_KNOWN_INSTITUTIONS)
      .flatMap(institutionVariants)
      .map(institutionPattern);
    // An institution name counts as country evidence too — that is the whole
    // point of the hint list.
    const countryRegexes = [...countryPatterns(trimmed), ...institutionRegexes];
    const blockedPhones = await getExcludedPhones(userId);
    const excludedSet = new Set(blockedPhones.map(normalizePhone));

    const sweeps: { key: string; regexes: readonly string[] }[] = CHANNELS.map((c) => ({
      key: c.key,
      regexes: c.keywords.map(toWordStartPattern),
    }));
    if (institutionRegexes.length > 0) {
      // The institutions ARE a channel: a contact tagged "GIZ" belongs in the
      // Germany answer even when no generic channel keyword touches them.
      sweeps.push({ key: 'named_institutions', regexes: institutionRegexes });
    }

    const channels = [];
    for (const sweep of sweeps) {
      const hits = (
        await sweepChannel(userId, sweep.regexes, countryRegexes, blockedPhones)
      ).filter((h) => !excludedSet.has(normalizePhone(h.phone)));
      channels.push({
        channel: sweep.key,
        count: hits.length,
        sample: hits.slice(0, SAMPLE_NAMES_PER_CHANNEL).map((h) => ({
          phone: h.phone,
          name: h.name,
        })),
      });
    }
    return {
      found: true,
      country: trimmed,
      channels,
      note:
        'Name EVERY channel in the answer, including the empty ones — "no alumni angle in your ' +
        'network" is information the user needs. Use get_contact_full_profile before ' +
        'recommending anyone from a sample.',
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getCountryChannels error:', (err as Error).message);
    return { found: false, error: (err as Error).message };
  }
}
