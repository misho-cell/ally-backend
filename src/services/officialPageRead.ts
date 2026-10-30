import { isOfficialDomain } from './tools/webSearch';

/**
 * #8350 (tester 79211, the founder's P1, 30 Oct): the right name came back from
 * the search in 20 runs of 20, but the official page that names the office
 * holder was never opened. Each Gemini search took about 19 s, so one or two of
 * them spent the run's 25 s search clock, and the read of moh.gov.ge or
 * napr.gov.ge was refused as „budget spent". The answer then hedged on a name
 * the page would have confirmed.
 *
 * A run's first reads of an official page are never refused by the search
 * budget, and do not spend it. They are few, and they are the read that turns a
 * search result into a fact.
 */
export const OFFICIAL_READS_PAST_BUDGET = 2;
const PAGE_READ_TOOL = 'fetch_page';

/** True when this call reads an official page and the run still has such reads free. */
export function isFreeOfficialPageRead(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  readsSoFar: number,
): boolean {
  if (tool !== PAGE_READ_TOOL || readsSoFar >= OFFICIAL_READS_PAST_BUDGET) return false;
  const url = input['url'];
  return typeof url === 'string' && isOfficialDomain(url);
}
