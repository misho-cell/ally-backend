import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ ITEM E — THE FOUNDER ASKED WHAT WAS WAITING AND WAS ASKED THE SAME
 * QUESTION TWICE, ONE SECOND APART. Thread 24487, 25 September.
 *
 *   10:36:22  him: „რა მელოდება? ვინმე რამეს მეკითხება?"
 *   10:36:44  the model: „…Tiko and Likuna haven't answered. Want me to add
 *             Nodar Baghishvili, or keep waiting? (I am waiting for the
 *             answer to the question above.)"
 *   10:36:45  the server's card: „The goal «I need a reliable web designer…»
 *             is waiting for your answer: Tiko and Likuna still haven't
 *             answered. Want me to add Nodar Baghishvili, or keep waiting?"
 *             …with „Answer now" and „Later" beneath it.
 *
 * BOTH WERE DOING AS THEY WERE TOLD, which is why neither looked broken. The
 * card exists because a question the model merely narrated used to vanish into
 * a `step` row the thread view filters out, leaving buttons with no question
 * above them. The instruction beside it then asked the model to narrate it too.
 *
 * Three of the tester's four E items are this one fault:
 *   - the question shown twice          -> the model restating the card
 *   - the stray „(I am waiting …)"       -> a stage direction that only makes
 *     sense because it had just asked; take the asking away and it has
 *     nothing to explain
 *   - the card mixing Georgian and English -> the question was FILED in the
 *     goal's language and read in a conversation held in another
 */
const goalQuestions = readFileSync(join(__dirname, '..', 'goalQuestions.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

describe('the card asks and the reply introduces', () => {
  it('no longer tells the model to ask the question', () => {
    expect(goalQuestions).not.toContain('Ask them the question verbatim');
  });

  it('says the card is already going to them, with its buttons', () => {
    expect(goalQuestions).toContain('ALREADY GOING TO THEM as its own card');
    expect(goalQuestions).toContain('DO NOT ASK IT AGAIN');
  });

  /** „They would read the same question twice" is the reason, kept with the rule. */
  it('says why, not just what', () => {
    expect(goalQuestions).toContain('the same question twice');
  });

  /**
   * The stray line has no separate rule — it is forbidden by the same
   * sentence, because it existed only to explain the asking.
   */
  it('forbids the stage direction that came with it', () => {
    expect(goalQuestions).toContain('Do not write that you are waiting for their answer');
  });

  /** What must NOT be lost: the goal still has to be mentioned at all. */
  it('still requires one line saying the goal is waiting', () => {
    expect(goalQuestions).toContain('ONE line that this goal is waiting on them');
  });

  /**
   * ⚠️ Asserted in fragments. The first version looked for the whole sentence
   * and failed: this is a CONCATENATED string, so „If they defer, " ends one
   * source line and „accept it and move on." begins the next, and the joined
   * sentence exists only at runtime. The test was reading the source and
   * judging it as though it were the value.
   */
  it('still un-blocks the goal the same way', () => {
    expect(goalQuestions).toContain('answer_goal_question');
    expect(goalQuestions).toContain('If they defer, ');
    expect(goalQuestions).toContain('accept it and move on.');
  });
});

describe('the question is filed in the language it will be read in', () => {
  const tool = chat.slice(chat.indexOf('const ASK_OWNER_DECISION_TOOL'));

  it('asks for the reader’s language, not the goal’s', () => {
    expect(tool.slice(0, 2500)).toContain('IN THE LANGUAGE ');
    expect(tool.slice(0, 2500)).toContain('THEY WRITE TO YOU IN');
  });

  /**
   * Nothing translates it afterwards — `renderPendingMessage` is synchronous
   * and builds the card from the stored text. Saying so stops the next reader
   * assuming a translation step exists somewhere.
   */
  it('says plainly that nothing translates it later', () => {
    expect(tool.slice(0, 2500)).toContain('nothing translates it later');
  });

  /**
   * The goal TITLE is the owner's own words and stays as written — translating
   * somebody's own sentence back at them is a different bug.
   */
  it('leaves the owner’s own title alone', () => {
    expect(tool.slice(0, 2500)).toContain('The goal TITLE stays as the owner wrote it');
  });
});
