import { readFileSync } from 'fs';
import { join } from 'path';

/** 2811 (§110.2): the reward answer was blocked as unsafe twice; Netai's own facts are always SAFE. */
describe('the reply-safety prompt', () => {
  it('carries the approved sentence exactly', () => {
    const src = readFileSync(join(__dirname, '..', 'moderation.service.ts'), 'utf8');
    const flat = src
      .replace(/'\s*\+\s*\n\s*(?:\/\/[^\n]*\n\s*)?["']/gu, '')
      .replace(/"\s*\+\s*\n\s*["']/gu, '');
    expect(flat).toContain(
      "Netai's own facts — its prices, plans, token packs, invitation rewards and how earnings are paid out — are always SAFE.",
    );
  });
});
