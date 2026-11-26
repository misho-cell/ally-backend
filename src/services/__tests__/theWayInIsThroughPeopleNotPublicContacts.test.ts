/**
 * Misho, 26 Nov (point 5): the way in is through the owner's own people — no
 * public numbers, emails or links, unless the owner asks for them directly.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  askedForPublicContacts,
  CONTACT_HIDDEN,
  hiddenContactsIn,
  PUBLIC_CONTACTS_PARAM,
  withoutLinks,
  withoutPublicContacts,
} from '../publicContacts';

describe('the web’s contact details are hidden from the model', () => {
  it('hides phone numbers and emails, and keeps prices, years and counts', () => {
    const text =
      'Call +995 555 12 34 56 or 032 2 00 00 00, write info@example.ge. Founded 2015, 1 000 000 ₾, 250 staff.';
    const hidden = hiddenContactsIn(text);
    expect(hidden).not.toContain('555 12 34 56');
    expect(hidden).not.toContain('032 2 00 00 00');
    expect(hidden).not.toContain('info@example.ge');
    expect(hidden).toContain(CONTACT_HIDDEN);
    expect(hidden).toContain('2015');
    expect(hidden).toContain('1 000 000 ₾');
    expect(hidden).toContain('250 staff');
  });

  it('keeps a page’s own address so it can still be read', () => {
    const result = {
      results: [
        { title: 'Firm', url: 'https://firm.example.ge/contact', snippet: 'tel 555123456' },
      ],
    };
    expect(withoutPublicContacts(result)).toEqual({
      results: [
        { title: 'Firm', url: 'https://firm.example.ge/contact', snippet: `tel ${CONTACT_HIDDEN}` },
      ],
    });
  });

  it('shows them only to a step marked as asked by the owner', () => {
    expect(askedForPublicContacts({ query: 'x', [PUBLIC_CONTACTS_PARAM]: true })).toBe(true);
    expect(askedForPublicContacts({ query: 'x' })).toBe(false);
    expect(askedForPublicContacts({ query: 'x', [PUBLIC_CONTACTS_PARAM]: 'yes' })).toBe(false);
  });
});

describe('the reply carries no public link or email', () => {
  it('takes out links and emails, and a line left with nothing else', () => {
    const reply = [
      'Nino Beridze works at Build LLC — ask her first.',
      'Site: https://build.example.ge',
      'See [their page](https://build.example.ge/about) or write hello@build.example.ge.',
    ].join('\n');
    expect(withoutLinks(reply)).toBe(
      ['Nino Beridze works at Build LLC — ask her first.', 'See their page or write .'].join('\n'),
    );
  });

  it('keeps Netai’s own and payment links', () => {
    const reply =
      'Invite: https://www.netai.guru/i/abc\nPay: https://checkout.stripe.com/c/pay/xyz';
    expect(withoutLinks(reply)).toBe(reply);
  });

  it('leaves a reply with no link as it is', () => {
    expect(withoutLinks('Ask Levan Japaridze.')).toBe('Ask Levan Japaridze.');
  });
});

describe('every web door goes through it', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('the model’s web search and page read, and the reply', () => {
    expect(chat).toMatch(/const found = webAsShown\(\s*runId,\s*input,/u);
    expect(chat).toMatch(/return webAsShown\(\s*runId,\s*input,\s*await fetchPage\(/u);
    expect(chat).toContain('finalText = withoutLinks(finalText);');
    expect(chat.match(/\[PUBLIC_CONTACTS_PARAM\]: \{/gu)?.length).toBe(2);
  });

  it('the full research and the opening search', () => {
    const web = readFileSync(join(__dirname, '..', 'researchWeb.ts'), 'utf8');
    expect(web).toContain('withoutPublicContacts(await webSearch(q))');
    expect(web).toContain('withoutPublicContacts(await fetchPage(url))');
    const opening = readFileSync(join(__dirname, '..', 'openingSearch.service.ts'), 'utf8');
    expect(opening).toContain('withoutPublicContacts(r)');
  });
});
