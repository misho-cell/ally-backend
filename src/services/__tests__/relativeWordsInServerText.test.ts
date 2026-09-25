import { readFileSync } from 'fs';
import { join } from 'path';

import { messageHeldNoTokens } from '../runLanguage';

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
    //
    // „დღიური" left it, and not for tidiness: row 208 / the seat's 319 caught
    // one message describing this limit both ways four hundred characters
    // apart — „in the last 24 hours" and „once their daily limit resets" —
    // and this instruction is where both came from. A daily limit has an
    // instant it resets at; a rolling window has none. The substance the
    // sentence carries is „per person", and that is what is asserted now.
    expect(REFUSALS).toContain('ერთ ადამიანზეა');
    expect(REFUSALS).toContain('ზღვარს მიაღწია');
  });

  it('name the WINDOW, not a day — because the caps are rolling 24 hours', () => {
    /**
     * The seat corrected their own rule eighty minutes after I shipped it.
     * They could not trigger a fresh refusal because the ask went through, so
     * they counted the asks instead:
     *
     *   17 Sep 14:23:29  ask 2049 to 13927
     *   17 Sep 14:23:50  ask 2052 to 13927
     *   18 Sep 14:15:15  REFUSED — „already received two new questions TODAY"
     *   18 Sep 15:39:16  ask 2377, SENT
     *
     * She had received nothing today. „Today" was not stale, it was false when
     * written — and a DATE would be false too: „18 September" is untrue and
     * „17 September" is true and useless. The SQL says NOW() - INTERVAL '24
     * hours' in all three caps, so the window is what the sentence must name.
     */
    const flat = REFUSALS.replace(/'\s*\+\s*\n\s*'/g, '').replace(/\s+/g, ' ');

    expect(flat.split('ბოლო 24 საათში').length - 1).toBeGreaterThanOrEqual(6);
    // And each one tells the model to write the same anchor rather than
    // re-render it as „today", which is how the fix gets undone one layer up.
    expect(flat.split('„დღეს" არ დაწერო').length - 1).toBe(3);
  });

  it('claims no calendar day anywhere, since no cap is one', () => {
    const flat = REFUSALS.replace(/'\s*\+\s*\n\s*'/g, '').replace(/\s+/g, ' ');

    expect(flat).not.toMatch(/\$\{today\(\)\}/);
  });
});

/**
 * ⚠️ ROW 270 — „KEPT" WAS HEARD AS „QUEUED", AND THE FIX MUST NOT REPLACE IT
 * WITH A PROMISE.
 *
 * The tester, Test 7 thread 24852: „„I have kept what you wrote" and „send it
 * again" contradict." Both sentences were true — „kept" meant the words were
 * still on the screen — and a person reads „kept" as „it is in hand, it will
 * run". So the line now says which it means, and says out loud the part that
 * was only ever implied.
 *
 * Row 270(a) asks for the opposite direction: tell them about Monday's refill.
 * That sentence is DELIBERATELY ABSENT. `waiting_topup` is derived at read
 * time from the balance; it is not a stored state and nothing wakes the goal
 * when the balance rises. Until the 28 September test says otherwise, writing
 * it would repeat row 221's fault — a line promising what the code under it
 * does not do.
 */
describe('the out-of-tokens message promises nothing it cannot do', () => {
  const langs = ['ka', 'en', 'ru', 'es'] as const;

  it('says nothing is queued, in every language', () => {
    const said = langs.map((l) => messageHeldNoTokens(l));

    expect(said[0]).toContain('რიგში არაფერია');
    expect(said[1]).toContain('Nothing is queued');
    expect(said[2]).toContain('очереди');
    expect(said[3]).toContain('en cola');
  });

  it('never claims it will carry on by itself', () => {
    for (const lang of langs) {
      const text = messageHeldNoTokens(lang);

      expect(text).not.toMatch(/გავაგრძელებ|I will carry on|я продолжу|sigo solo/i);
    }
  });

  /** The refill promise stays out until the 28 September test earns it. */
  it('does not mention the weekly refill or a day of the week', () => {
    for (const lang of langs) {
      const text = messageHeldNoTokens(lang);

      expect(text).not.toMatch(/ორშაბათ|Monday|понедельник|lunes|კვირეულ|weekly/i);
    }
  });
});
