import { readFileSync } from 'fs';
import { join } from 'path';

import {
  cliffhangerEcho,
  continuationRepeatsAnnouncement,
  describeCliffhangerOutcome,
  isCliffhangerReply,
} from '../replyGuards';

/**
 * ROW 273 — the guard that turns a short „let me check…" into a continuation
 * fires 153 times a week. What nobody knows is how many of those carried real
 * work forward and how many only said the same thing twice.
 *
 * ⚠️ AND THE OBVIOUS MEASUREMENT DOES NOT WORK. The nudge turn is written to
 * the database at the END of a run with every other pending turn, so its
 * timestamp sits after the last tool call by construction: „tool calls after
 * this moment" can only ever be zero. That query gave a confident 141 of 153
 * and was thrown away. The facts have to be taken while the run still holds
 * them.
 */
describe('what the nudge bought, recorded as facts rather than a verdict', () => {
  it('counts the tool calls made during the continuation', () => {
    expect(describeCliffhangerOutcome('one moment', 'I checked and here it is', 3)).toContain(
      'tools=3',
    );
    expect(describeCliffhangerOutcome('one moment', 'here it is', 0)).toContain('tools=0');
  });

  it('records both lengths, so a long continuation is not read as a repeat', () => {
    const line = describeCliffhangerOutcome('  let me check  ', '  a much longer answer  ', 1);

    expect(line).toContain('said=12');
    expect(line).toContain('then=20');
  });

  /**
   * The echo is the share of the continuation's own words that were already in
   * the announcement. It is not a verdict — a high echo on two short lines can
   * be perfectly innocent — which is why it is printed beside the other three
   * and never alone.
   */
  it('names the echo as a share of the continuation, not of the pair', () => {
    // Four words over two: every word already said.
    expect(
      describeCliffhangerOutcome('checking the plumber now', 'checking the plumber', 0),
    ).toContain('echo=100%');
    // Nothing in common.
    expect(describeCliffhangerOutcome('one moment', 'found a locksmith nearby', 0)).toContain(
      'echo=0%',
    );
  });

  /** No words is nothing to measure, and must not read as a zero. */
  it('says n/a rather than 0% when the continuation is empty', () => {
    expect(describeCliffhangerOutcome('checking', '', 0)).toContain('echo=n/a');
  });

  /**
   * ⚠️ A PERSON'S SENTENCE IN A LOG IS THE SAME MISTAKE AS THEIR PHONE NUMBER
   * IN ONE. Lengths and a ratio; never the text.
   */
  it('never carries any of what was said', () => {
    const secret = 'ნინო ხვედელიძე მეუბნება რომ ექიმი სჭირდება';
    const line = describeCliffhangerOutcome(secret, `${secret} და კიდევ ერთი`, 0);

    expect(line).not.toContain('ნინო');
    expect(line).not.toContain('ექიმი');
    expect(line).toMatch(/^tools=\d+ said=\d+ then=\d+ echo=/);
  });

  it('is called where the run still holds the two texts', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const block = chat.slice(
      chat.indexOf(
        '(claimedASendThatDidNotHappen || helperQuestionUnsent || isCliffhangerReply(finalText))',
      ),
      chat.indexOf('[chat] cliffhanger continuation failed'),
    );

    expect(block).toContain('const announcement = finalText;');
    expect(block).toContain('const toolCallsBeforeNudge = toolCallCount;');
    expect(block).toContain('describeCliffhangerOutcome(');
    // Taken as a difference, so tool calls from earlier in the run are not
    // counted as the nudge's doing.
    expect(block).toContain('toolCallCount - toolCallsBeforeNudge');
  });
});

/** Row 273, the week's measurement: no tool work and mostly the announcement again → replace. */
describe('a continuation that only repeats the announcement', () => {
  const said = 'ახლა ვამოწმებ ნინოს კონტაქტებს და მალე მოგწერ რას ვიპოვი.';

  it('replaces the announcement when it did no work and mostly says it again', () => {
    expect(
      continuationRepeatsAnnouncement(said, 'ვამოწმებ ნინოს კონტაქტებს, მალე მოგწერ.', 0),
    ).toBe(true);
  });

  it('follows the announcement when it did tool work', () => {
    expect(
      continuationRepeatsAnnouncement(said, 'ვამოწმებ ნინოს კონტაქტებს, მალე მოგწერ.', 2),
    ).toBe(false);
  });

  it('follows the announcement when it wrote something new', () => {
    expect(
      continuationRepeatsAnnouncement(
        said,
        'ორი ბუღალტერი ვიპოვე: გია და თამარი, ორივე ბათუმში.',
        0,
      ),
    ).toBe(false);
  });

  it('measures nothing on an empty continuation', () => {
    expect(cliffhangerEcho(said, '')).toBeNull();
    expect(continuationRepeatsAnnouncement(said, '', 0)).toBe(false);
  });
});

/** Seat-14 tester, 4 Oct (36433): „I cannot check the weather" read as „I am checking". */
describe('a refusal is not an announcement', () => {
  it('does not take a negated verb for a cliffhanger', () => {
    expect(
      isCliffhangerReply(
        'ცოცხალ ამინდს ახლა ვერ ვამოწმებ. გარეთ გასვლამდე ამინდის აპი გადაამოწმე.',
      ),
    ).toBe(false);
    expect(isCliffhangerReply("I can't check the live weather right now.")).toBe(false);
  });

  it('still catches the real announcement', () => {
    expect(isCliffhangerReply('ახლა ვამოწმებ ნინოს კონტაქტებს.')).toBe(true);
  });
});
