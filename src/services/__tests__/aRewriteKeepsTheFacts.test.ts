import { readFileSync } from 'fs';
import { join } from 'path';
import { rewriteDropsFacts } from '../rewriteKeepsFacts';
import {
  clearQuietAfterDecline,
  noteQuietAfterDecline,
  takeQuietAfterDecline,
} from '../quietSystemRun';

/** #8947 (battery 5 Nov): the rewrite pass removed facts; the reply was dropped after a late yes. */
describe('#8947: a rewrite may change words, never facts', () => {
  const claude =
    'TBC-ის იპოთეკის განყოფილება: ფასი 1 200 ლარიდან. ბმული: https://tbcbank.ge/mortgage. ' +
    'ცხელი ხაზი: 032 227 27 27. ვებზე ასევე წერენ, რომ განხილვა 10 დღეა.';

  it('keeps a rewrite that only rewords', () => {
    const rewritten =
      'TBC-ში იპოთეკაზე ფასი 1200 ლარიდან იწყება — https://tbcbank.ge/mortgage. ' +
      'ცხელი ხაზი 032 227 27 27; განხილვა, ვებზე წერენ, 10 დღეა.';
    expect(rewriteDropsFacts(claude, rewritten)).toBe(false);
  });

  it('refuses a rewrite that left the link empty', () => {
    expect(rewriteDropsFacts(claude, claude.replace('https://tbcbank.ge/mortgage', ''))).toBe(true);
  });

  it('refuses a rewrite that cut a price or a phone', () => {
    expect(rewriteDropsFacts(claude, claude.replace('1 200 ლარიდან', 'ხელმისაწვდომი ფასით'))).toBe(
      true,
    );
    expect(rewriteDropsFacts(claude, claude.replace('032 227 27 27', 'ბანკში'))).toBe(true);
  });

  it('refuses a rewrite that dropped most of the text', () => {
    expect(rewriteDropsFacts(claude, 'TBC-ს მიმართე.')).toBe(true);
  });

  it('is wired after the writer, keeping Claude’s own final', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'if (finalIsRewrite && !claudeFinalSkipped && rewriteDropsFacts(claudeWords, finalText)) {',
    );
  });
});

describe('#8947: a late yes after a no is said, not kept quiet', () => {
  it('an answer that is more than a no takes the quiet mark away', () => {
    noteQuietAfterDecline(77);
    clearQuietAfterDecline(77);
    expect(takeQuietAfterDecline(77)).toBe(false);
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    expect(engine).toContain('} else if (threadId !== null) {');
  });
});
