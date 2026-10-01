jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  titleIsAName,
  toolDescription,
  webNumbersWithSource,
  webPagesOf,
  withPageLinks,
} from '../chat.service';
import { RULE_A_WEB_LEAD_DETAILS } from '../testerRules';

/**
 * Question A — Tornike, 1 October („1 and 2 together"): a person Netai finds
 * on the web is shown with their name, a link to the page that lists them, and
 * the public phone / e-mail from that page — nothing else.
 */
describe('the rule', () => {
  it('asks for the name, the page link and only what that page shows', () => {
    expect(RULE_A_WEB_LEAD_DETAILS).toContain('the LINK to the page where they are listed');
    expect(RULE_A_WEB_LEAD_DETAILS).toContain('published on THAT page');
    expect(RULE_A_WEB_LEAD_DETAILS).toContain('never a detail from another page');
    // The tester's 952: later replies in a thread copied „[hidden]" from earlier ones.
    expect(RULE_A_WEB_LEAD_DETAILS).toContain('never write „[hidden]" yourself');
  });

  it('rides with web_search and in every run, beside 280', () => {
    expect(toolDescription('web_search')).toContain(RULE_A_WEB_LEAD_DETAILS);
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('${RULE_280_WEB_LEADS_ARE_PEOPLE}\\n${RULE_A_WEB_LEAD_DETAILS}`');
  });
});

describe('a number on a page the run opened may be shown', () => {
  it('reads the opened page the same way as a search result, with its link', () => {
    const page = {
      url: 'https://www.gba.ge/members/nino-beridze',
      content: 'Nino Beridze, attorney. Tel: +995 599 12 34 56',
    };
    expect(webNumbersWithSource(page)).toEqual([
      { phone: '+995 599 12 34 56', source: 'https://www.gba.ge/members/nino-beridze' },
    ]);
  });

  it('reads nothing from a page with no address', () => {
    expect(webNumbersWithSource({ content: 'Tel: +995 599 12 34 56' })).toEqual([]);
  });

  it('is registered for fetch_page, not only for web_search', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain("if (block.name === 'web_search' || block.name === 'fetch_page') {");
  });
});

/**
 * Question A, the tester's 947: phones showed, but only one of four web-found
 * people came with the link to the page that lists them. A directory page's
 * title is usually the person's name, so the reply's first mention of that
 * name gets the link when the reply does not already give it.
 */
describe('a web-found person is linked by name', () => {
  const pages = webPagesOf({
    results: [
      { title: 'მერაბ ჯიხვაშვილი', url: 'https://www.notary.ge/geo-3718-notary-580' },
      {
        title: 'სანოტარო ბიუროები - საქართველოს ნოტარიუსთა პალატა',
        url: 'https://www.notary.ge/p5',
      },
    ],
  });

  it('adds the page link after the first mention of a name-title', () => {
    const out = withPageLinks('მერაბ ჯიხვაშვილი, ქუთაისი. მერაბ ჯიხვაშვილი მედიატორიცაა.', pages);
    expect(out).toBe(
      'მერაბ ჯიხვაშვილი (https://www.notary.ge/geo-3718-notary-580), ქუთაისი. მერაბ ჯიხვაშვილი მედიატორიცაა.',
    );
  });

  it('adds nothing when the reply already gives the link', () => {
    const text = 'მერაბ ჯიხვაშვილი — https://www.notary.ge/geo-3718-notary-580';
    expect(withPageLinks(text, pages)).toBe(text);
  });

  it('only treats a short, letters-only title as a name', () => {
    expect(titleIsAName('მერაბ ჯიხვაშვილი')).toBe(true);
    expect(titleIsAName('სანოტარო ბიუროები - საქართველოს ნოტარიუსთა პალატა')).toBe(false);
    expect(titleIsAName('Notary 580')).toBe(false);
    expect(titleIsAName('კონტაქტი')).toBe(false);
  });

  it('is applied to the final reply before its numbers are wrapped', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('if (replySafe) cleanedFinal = withRunPageLinks(cleanedFinal, runId);');
    expect(at).toBeGreaterThan(0);
    expect(chat.indexOf('const reply = wrapAllowedNumbers(', at)).toBeGreaterThan(at);
    expect(chat).toContain('registerWebPages(runId, raw);');
  });
});
