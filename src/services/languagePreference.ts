import { query } from '../db/postgres/client';
import { RunLanguage } from './runLanguage';

/**
 * D752 (the founder, 9 Oct: „Users request toward their assistant always
 * wins"): a person's own request for a language beats the conversation's
 * history, the app setting and the phone code. Until now nothing remembered
 * such a request: „მომწერე ინგლისურად" is written in Georgian, so the very
 * next reply read the line as Georgian and the request lost.
 *
 * The request is read from the owner's own line, stored, and read before any
 * other signal until they ask for another language.
 */
const PREFERENCE_KEY = 'reply_language';
const QUERY_TIMEOUT_MS = 4_000;
const LANGUAGES: readonly RunLanguage[] = ['ka', 'en', 'ru', 'es'];

interface LanguageRequest {
  readonly language: RunLanguage;
  readonly pattern: RegExp;
}

const KA_VERB =
  '(?:მომწერე|მწერე|დამიწერე|მიპასუხე|მელაპარაკე|ილაპარაკე|ისაუბრე|გადადი|გადავიდეთ|ვისაუბროთ)';
const EN_VERB = '(?:write|speak|talk|answer|reply|respond|switch|continue)';
const RU_VERB = '(?:пиши|напиши|говори|отвечай|ответь|переходи|перейди|давай)';
const ES_VERB = '(?:escríbeme|escribe|háblame|habla|responde|contesta|cambia|sigue)';

function request(
  language: RunLanguage,
  ka: string,
  en: string,
  ru: string,
  es: string,
): LanguageRequest {
  return {
    language,
    pattern: new RegExp(
      [
        `${ka}[\\s,]*${KA_VERB}|${KA_VERB}[\\s,]*${ka}`,
        `\\b${EN_VERB}\\b(?:\\s+(?:to\\s+me|me|with\\s+me|back))?\\s+(?:in|to)\\s+${en}\\b`,
        `${RU_VERB}[\\s,]+(?:со\\s+мной\\s+)?(?:${ru})`,
        `${ES_VERB}[\\s,]+(?:conmigo\\s+)?(?:en|al)\\s+${es}`,
      ].join('|'),
      'iu',
    ),
  };
}

const REQUESTS: readonly LanguageRequest[] = [
  request('en', 'ინგლისურად', 'english', 'по-английски|на\\s+английском', 'inglés'),
  request('ka', 'ქართულად', 'georgian', 'по-грузински|на\\s+грузинском', 'georgiano'),
  request('ru', 'რუსულად', 'russian', 'по-русски|на\\s+русском', 'ruso'),
  request('es', 'ესპანურად', 'spanish', 'по-испански|на\\s+испанском', 'español'),
];

/** The language the owner's own line asks for, or null when it asks for none. */
export function requestedLanguage(ownerLine: string): RunLanguage | null {
  const found = REQUESTS.filter((r) => r.pattern.test(ownerLine));
  // Two languages in one line („not in English, in Georgian") is not a request this can read.
  return found.length === 1 ? found[0].language : null;
}

export async function saveLanguagePreference(userId: string, language: RunLanguage): Promise<void> {
  await query(
    `INSERT INTO user_profile_kv (user_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
    [userId, PREFERENCE_KEY, language],
    QUERY_TIMEOUT_MS,
  );
}

/** The language this person asked for, or null when they never asked. */
export async function languagePreference(userId: string): Promise<RunLanguage | null> {
  const result = await query<{ value: string }>(
    `SELECT value FROM user_profile_kv WHERE user_id = $1 AND key = $2 LIMIT 1`,
    [userId, PREFERENCE_KEY],
    QUERY_TIMEOUT_MS,
  );
  const value = result.rows[0]?.value;
  return LANGUAGES.find((language) => language === value) ?? null;
}

/**
 * The owner's line, read for a request and remembered when it has one; then
 * the remembered language, if any. Null means nobody asked — the caller's own
 * reading stands. Never throws: a failed read keeps the caller's reading.
 */
export async function askedLanguage(
  userId: string,
  ownerLine: string,
): Promise<RunLanguage | null> {
  try {
    const asked = requestedLanguage(ownerLine);
    if (asked !== null) {
      await saveLanguagePreference(userId, asked);
      return asked;
    }
    return await languagePreference(userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[language-preference] user ${userId}:`, (err as Error).message);
    return null;
  }
}

/** The language the owner of this thread asked for — one query, read before the thread's lines. */
export async function threadLanguagePreference(threadId: number): Promise<RunLanguage | null> {
  const result = await query<{ value: string }>(
    `SELECT kv.value FROM threads t
       JOIN user_profile_kv kv ON kv.user_id = t.user_id::text AND kv.key = $2
      WHERE t.id = $1
      LIMIT 1`,
    [threadId, PREFERENCE_KEY],
    QUERY_TIMEOUT_MS,
  );
  const value = result.rows[0]?.value;
  return LANGUAGES.find((language) => language === value) ?? null;
}
