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
    // Row 106: it used to say „შიდა ფუნქცია" here, which is the same problem
    // in a different costume — the user learns only that there is machinery
    // they are not being shown. The replacement is a word for what the
    // assistant can DO, in the language people use.
    //
    // THIRD PASS, and this line used to read `toContain('ეს შესაძლებლობა')`.
    // It was asserting the bug: the „-ზე" belongs to the tool name, and a
    // fixed phrase cannot carry it, so the sentence came out as
    // „ეს შესაძლებლობა-ზე გადავდივარ" and the test was satisfied because the
    // phrase was present. It took the tester finding the same shape in a live
    // reply (#3599) for anybody to read the whole sentence.
    expect(out).toBe('პირდაპირ ამ ხერხზე გადავდივარ');
    expect(out).not.toContain('შიდა');
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
    expect(out).toContain('this capability');
    expect(out).not.toContain('ask_contact');
    expect(out).not.toContain('internal');
  });

  it('matches the longest name first, so one inside another survives whole', () => {
    // approve_task_plan contains task_plan-shaped fragments; the whole name
    // must go, not a piece of it leaving debris behind.
    const out = quiet(() => scrubInternalToolNames('approve_task_plan-ს ვიძახებ', THREAD));
    expect(out).not.toContain('task_plan');
    expect(out).not.toContain('approve');
  });
});

/**
 * Ticket 20 row 106, 16 September — the scrub was the source.
 *
 * The tester reported „შიდა ფუნქცია" on goal 3664 and „(შიდა ნომერი …)" on
 * goal 3665 as things the assistant said to a user. Neither was the model's
 * wording. Both were this function's OUTPUT: it removed our vocabulary and
 * wrote different vocabulary of ours in its place, so a rule meant to stop the
 * plumbing showing through was the thing showing it.
 */
describe('row 106 — the replacement was the leak', () => {
  it('an id in brackets loses the brackets too', () => {
    const out = quiet(() => scrubInternalToolNames('ნინიას უკვე ვუგზავნე (ask_id 1750)', THREAD));

    // Not „…ვუგზავნე (შიდა ნომერი)", which is an empty parenthesis announcing
    // that something was hidden.
    expect(out).toBe('ნინიას უკვე ვუგზავნე');
  });

  it('a bare id goes without leaving a gap or a dangling comma', () => {
    const out = quiet(() => scrubInternalToolNames('მიზანი task_id=3664 მიმდინარეობს', THREAD));

    expect(out).not.toContain('3664');
    expect(out).not.toContain('შიდა');
    expect(out).toBe('მიზანი მიმდინარეობს');
  });

  it('the word „შიდა" never reaches a reply through this function', () => {
    for (const input of [
      'ვიყენებ search_by_tag-ს',
      'გავხსენი thread_id 15676',
      'ask_id: 1850 გაიგზავნა',
      '(task_id 3598)',
    ]) {
      const out = quiet(() => scrubInternalToolNames(input, THREAD));
      expect(out).not.toContain('შიდა');
      expect(out).not.toMatch(/internal/i);
    }
  });

  it('leaves text that carries nothing internal exactly as it was', () => {
    // The tidy-up must not touch ordinary prose — this runs on every step line
    // the product writes.
    for (const clean of [
      'ვიპოვე სამი ფლორისტი ვაკეში, ერთი მათგანი დღესვე თავისუფალია.',
      'ფასი: 20, 30 ლარი.',
      'ok — I will ask two people.',
    ]) {
      expect(quiet(() => scrubInternalToolNames(clean, THREAD))).toBe(clean);
    }
  });
});

/**
 * Ticket 20 row 106, second pass — a button label is text on the screen too.
 *
 * The scrub has always run over the reply and the step lines and never over
 * the BUTTONS, so a tool name the model typed into a choice reached the owner
 * untouched — and invisibly to anyone searching the stored replies, because a
 * label lives in its own column.
 *
 * Found while looking for the seat's „present_choices reached a reply"
 * (#3113), which could NOT be reproduced in any user-visible row: the newest
 * tool name in a stored message is 15 September, before the G8 fix. So this is
 * a gap found on the way rather than the one they saw.
 */
describe('a tool name in a BUTTON is scrubbed like one in the reply', () => {
  it('replaces it with the same words the reply gets', () => {
    expect(scrubInternalToolNames('propose_task_plan', THREAD)).toBe('this capability');
    expect(scrubInternalToolNames('გამოიყენე propose_task_plan', THREAD)).toContain(
      'ეს შესაძლებლობა',
    );
  });

  it('leaves an ordinary button alone, letter for letter', () => {
    for (const label of ['დამტკიცებულია', 'შევცვალოთ', 'თვითონ დავურეკავ', 'Send it']) {
      expect(scrubInternalToolNames(label, THREAD)).toBe(label);
    }
  });
});

/**
 * Ticket 20 row 106, third pass — the scrub left a Georgian case ending behind.
 *
 * The tester read it from outside as „the Georgian label of present_choices
 * reached a reply" (#3599). It is neither the label nor the model: it is this
 * function's own output. Thread 16542, goal 4394, 12:04:51:
 *
 *   the model wrote   „present_choices-ით შემოგთავაზებ როგორ გავაგრძელოთ."
 *   the owner read    „ეს შესაძლებლობა-ით შემოგთავაზებ როგორ გავაგრძელოთ."
 *
 * Georgian attaches its endings straight onto the word, so the name arrives as
 * `present_choices-ით` and a `\b` match takes only the name.
 */
describe('a Georgian case ending leaves with the tool name', () => {
  it('moves the ending onto a word that can carry it — the real sentence', () => {
    const out = scrubInternalToolNames(
      'present_choices-ით შემოგთავაზებ როგორ გავაგრძელოთ.',
      THREAD,
    );

    expect(out).toBe('ამ ხერხით შემოგთავაზებ როგორ გავაგრძელოთ.');
    expect(out).not.toContain('-ით');
  });

  it('works for the other endings a model actually writes', () => {
    expect(scrubInternalToolNames('propose_task_plan-ზე გადავდივარ', THREAD)).toBe(
      'ამ ხერხზე გადავდივარ',
    );
    expect(scrubInternalToolNames('ask_contact-ს გამოვიყენებ', THREAD)).toBe(
      'ამ ხერხს გამოვიყენებ',
    );
  });

  it('still says „ეს შესაძლებლობა" when there is no ending to carry', () => {
    // The row 106 wording the seat accepted, unchanged for the bare case: „ამ
    // ხერხი" is not a sentence, and a fixed phrase is right where nothing
    // declines.
    expect(scrubInternalToolNames('გამოვიყენებ present_choices', THREAD)).toBe(
      'გამოვიყენებ ეს შესაძლებლობა',
    );
  });

  it('does not invent an ending in an English reply', () => {
    expect(scrubInternalToolNames('I will use present_choices here', THREAD)).toBe(
      'I will use this capability here',
    );
  });

  it('leaves a hyphenated Georgian word that is NOT a tool name alone', () => {
    expect(scrubInternalToolNames('ნუნუკა-ბუღალტერი დამირეკა', THREAD)).toBe(
      'ნუნუკა-ბუღალტერი დამირეკა',
    );
  });
});
