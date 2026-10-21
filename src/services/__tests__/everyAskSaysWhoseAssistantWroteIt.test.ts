import { readFileSync } from 'fs';
import { join } from 'path';
import { ASK_BODY_MAX_CHARS, buildAskOpening } from '../askOpening';

/**
 * #6634 / #6902 (D590 point 0, Misho's yes 21 Oct): no „<O>-ის ასისტენტი,
 * <O>-ის სახელით" line closes an ask. The reader's own assistant says, in the
 * first person, whose assistant wrote — once, at the top.
 */
describe('an ask says once, at the top, whose assistant wrote it', () => {
  it('closes with no signature line; a long body is still logged', () => {
    const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
    expect(asks).not.toContain('disclosureLine');
    const at = asks.indexOf('1687 (A4): the body is measured');
    expect(asks.slice(at, at + 1200)).toContain('if (body.length > ASK_BODY_MAX_CHARS)');
    expect(ASK_BODY_MAX_CHARS).toBe(400);
  });

  it('opens a first question in the first person: „დამიკავშირდა <O>-ის ასისტენტი"', () => {
    expect(buildAskOpening('ka', 'მიშო', null, 'კარგ ხელოსანს ხომ არ იცნობ?', 'first')).toBe(
      'დამიკავშირდა მიშოს ასისტენტი:\n\nკარგ ხელოსანს ხომ არ იცნობ?',
    );
  });

  it('keeps a question that already names the assistant as it is', () => {
    const own = 'დამიკავშირდა მიშოს ასისტენტი, მიშოს აინტერესებს, იცნობ თუ არა კარგ ხელოსანს?';
    expect(buildAskOpening('ka', 'მიშო', null, own, 'first')).toBe(own);
  });

  it('keeps the frame when it carries a shared network, which is news', () => {
    expect(buildAskOpening('ka', 'მიშო', 'Axel', 'კითხვა?', 'first')).toContain('Axel');
  });

  it('says a second message as the reader’s assistant receiving it', () => {
    expect(buildAskOpening('ka', 'მიშო', null, 'კითხვა?', 'followUp')).toContain('კიდევ მომწერა');
    expect(buildAskOpening('ka', 'მიშო', null, 'კითხვა?', 'added')).toContain('დამატებით მომწერა');
  });
});
