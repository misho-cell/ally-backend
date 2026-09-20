import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Row 208, the seat's 319 — one limit, two descriptions, same message.
 *
 * Thread 19141, 00:26:54, four hundred characters apart:
 *
 *   „…they've already gotten two other questions IN THE LAST 24 HOURS, so this
 *    one is queued for when THAT WINDOW CLEARS."
 *
 *   „Running now: waiting to retry Netai Test 2 once THEIR DAILY LIMIT RESETS.
 *    I'll check back in a day."
 *
 * The first is a rolling window. The second is a calendar day with a moment
 * that does not exist. A reader takes the second one and waits for midnight.
 *
 * THE MODEL WAS NOT INVENTING IT. The instruction said both: two sentences
 * after forbidding the word „today" it called the thing a DAILY limit, which
 * is exactly where „resets" comes from. A daily limit has an instant it resets
 * at; a rolling window has no instant at all, it clears question by question
 * as each falls out of the far end.
 *
 * Read as text, deliberately: this string is consumed by a model and there is
 * no return value to assert on. The failure mode was a word, so the test reads
 * words.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const REFUSAL = SOURCE.slice(
  SOURCE.indexOf("reason: 'recipient_daily_limit_reached'"),
  SOURCE.indexOf('// The plan in force decides'),
);

describe('how the receiving cap is described to the model', () => {
  it('still says the true thing: a rolling 24 hours, not a calendar day', () => {
    expect(REFUSAL).toContain('ბოლო 24 საათში');
    expect(REFUSAL).toContain('მოძრავ 24 საათზეა, არა კალენდარულ დღეზე');
  });

  it('no longer calls it a daily limit two sentences later', () => {
    // „დღიური" is where „resets" came from. The word that contradicted the
    // sentence above it is the whole of the fix.
    expect(REFUSAL).not.toContain('დღიური');
  });

  it('forbids the reset vocabulary by name, not by hoping', () => {
    // „today" was already forbidden and the model obeyed that one. The way it
    // still produced a calendar answer was through a different word, so the
    // different word is named too.
    expect(REFUSAL).toContain('განულდება');
    expect(REFUSAL).toContain('ხვალ');
    expect(REFUSAL).toContain('არ დაწერო');
  });

  it('says what a rolling window actually does, so there is something to say instead', () => {
    // Row 215 again: a refusal that only forbids leaves the model with nothing
    // to write. It clears gradually — that is the sentence it needs.
    expect(REFUSAL).toContain('თანდათან იხსნება');
  });

  it('keeps the part that was always right: whose limit it is', () => {
    // Goal 3533: the owner read „the daily limit ran out" with 1,433 credits
    // on her own header. Whose limit it is is the thing this refusal exists
    // for and it must survive the rewording.
    expect(REFUSAL).toContain('ერთ ადამიანზეა');
    expect(REFUSAL).toContain('ვისი ზღვარია და რატომ');
  });
});
