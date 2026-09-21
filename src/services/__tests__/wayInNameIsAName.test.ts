jest.mock('../tools/webSearch', () => ({ __esModule: true, webSearch: jest.fn() }));
jest.mock('../tools/searchSecondDegree', () => ({
  __esModule: true,
  searchSecondDegree: jest.fn(),
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, searchByTag: jest.fn() }));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordFixedUsage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../toolCallLog.service', () => ({
  __esModule: true,
  logToolCall: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../searchQuery.service', () => ({ __esModule: true, distilSearchQuery: jest.fn() }));

import { webResultNames } from '../openingSearch.service';

/**
 * Ticket 20 row 154, the seat's done-when — the card is built from the raw
 * first web results.
 *
 * MEASURED 21 September by replaying the real titles of the last 60 opening
 * web searches, taken from this tool's own log, through webResultNames:
 *
 *   60 searches → 179 names → 140 distinct, of which 25 carried any Georgian
 *   signal at all.
 *
 * Four shapes came out. Three are mechanical and are what these tests hold:
 * page furniture („Terms of Service" appeared four times, „Publication" twice,
 * „Page 3" once), a platform's own name, and a data broker's host. The fourth
 * — a description rather than a name — is untouched on purpose, and the last
 * test in this file pins the seat's own example as STILL WRONG so nobody reads
 * „fixed" as more than it is.
 *
 * Every one of these strings then becomes a tag search against the owner's
 * phonebook, so the wrong ones cost a search as well as a line on a card.
 */
function results(...rows: [string, string][]): unknown {
  return { results: rows.map(([title, url]) => ({ title, url })) };
}

describe('a way-in name is a name, not a page', () => {
  it('skips the page furniture that reached live cards', () => {
    // Each of these was observed as an extracted "name" on 21 September.
    expect(webResultNames(results(['Terms of Service', 'https://www.netai.ai/terms']))).toEqual([
      'netai.ai',
    ]);
    expect(
      webResultNames(results(['Publication - GIST NetAI Laboratory', 'https://netai.smartx.kr/x'])),
    ).toEqual(['GIST NetAI Laboratory']);
    expect(
      webResultNames(results(['Page 3 | ACM SIGCOMM 2018', 'https://conf.example.org'])),
    ).toEqual(['ACM SIGCOMM 2018']);
  });

  it('does not take a platform for a firm, in the title or in the host', () => {
    expect(webResultNames(results(['Terms | LinkedIn', 'https://www.linkedin.com/legal']))).toEqual(
      [],
    );
    expect(
      webResultNames(
        results([
          'Some very long sentence about a thing that happened',
          'https://www.youtube.com/watch?v=1',
        ]),
      ),
    ).toEqual([]);
  });

  /** „NetAI Inc. | LinkedIn" must still be NetAI Inc. — the platform is the tail. */
  it('keeps the firm when the platform is only the tail of the title', () => {
    expect(
      webResultNames(results(['NetAI Inc. | LinkedIn', 'https://www.linkedin.com/company/x'])),
    ).toEqual(['NetAI Inc.']);
  });

  it('drops a data broker host, which sells contacts rather than being one', () => {
    expect(
      webResultNames(
        results([
          'A long sentence with far too many words in it to be a name',
          'https://rocketreach.co/x',
        ]),
      ),
    ).toEqual([]);
  });

  it('keeps an ordinary host, which usually does name a real firm', () => {
    expect(
      webResultNames(
        results([
          'A long sentence with far too many words in it to be a name',
          'https://modernroofing.ge/',
        ]),
      ),
    ).toEqual(['modernroofing.ge']);
  });

  /**
   * THE SEAT'S OWN EXAMPLE, PINNED AS STILL WRONG.
   *
   * „Custom Cabinets in North Georgia" — the American state — on a Tbilisi
   * carpenter goal. It is three words and not a page word, so it passes every
   * mechanical rule here, and telling a description from a name needs judgement
   * this function does not have. Row 154 stays open on the seat's list. If this
   * test ever fails, somebody has fixed that, and the comment above should stop
   * saying it is unfixed.
   */
  it('still lets a description through, and row 154 is still open because of it', () => {
    expect(
      webResultNames(results(['Custom Cabinets in North Georgia', 'https://example.com/cabinets'])),
    ).toEqual(['Custom Cabinets in North Georgia']);
  });
});
