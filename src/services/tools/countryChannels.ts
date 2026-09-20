import { query } from '../../db/postgres/client';
import { buildSearchTerms, toWordStartPattern } from './transliterate';
import { getExcludedPhones } from '../block.service';
import { normalizePhone } from '../phone';
import { searchDidNotFinish } from './searchDidNotFinish';

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

// Short acronyms ('GIZ', 'AHK') get exact-token matching from
// toWordStartPattern itself — the ≤4-char rule now lives in the shared
// matcher, one fix for all three affected tools (ticket 6 close §6).

interface ChannelHit {
  phone: string;
  name: string | null;
}

interface ChannelSweep {
  readonly key: string;
  readonly regexes: readonly string[];
}

/**
 * Every channel in ONE pass.
 *
 * A channel = contacts matching the country on any of their labels AND that
 * channel's keywords on any label. Labels = every contributor's tags, the
 * user's aliases, their saved insights and facts — the same surfaces search
 * reads. Every branch is driven FROM the materialized mine set (the
 * estimate-proof plan the search outage taught us).
 *
 * This used to run once PER CHANNEL, sequentially. Five channels, six when
 * institutions are named — and every one of them rebuilt the identical `mine`
 * and `labels` material from scratch, and re-ran the identical country scan.
 * Only the channel keywords differed.
 *
 * Measured on prod, 15 September, after the log showed it at 8.1s a sweep:
 *
 *   one sweep as it was          2278ms
 *   all six channels together    2058ms
 *
 * The same. The label build is the whole cost and the regex passes are nearly
 * free beside it, so six sweeps were paying six times for one answer — about
 * 48 seconds of database work for a single get_country_channels call, inside a
 * live conversation, where a person is waiting.
 *
 * The channels now ride in as (key, pattern) pairs and come back keyed, so one
 * build answers all of them.
 */
async function sweepAllChannels(
  userId: string,
  sweeps: readonly ChannelSweep[],
  countryRegexes: readonly string[],
  blockedPhones: readonly string[],
): Promise<Map<string, ChannelHit[]>> {
  const hits = new Map<string, ChannelHit[]>();
  for (const sweep of sweeps) hits.set(sweep.key, []);
  const channelKeys = sweeps.flatMap((s) => s.regexes.map(() => s.key));
  const channelRegexes = sweeps.flatMap((s) => [...s.regexes]);
  if (channelKeys.length === 0) return hits;

  // $1 userId, then the country patterns, then the two user ids the fact and
  // insight tables want (prod's columns are TEXT), then the channel pairs and
  // the block list.
  const countryStart = 2;
  const factsUserIdx = countryStart + countryRegexes.length;
  const insightsUserIdx = factsUserIdx + 1;
  const keysIdx = insightsUserIdx + 1;
  const regexesIdx = keysIdx + 1;
  const blockIdx = regexesIdx + 1;
  const countryChain = countryRegexes
    .map((_, i) => `(LOWER(label) || '') ~ $${countryStart + i}`)
    .join(' OR ');

  const result = await query<{ key: string; phone: string; name: string | null }>(
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
     country_hits AS (SELECT DISTINCT phone FROM labels WHERE ${countryChain}),
     chan AS (SELECT * FROM UNNEST($${keysIdx}::text[], $${regexesIdx}::text[]) AS t(key, rx)),
     /**
      * THE COUNTRY FILTER COMES FIRST, and that one line is the whole of row
      * 158.
      *
      * This tool had never once worked. Every call in thirty days — three of
      * three — died with „canceling statement due to statement timeout" at
      * 16.3 to 16.6 seconds. On the seat's hard goal of 17 September, two of
      * them burned 33 seconds of a 195-second run and returned nothing, and
      * the model carried on without them.
      *
      * The regex join ran over EVERY label of EVERY contact and only then met
      * the country. Measured on 501: 134,628 label rows against about 65
      * channel patterns is roughly 8.7 million regex evaluations — to find one
      * contact for Germany, and none at all for Finland.
      *
      * Joining country_hits before the patterns is the same result by
      * construction (it was an inner join on the same predicate, one step
      * later) and it hands the regexes one contact's labels instead of the
      * network's. Measured on production before changing anything: 418 ms,
      * against 16,500 ms and a certain failure.
      */
     channel_hits AS (
       SELECT DISTINCT c.key, l.phone
       FROM labels l
       JOIN country_hits co ON co.phone = l.phone
       JOIN chan c ON (LOWER(l.label) || '') ~ c.rx
     )
     SELECT h.key, h.phone, MAX(ua.alias) AS name
     FROM channel_hits h
     LEFT JOIN "UserAlias" ua ON ua.phone = h.phone AND ua."contactId" = $1
     WHERE h.phone != ALL($${blockIdx})
     GROUP BY h.key, h.phone`,
    [userId, ...countryRegexes, userId, userId, channelKeys, channelRegexes, [...blockedPhones]],
    CHANNEL_QUERY_TIMEOUT_MS,
  );

  for (const row of result.rows) {
    // A key the caller did not ask about cannot appear, but a Map miss here
    // would silently drop a real person — so it is created rather than skipped.
    const list = hits.get(row.key) ?? [];
    list.push({ phone: row.phone, name: row.name });
    hits.set(row.key, list);
  }
  return hits;
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
      .map(toWordStartPattern);
    // An institution name counts as country evidence too — that is the whole
    // point of the hint list.
    const countryRegexes = [...countryPatterns(trimmed), ...institutionRegexes];
    const blockedPhones = await getExcludedPhones(userId);
    const excludedSet = new Set(blockedPhones.map(normalizePhone));

    const sweeps: ChannelSweep[] = CHANNELS.map((c) => ({
      key: c.key,
      regexes: c.keywords.map(toWordStartPattern),
    }));
    if (institutionRegexes.length > 0) {
      // The institutions ARE a channel: a contact tagged "GIZ" belongs in the
      // Germany answer even when no generic channel keyword touches them.
      sweeps.push({ key: 'named_institutions', regexes: institutionRegexes });
    }

    const hitsByChannel = await sweepAllChannels(userId, sweeps, countryRegexes, blockedPhones);
    const channels = [];
    for (const sweep of sweeps) {
      const hits = (hitsByChannel.get(sweep.key) ?? []).filter(
        (h) => !excludedSet.has(normalizePhone(h.phone)),
      );
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
      // Surface-neutral wording (ticket 7 task 12 item 6): this note travels
      // to BOTH surfaces, where the profile tool has different names
      // (get_contact_full_profile in-app, get_contact_profile on the
      // connector) — naming either one misleads the other.
      note:
        'Name EVERY channel in the answer, including the empty ones — "no alumni angle in your ' +
        'network" is information the user needs. Open the contact\'s full profile before ' +
        'recommending anyone from a sample.',
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getCountryChannels error:', (err as Error).message);
    // A search that could not run is not an empty network — see searchDidNotFinish.
    return searchDidNotFinish('The country-channels search', err);
  }
}
