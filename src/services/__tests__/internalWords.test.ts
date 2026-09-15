/**
 * Ticket 19 G8 — internal words still reaching the user.
 *
 * The tester's three, caught live on 15 September:
 *
 *   15148  13:36:34  „პირდაპირ propose_task_plan-ზე გადავდივარ"
 *   15115  13:03:26  „list_answer_rules-ს ნახავ ნებისმიერ დროს"
 *   15380  18:00:59  „ნინიას უკვე ვუგზავნე (ask_id 1750)"
 *
 * A scrubber for this has existed since Ticket 11, and its comment said it was
 * „built from the live tool registry — a new tool is covered the day it
 * exists". Measured against all three: it removed NOTHING.
 *
 * It was built from ALL_TOOL_DEFINITIONS, which is the OPTIONAL registry — ten
 * tools out of about sixty, and not one of the ones that leak. The prompt rule
 * has been failing since August and the guard behind it was answering for a
 * tenth of the surface, silently, the whole time.
 */
import { scrubInternalToolNames } from '../chat.service';

const THREAD = 15148;

function quiet<T>(run: () => T): T {
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    return run();
  } finally {
    spy.mockRestore();
  }
}

describe('the three the tester caught', () => {
  it('removes a tool name that was never in the registry', () => {
    const out = quiet(() =>
      scrubInternalToolNames('პირდაპირ propose_task_plan-ზე გადავდივარ', THREAD),
    );

    expect(out).not.toContain('propose_task_plan');
    expect(out).toContain('შიდა ფუნქცია');
  });

  it('removes another one', () => {
    const out = quiet(() =>
      scrubInternalToolNames('list_answer_rules-ს ნახავ ნებისმიერ დროს', THREAD),
    );

    expect(out).not.toContain('list_answer_rules');
  });

  it('removes an internal id, which carries no tool name at all', () => {
    // This is why the id needs its own rule: „(ask_id 1750)" has nothing in it
    // for a tool-name test to catch, which is exactly how it reached a screen.
    const out = quiet(() => scrubInternalToolNames('ნინიას უკვე ვუგზავნე (ask_id 1750)', THREAD));

    expect(out).not.toContain('ask_id');
    expect(out).not.toContain('1750');
  });
});

describe('what it must not do', () => {
  it('leaves an ordinary reply alone', () => {
    const plain = 'ნინიას უკვე ვუგზავნე. პასუხი როგორც კი მოვა, შეგატყობინებ.';
    expect(scrubInternalToolNames(plain, THREAD)).toBe(plain);
  });

  it('does not eat a real number that is not an internal id', () => {
    const plain = 'შეხვედრა 15:00-ზე, 3 ადამიანი.';
    expect(scrubInternalToolNames(plain, THREAD)).toBe(plain);
  });

  it('answers in the language of the text it is scrubbing', () => {
    const out = quiet(() => scrubInternalToolNames('I will use ask_contact now', THREAD));
    expect(out).toContain('an internal function');
    expect(out).not.toContain('ask_contact');
  });

  it('matches the longest name first, so one inside another survives whole', () => {
    // approve_task_plan contains task_plan-shaped fragments; the whole name
    // must go, not a piece of it leaving debris behind.
    const out = quiet(() => scrubInternalToolNames('approve_task_plan-ს ვიძახებ', THREAD));
    expect(out).not.toContain('task_plan');
    expect(out).not.toContain('approve');
  });
});
