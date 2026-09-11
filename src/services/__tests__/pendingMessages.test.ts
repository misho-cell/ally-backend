import { renderPendingMessage } from '../pendingMessages';

// Ticket 16 Task 98: the buttons are written here, from the item, never by the
// model — that is the half that stops „კი" from meaning something a person
// cannot see.

describe('renderPendingMessage', () => {
  it('an unanswered relayed question names the person and offers the two real choices', () => {
    const out = renderPendingMessage(
      {
        kind: 'debrief',
        task_id: 2412,
        payload: {
          who: 'Lika Ose',
          about: 'relayed_ask',
          ask_id: 1387,
          instruction: 'ask how to proceed',
        },
      },
      'ka',
    );

    expect(out?.text).toBe('Lika Ose-სთვის გაგზავნილ კითხვას სამი დღეა პასუხი არ მოჰყოლია.');
    expect(out?.choices).toEqual(['დაველოდოთ კიდევ', 'სხვას ვკითხოთ']);
    expect(out?.ref).toEqual({ kind: 'debrief', ask_id: 1387 });
    expect(out?.instruction).toBe('ask how to proceed');
  });

  it('an accepted introduction asks whether it worked, with a third honest option', () => {
    const out = renderPendingMessage(
      {
        kind: 'debrief',
        task_id: null,
        payload: {
          who: 'Sulkhan Akhvlediani',
          about: 'introduction',
          instruction: 'ask how it went',
        },
      },
      'ka',
    );

    expect(out?.text).toContain('Sulkhan Akhvlediani');
    expect(out?.choices).toEqual(['გამოდგა', 'ვერ გამოდგა', 'ჯერ არ მომხდარა']);
  });

  it('a blocked goal quotes its own question when the engine recorded one', () => {
    const withQuestion = renderPendingMessage(
      {
        kind: 'goal_question',
        task_id: 1981,
        payload: {
          goal_title: 'შეხვედრა',
          question: 'შეხვედრა შედგა?',
          instruction: 'ask verbatim',
        },
      },
      'ka',
    );
    expect(withQuestion?.text).toBe('მიზანი „შეხვედრა" შენს პასუხს ელოდება: შეხვედრა შედგა?');
    expect(withQuestion?.ref).toEqual({ kind: 'goal_question', task_id: 1981 });

    // And never invents one when it did not.
    const bare = renderPendingMessage(
      {
        kind: 'goal_question',
        task_id: 2641,
        payload: { goal_title: 'დიჯეი', instruction: 'point at it' },
      },
      'ka',
    );
    expect(bare?.text).toBe('მიზანი „დიჯეი" შენს პასუხს ელოდება.');
  });

  it('an invite ask points at its own thread', () => {
    const out = renderPendingMessage(
      {
        kind: 'chorus_ask',
        task_id: null,
        payload: { who: 'Soso Shlausa', thread_id: 13399, instruction: 'i' },
      },
      'ka',
    );
    expect(out?.choices).toEqual(['ვნახავ ახლა', 'მოგვიანებით']);
    expect(out?.ref).toEqual({ kind: 'chorus_ask', thread_id: 13399 });
  });

  it('matches the language of the answer above it', () => {
    const out = renderPendingMessage(
      {
        kind: 'debrief',
        task_id: null,
        payload: { who: 'Lika Ose', about: 'relayed_ask', instruction: 'x' },
      },
      'en',
    );
    expect(out?.text).toBe('The question sent to Lika Ose has had no answer for three days.');
    expect(out?.choices).toEqual(['Keep waiting', 'Ask somebody else']);
  });

  it('skips rather than guesses when the payload cannot say anything true', () => {
    expect(renderPendingMessage({ kind: 'debrief', task_id: null, payload: {} }, 'ka')).toBeNull();
    expect(
      renderPendingMessage({ kind: 'chorus_ask', task_id: null, payload: {} }, 'ka'),
    ).toBeNull();
    expect(
      renderPendingMessage({ kind: 'goal_question', task_id: 1, payload: {} }, 'ka'),
    ).toBeNull();
    // A kind this file does not know stays with the model, exactly as before.
    expect(
      renderPendingMessage({ kind: 'thanks_loop', task_id: null, payload: { who: 'X' } }, 'ka'),
    ).toBeNull();
  });
});
