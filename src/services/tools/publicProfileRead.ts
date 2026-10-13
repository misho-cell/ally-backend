/**
 * 4720 (box 54881, Lika's real phone, 12 Oct 13:58Z): asked about a person
 * outside her contacts, the run's web_search found the person's public LinkedIn
 * page — and the reply handed over the link, saying the current position could
 * not be confirmed. Only the second question read the page.
 *
 * Misho's choice A (12 Oct 15:16 UTC, §134): the server reads that one public
 * profile itself and hands the page over in the same search result, with where
 * and when it was read. One page per search, the first profile among the top
 * results; nothing is read when no profile is there.
 */
const PROFILE_URL_RE = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+/iu;
/** Only a profile near the top is the person searched for often enough to read. */
const TOP_RESULTS_LOOKED_AT = 3;
const MAX_PROFILE_CHARS = 6_000;

/**
 * CH (4720, the tester's 56073: facts given 3 of 3, but no date and once a bare
 * link). MODEL-FACING (D44): Misho's yes word for word, 13 Oct 11:2x UTC in the
 * operations chat, „ჩემგან ყველაფერზე კია" (§139). It rides with the page.
 */
export const PUBLIC_PROFILE_NOTE =
  'When you use public_profile, say where it is from and the day it was read (e.g. „LinkedIn, read 13 Oct"); never a bare link.';

export interface PublicProfilePage {
  readonly url: string;
  readonly read_on: string;
  readonly content: string;
  readonly note: string;
}

type PageReader = (url: string) => Promise<object>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The first public profile URL among the top results; null when there is none. */
export function profileUrlIn(found: object): string | null {
  const results = (found as Record<string, unknown>).results;
  if (!Array.isArray(results)) return null;
  for (const hit of results.slice(0, TOP_RESULTS_LOOKED_AT)) {
    if (isRecord(hit) && typeof hit.url === 'string' && PROFILE_URL_RE.test(hit.url)) {
      return hit.url;
    }
  }
  return null;
}

/** The page as handed over, or null when the read gave no text. */
export function profilePage(url: string, page: object, today: string): PublicProfilePage | null {
  const content = (page as Record<string, unknown>).content;
  if (typeof content !== 'string' || content.trim() === '') return null;
  return {
    url,
    read_on: today,
    content: content.slice(0, MAX_PROFILE_CHARS),
    note: PUBLIC_PROFILE_NOTE,
  };
}

/**
 * The search result with its profile page read, when it has one. A failed or
 * empty read leaves the result exactly as it was; `beforeRead` runs only when a
 * page is actually read (the cost is recorded there).
 */
export async function withPublicProfile(
  found: object,
  read: PageReader,
  beforeRead: () => Promise<void>,
  now: Date = new Date(),
): Promise<object> {
  const url = profileUrlIn(found);
  if (url === null) return found;
  try {
    await beforeRead();
    const page = profilePage(url, await read(url), now.toISOString().slice(0, 10));
    return page === null ? found : { ...(found as Record<string, unknown>), public_profile: page };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[public-profile] not read:', (err as Error).message);
    return found;
  }
}
