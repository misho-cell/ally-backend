import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seat's 339, and it is bigger than the guard they were testing.
 *
 * They signed in as the mediator, answered a waiting request with one word,
 * and the channel item 5 built never appeared: no three buttons, no
 * `needs_channel`, the request answered and closed. Their diagnosis was
 * upstream of everything I shipped this morning:
 *
 *   thread 19505   type: "incoming_ask"   introduction_request_id: null
 *
 * It was never an introduction. Four threads on four accounts over two days,
 * every one worded as plainly as a person can word it — „Would you introduce
 * me to Netai Test 4?" — and every one filed as an ordinary question.
 *
 * WHAT THE BASE SAYS, and this is the part that makes it a regression rather
 * than a design. `introduction_requests`, by week, for the whole life of the
 * table:
 *
 *   15 Jun  6     22 Jun  2     29 Jun  7     06 Jul  4
 *   13 Jul  4     20 Jul  4     10 Aug  1     17 Aug  4
 *   24 Aug  7     31 Aug  3     07 Sep  0     14 Sep  1
 *
 * Three to seven a week for three months, then nothing. And in the five days
 * `tool_call_log` covers: ask_contact 119, request_introduction 1,
 * respond_to_introduction ZERO.
 *
 * THE TOOL WAS NEVER UNAVAILABLE — it is in ALWAYS_ON_TOOLS and has been all
 * along. The model simply stopped choosing it, and the descriptions say why.
 * `ask_contact` grew through the plan work of early September into 1,700
 * characters of consent machinery that reads as THE way to reach a person;
 * `request_introduction` stayed at 450 and never said, in the user's own
 * words, what it is for. Neither said anything about the other.
 *
 * Read as text: these strings are consumed by a model and there is no return
 * value to assert on. Joined back up first, because prettier decides where
 * they wrap and a phrase that fits one line today straddles `' +` tomorrow.
 *
 * WHETHER THIS ACTUALLY WORKED IS NOT ESTABLISHED, and the commit that shipped
 * it claimed more than the evidence carries. One introduction was created
 * after it — request 1123, 20 September 13:01, the first in fourteen days —
 * and it differs from all four failures in TWO ways at once:
 *
 *   18746/18747  19 Sep   171870 -> Netai Test 3   not a contact   incoming_ask
 *   19505        20 Sep   171871 -> Netai Test 4   not a contact   incoming_ask
 *   1123         20 Sep   171870 -> Netai Test 4   A CONTACT       introduction_request
 *
 * Every failure had a target the requester did not already hold; the one
 * success had one. So „the descriptions did it" and „the model always routed
 * this correctly for a known contact" fit the data equally well, and the
 * seat's hypothesis was the better-tested of the two.
 *
 * THE EXPERIMENT THAT SEPARATES THEM is one sentence: from 171870, ask for an
 * introduction to Netai Test 3 — not in their phonebook — through any
 * mediator. That is the exact shape that failed twice on the 19th. Until it
 * runs, these assertions hold that the words are PRESENT, and nothing more.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const joined = (from: string, to: string): string => {
  const start = SOURCE.indexOf(from);
  // `to` must be found AFTER the start — `input_schema` occurs sixty times in
  // this file and the first one is nowhere near either tool.
  return SOURCE.slice(start, SOURCE.indexOf(to, start)).replace(/'\s*\+\s*'/g, '');
};

const REQUEST_INTRO = joined("name: 'request_introduction'", 'input_schema');
const ASK_CONTACT = joined("name: 'ask_contact'", 'input_schema');

describe('an introduction is not a question, and both tools say so', () => {
  it('request_introduction says what it is FOR, in the words a user uses', () => {
    expect(REQUEST_INTRO).toContain('I WANT TO MEET X');
    expect(REQUEST_INTRO).toContain('ASK Y TO INTRODUCE ME TO X');
  });

  it('ask_contact says what it is NOT, and what happens if it is used anyway', () => {
    expect(ASK_CONTACT).toContain('NOT FOR AN INTRODUCTION');
    // The cost, named: this is what the seat actually observed.
    expect(ASK_CONTACT).toContain('no introduction is created');
    expect(ASK_CONTACT).toContain('nobody is ever connected');
  });

  it('each points at the other by name, so neither can be read alone', () => {
    expect(REQUEST_INTRO).toContain('ask_contact is the wrong one');
    expect(ASK_CONTACT).toContain('that is request_introduction, not this');
  });

  /**
   * The discriminator has to be usable on a sentence, because both kinds of
   * request begin with „ask". „Ask Gio whether he knows a plumber" and „Ask
   * Gio to introduce me to Nino" differ only in what the user wants at the
   * end, so that is what both descriptions are taught to look at.
   */
  it('gives a discriminator rather than a list of phrasings', () => {
    for (const text of [REQUEST_INTRO, ASK_CONTACT]) {
      expect(text).toContain('what the user wants at the end');
    }
    expect(REQUEST_INTRO).toContain('both sentences begin with "ask"');
  });

  /** Nothing that was already there may be lost — this is an addition. */
  it('keeps what each tool already said', () => {
    expect(REQUEST_INTRO).toContain('only after the user explicitly confirms');
    expect(REQUEST_INTRO).toContain('DIRECT case');
    expect(ASK_CONTACT).toContain('the approved plan IS the consent');
    expect(ASK_CONTACT).toContain('Never promise to pass something on before you have actually');
  });
});

/**
 * And the counter, because a description is not a wall and nothing in this
 * product could have told me introductions had stopped. Two weeks, zero,
 * unnoticed — that is the real failure, and it is the one a second sentence
 * does not fix.
 *
 * It COUNTS and does not reroute. Deciding from a text pattern that somebody
 * meant an introduction is the kind of inference that goes wrong quietly, and
 * by the time this runs the message has already gone.
 */
const COUNTER = joined('const INTRODUCTION_SHAPED', 'case ');

describe('the counter that will say whether the sentences worked', () => {
  it('recognises the four wordings the seat actually saw, in four languages', () => {
    const pattern = /\/(.*)\/i;/.exec(COUNTER);
    expect(pattern).not.toBeNull();
    const re = new RegExp(pattern![1], 'i');
    for (const said of [
      'Would you introduce me to Netai Test 4?',
      'Could you introduce me to Netai Test 3, we both work in logistics',
      'შეგიძლია გამაცნო ნინო?',
      'გააცნობ ჩემს მეგობარს?',
      'можешь познакомить меня с Ниной?',
      '¿Puedes presentarme a Nino?',
    ]) {
      expect(re.test(said)).toBe(true);
    }
  });

  it('leaves an ordinary question alone, which is the cost of getting it wrong', () => {
    const pattern = /\/(.*)\/i;/.exec(COUNTER);
    const re = new RegExp(pattern![1], 'i');
    for (const said of [
      'Do you know a good plumber in Tbilisi?',
      'იცნობ სანდო ბუღალტერს?',
      'Кто у тебя есть из электриков?',
      'Can you recommend a photographer for a wedding?',
    ]) {
      expect(re.test(said)).toBe(false);
    }
  });

  it('never blocks and never reroutes — it writes one line and returns', () => {
    expect(COUNTER).toContain('console.log');
    expect(COUNTER).toContain('[intro-as-ask]');
    // No return value, so nothing downstream can branch on it by accident.
    expect(COUNTER).toContain('): void {');
  });

  it('carries the wording, because the next decision needs to read it', () => {
    expect(COUNTER).toContain('question.slice(0, 160)');
  });
});
