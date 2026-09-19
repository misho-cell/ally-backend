import { itemsSurfacedGoalQuestion, ANSWERED_BEFORE_ASKED } from '../chat.service';
import { GOAL_QUESTION_KIND } from '../goalQuestions.service';

/**
 * Ticket 20 — a message cannot be the answer to a question it predates.
 *
 * 19 September, 12:03. The owner typed „tell Tornike Abuladze I can do
 * Thursday" into a brand-new conversation. That run pulled a waiting question
 * belonging to an unrelated goal and then, IN THE SAME RUN, called
 * `answer_goal_question` with „Lika actually says she can do Thursday
 * (24 September)". A person nobody typed, a date nobody proposed.
 *
 * The goal woke, rewrote its brief, armed a chase for the next day, and sent a
 * real question to a real person asking to move a real meeting. No plan, no
 * card, no yes from anybody.
 *
 * The model was not disobeying. It is handed „get a real answer, then call
 * answer_goal_question with what they said", and nothing anywhere required
 * that they had said anything. It followed its instructions into a situation
 * they did not anticipate — which is why this is an inequality and not a
 * rewritten paragraph.
 *
 * The fact that settles it needs no judgement: the owner's message is what
 * STARTED the run, so it was typed before the run surfaced the question. There
 * was nothing yet to answer.
 */
function item(kind: string, taskId: number | null) {
  return { kind, task_id: taskId, payload: {} };
}

describe('a question surfaced by this very run cannot be answered by it', () => {
  it('refuses the incident: the goal question came up in the same run', () => {
    const surfaced = [item(GOAL_QUESTION_KIND, 5314)];
    expect(itemsSurfacedGoalQuestion(surfaced, 5314)).toBe(true);
  });

  it('allows the ORDINARY case — the card came up in an earlier run', () => {
    // This is the whole safety of the change: the owner sees the card in one
    // turn and replies in the next, which is a different run, and that run
    // surfaced nothing.
    expect(itemsSurfacedGoalQuestion([], 5314)).toBe(false);
  });

  it('is scoped to the goal, not to the fact that anything was surfaced', () => {
    // A run may surface a question about goal A while the owner is genuinely
    // answering goal B's question from earlier. Refusing both would break a
    // real answer to protect against an unrelated one.
    const surfaced = [item(GOAL_QUESTION_KIND, 6042)];
    expect(itemsSurfacedGoalQuestion(surfaced, 5314)).toBe(false);
  });

  it('ignores other kinds of pending item', () => {
    // A due result or an intro request in the same run says nothing about
    // whether a goal question was asked.
    const surfaced = [item('result', 5314), item('more_pending', null)];
    expect(itemsSurfacedGoalQuestion(surfaced, 5314)).toBe(false);
  });

  it('refuses a task_id that is not a number rather than matching on it', () => {
    const surfaced = [item(GOAL_QUESTION_KIND, 5314)];
    expect(itemsSurfacedGoalQuestion(surfaced, Number.NaN)).toBe(false);
  });
});

describe('what the model is told when it is refused', () => {
  it('says the owner has not seen the question yet', () => {
    expect(ANSWERED_BEFORE_ASKED).toMatch(/has not seen it yet/i);
  });

  it('names what to do instead, so the refusal is not just a wall', () => {
    // Row 215's lesson, applied to a tool result: a refusal that does not name
    // the way forward gets retried with the same argument.
    expect(ANSWERED_BEFORE_ASKED).toMatch(/ask them the question/i);
    expect(ANSWERED_BEFORE_ASKED).toMatch(/later message/i);
  });

  it('tells it what the owner’s message actually was — a new request', () => {
    // The failure was treating an unrelated sentence as an answer. Saying only
    // „no" leaves the sentence unanswered as well as misread.
    expect(ANSWERED_BEFORE_ASKED).toMatch(/new request/i);
  });
});
