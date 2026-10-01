jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { toolDescription, webNumbersWithSource } from '../chat.service';
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
