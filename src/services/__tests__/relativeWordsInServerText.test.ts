import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 208, and the rule is the seat's: THE SERVER MUST NEVER WRITE A RELATIVE
 * TIME WORD INTO TEXT THAT PERSISTS IN A THREAD.
 *
 * A cap refusal said „X has ALREADY RECEIVED … today". True at 14:15:15. By
 * 14:46, in the same thread, the assistant narrated it back to the owner as
 * „…could not receive another question YESTERDAY", and built its next sentence
 * out of the contrast — a story about two days that all happened inside half an
 * hour.
 *
 * The model was not careless. The conversation it re-reads carries no times at
 * all, so „today" in an older message is a word with no anchor. A DATE is true
 * at any distance, forever.
 *
 * This test reads the source rather than calling a function, because the rule
 * is about a HABIT and the next instance will be a new string somebody adds.
 * A grep with a reason attached outlives the three strings it was written for.
 */
const REFUSALS = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');

/** Only the code — a comment may discuss „today" as much as it likes. */
function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  });
}

describe('the refusals a run reads back hours later', () => {
  it('carry a date and not the word „today"', () => {
    const offenders = codeLines(REFUSALS).filter((line) => /'[^']*დღეს[ —-]/u.test(line));

    expect(offenders).toEqual([]);
  });

  it('still say the thing they were written to say', () => {
    // The point was never to remove the sentence, only to date it.
    expect(REFUSALS).toContain('დღიური ზღვარია ერთ ადამიანზე');
    expect(REFUSALS).toContain('ზღვარს მიაღწია');
  });

  it('tell the model to copy the date rather than re-relativise it', () => {
    // A model handed „2026-09-18" will happily write „today" back. The
    // instruction is what stops the fix being undone one layer up.
    //
    // The source is read with its string concatenation and line wrapping
    // flattened, because the sentence is split across lines in one of the
    // three and a test that cannot see that is a test about formatting.
    const flat = REFUSALS.replace(/'\s*\+\s*\n\s*'/g, '').replace(/\s+/g, ' ');
    const timesTold = flat.split('„დღეს" ხვალ აღარ იქნება სიმართლე').length - 1;

    expect(timesTold).toBe(3);
  });
});
