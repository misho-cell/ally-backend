/**
 * Ticket 19 G10 point 2, the founder's D254 of 15 September.
 *
 * Ninia asks Tornike; Tornike says „ask Erekle, I will put you in touch";
 * Erekle answers. D254: on a yes the asker is told on her goal AND helped to
 * write the first message herself, on a no she gets a polite no, and the bridge
 * gets one thank-you and nothing more.
 *
 * A correction belongs in this file, because the code it tests is a correction
 * of mine. relay_ask's description was changed today to say „the named person's
 * answer comes back to the user, not to the original asker". That is false. A
 * relayed ask inherits the parent's task_id (createAsk(…, row.task_id, …)), so
 * the answer wakes the ASKER'S goal through the ordinary capture path — as ask
 * 467 shows: child task 829, parent task 829, asker 501. I read two comments
 * that agreed with each other and called it verified.
 */
import { buildAnswerWakeEvent, buildRelayAnswerWakeEvent } from '../taskAsks.service';

const ANSWER = 'კი, სიამოვნებით შევხვდები.';

describe('D254 — the wake event when the answer came through a bridge', () => {
  it('names the person who answered AND the person who bridged', () => {
    const event = buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე');
    expect(event).toContain('ერეკლემ');
    // Genitive, not the bare name: თორნიკე → თორნიკის.
    expect(event).toContain('თორნიკის მეშვეობით');
  });

  it('carries the answer verbatim inside the tags, like the direct one', () => {
    expect(buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე')).toContain(
      `<answer>\n${ANSWER}\n</answer>`,
    );
  });

  it('asks the owner to write the first message themselves on a yes', () => {
    const event = buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე');
    expect(event).toMatch(/პირველი შეტყობინება თავად დაწეროს/);
    expect(event).toMatch(/დაეხმარე/);
  });

  it('says a no is said warmly and not returned to', () => {
    expect(buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე')).toMatch(/ნუ დაუბრუნდები/);
  });

  it('still reads as a sentence when the bridge has no name on file', () => {
    const event = buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', null);
    expect(event).toContain('შენი კონტაქტის მეშვეობით');
    expect(event).not.toContain('null');
    expect(event).not.toContain('undefined');
  });

  it('still reads as a sentence when neither has a name', () => {
    const event = buildRelayAnswerWakeEvent(ANSWER, null, null);
    expect(event).toContain('ადამიანმა, ვისაც კითხვა გადაეგზავნა');
    expect(event).not.toContain('undefined');
  });

  it('is not the direct event: a three-person answer is not a two-person one', () => {
    expect(buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე')).not.toBe(
      buildAnswerWakeEvent(ANSWER, 'ერეკლე'),
    );
  });

  it('never tells the owner where the question travelled beyond the two names', () => {
    const event = buildRelayAnswerWakeEvent(ANSWER, 'ერეკლე', 'თორნიკე');
    expect(event).not.toMatch(/ask_id|task_id|parent_ask_id|thread/);
  });
});
