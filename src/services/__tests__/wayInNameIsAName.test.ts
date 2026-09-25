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
// The LOCAL distiller is the real one on purpose: it makes no call and has no
// side effect, and a stub of it would hide the very thing row 253's second
// door is about — that an introduction goal reaches no provider at all.
jest.mock('../searchQuery.service', () => ({
  __esModule: true,
  distilSearchQuery: jest.fn(),
  distilIntroductionLocally: jest.requireActual('../searchQuery.service').distilIntroductionLocally,
}));

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
    // „Terms of Service" leaves nothing behind it: the host is no longer a
    // fallback, for the reason measured at `nameFromResult`.
    expect(webResultNames(results(['Terms of Service', 'https://www.netai.ai/terms']))).toEqual([]);
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

  /**
   * THIS TEST USED TO SAY THE OPPOSITE, AND THE TABLE IS WHY IT TURNED.
   *
   * It read „keeps an ordinary host, which usually does name a real firm" and
   * expected `modernroofing.ge`. „Usually" was an assumption and it had never
   * been checked. Over the whole life of the feature, 482 lookups:
   *
   *   found a way in                            37
   *   name was a bare host          106         0
   *   name was a description         90         0
   *
   * Not one host has ever matched a contact. So the host fallback is gone, and
   * with it the deny-list of platforms and brokers that was trying to patch it
   * one name at a time.
   */
  it('does not fall back to the host, because a host has never found anybody', () => {
    expect(
      webResultNames(
        results([
          'A long sentence with far too many words in it to be a name',
          'https://modernroofing.ge/',
        ]),
      ),
    ).toEqual([]);
  });

  /**
   * THE SEAT'S OWN EXAMPLE, AND THIS TEST IS THE ONE THAT TURNED.
   *
   * It read „still lets a description through, and row 154 is still open
   * because of it", and its comment said: „If this test ever fails, somebody
   * has fixed that." Somebody has.
   *
   * „Custom Cabinets in North Georgia" — the American state — on a Tbilisi
   * carpenter goal. Three words, no page word, so every mechanical rule passed
   * it. What settles it is not judgement but the same table: 90 lookups of a
   * description-shaped name, none of which ever matched a contact.
   */
  it('drops a description, which is the shape row 154 was written about', () => {
    expect(
      webResultNames(results(['Custom Cabinets in North Georgia', 'https://example.com/cabinets'])),
    ).toEqual([]);
    // Tonight's, from thread 22363 — „I have a problem with my apartment".
    expect(
      webResultNames(results(['Handyman Services in Greensboro, NC', 'https://example.com/h'])),
    ).toEqual([]);
  });

  /**
   * AND THE CONTROL, which matters more than either of the two above: the
   * names that DID find somebody must survive. A rule that drops everything
   * passes every test in this file up to here.
   */
  it('keeps a real firm name, including an odd one', () => {
    expect(webResultNames(results(['Nb Dental', 'https://example.com/1']))).toEqual(['Nb Dental']);
    expect(webResultNames(results(['PlacidWay', 'https://example.com/2']))).toEqual(['PlacidWay']);
    expect(webResultNames(results(['GNN-Powered AIOps', 'https://example.com/3']))).toEqual([
      'GNN-Powered AIOps',
    ]);
    // Kept whole, and that is the real behaviour rather than the tidy one:
    // TITLE_SEPARATORS carries „·" (U+00B7) and not „•" (U+2022), so this one
    // is never split. It is a real bilingual firm name from the log, it is
    // neither a host nor a description, and these two rules are not the place
    // to start trimming it.
    expect(webResultNames(results(['PrintWell • პრინტველი', 'https://example.com/4']))).toEqual([
      'PrintWell • პრინტველი',
    ]);
  });

  /**
   * The preposition rule is about ENGLISH and says nothing about Georgian. A
   * Georgian name that happens to contain one of those letter sequences inside
   * a word must not be caught by it — the rule needs spaces on both sides.
   */
  it('does not catch a preposition buried inside a word', () => {
    expect(webResultNames(results(['Intercity Group', 'https://example.com/5']))).toEqual([
      'Intercity Group',
    ]);
    expect(webResultNames(results(['Atlas Clinic', 'https://example.com/6']))).toEqual([
      'Atlas Clinic',
    ]);
  });
});

/**
 * ⚠️ A TITLE THAT IS ITSELF A WEB ADDRESS — the tester, 25 September.
 *
 * „გზა ჯერ ვერ ვნახე: My.Tbilisi.Gov.Ge, …" — a government website address
 * offered to the owner as somebody to chase. The host FALLBACK was removed in
 * September on exactly this evidence, and it did not close the door: when the
 * page's own TITLE is a host, it arrives as an ordinary segment and passes
 * every other test.
 *
 * MEASURED OVER EVERY WAY-IN LOOKUP THE PRODUCT HAS EVER MADE — 819:
 *
 *   titles that are a bare host      123 looked      0 found
 *   everything else                  694 looked     70 found
 */
describe('a web address is not somebody to chase', () => {
  const resultsWith = (title: string): unknown => ({ results: [{ title, url: 'https://x.test' }] });

  it('drops a title that is just a host', () => {
    for (const host of ['My.Tbilisi.Gov.Ge', 'electrik.ge', 'whatclinic.com', 'preply.com']) {
      expect(webResultNames(resultsWith(host))).toEqual([]);
    }
  });

  it('keeps a real name that merely contains a dot', () => {
    expect(webResultNames(resultsWith('Dr. Nino Beridze'))).toEqual(['Dr. Nino Beridze']);
  });

  /** A host inside a longer title is not the whole segment, and stays. */
  it('does not drop a name because a host sits beside it', () => {
    expect(webResultNames(resultsWith('Astra Dental Clinic | astra.ge'))).toEqual([
      'Astra Dental Clinic',
    ]);
  });

  /**
   * ⚠️ THE THREE SHAPES THAT LOOK LIKE JUNK AND ARE NOT, kept because the same
   * measurement refuted them: „contains digits" 12 looked / 2 found, „handle
   * or email" 6 / 1, „a date" 4 / 1. I would have filtered all three on how
   * they read. A test, so the next person does not.
   */
  it('keeps the shapes that read like junk and have found real contacts', () => {
    expect(webResultNames(resultsWith('Elektrik 24/7'))).toEqual(['Elektrik 24/7']);
    expect(webResultNames(resultsWith('Kakha Kaladze (@kakhakaladze)'))).toEqual([
      'Kakha Kaladze (@kakhakaladze)',
    ]);
  });
});
