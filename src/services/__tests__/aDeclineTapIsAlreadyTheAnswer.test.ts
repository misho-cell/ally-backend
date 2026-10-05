jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { allDeclineChoices } from '../askOpening';
import { buildIncomingAskSection, NEEDS_CONFIRMATION_NOTE, toolDescription } from '../chat.service';

/**
 * Row 302, the seat's test round of 29 September. D255/D256 said a clear
 * answer goes at once, and the tool description and the server's note were
 * rewritten to say so — but the incoming-ask section of the prompt still said
 * „show the text verbatim, ask 'გავუგზავნო?', two buttons". Both typed answers
 * got the preview (26671, 26675), and our own decline BUTTON got a second
 * „shall I tell them? [Send]" (26668, 26676).
 */
const ASK = {
  id: 1,
  task_id: 2,
  question: 'Do you know a good accountant?',
  from_name: 'Netai Test 47',
  status: 'sent',
};

describe('an answer that is already clear goes at once', () => {
  const section = buildIncomingAskSection(ASK);

  it('no longer tells the model to show the text word for word', () => {
    expect(section).not.toMatch(/სიტყვასიტყვით/);
    expect(section).not.toMatch(/გავუგზავნო ეს ტექსტი/);
    expect(section).not.toMatch(/„გაუგზავნე" \/ „გაუგზავნე და დაიმახსოვრე"/);
  });

  it('says a clear answer is sent now, with a line that it went', () => {
    expect(section).toMatch(/გაგზავნე ახლავე send_answer_to_asker-ით confirmed=true/);
    expect(section).toMatch(/დრაფტის ჩვენების/);
  });

  it('names every language of our decline button as a final answer', () => {
    for (const choice of allDeclineChoices()) expect(section).toContain(`„${choice}"`);
    expect(section).toMatch(/უარის ღილაკი/);
  });

  it('keeps the one-line check only for a third person or something delicate (a typed no goes at once)', () => {
    expect(section).toMatch(/უარი მისივე სიტყვებით/);
    expect(section).toMatch(/მესამე ადამიანი/);
    expect(section).toMatch(/ნაზია/);
  });

  it('offers no rule to remember (D562) and never says one was saved', () => {
    expect(section).toMatch(/აღარ ინახება \(D562\): არასდროს შესთავაზო/);
    expect(section).not.toMatch(/რომელი ერთი ღილაკი შესთავაზო/);
  });

  it('still forbids a name or detail the person did not give', () => {
    expect(section).toMatch(/არასდროს ჩასვა სახელი ან დეტალი/);
  });

  it('the tool and the server note say the same about the button', () => {
    expect(toolDescription('send_answer_to_asker')).toMatch(/decline button/);
    expect(toolDescription('send_answer_to_asker')).toMatch(
      /a no in their own words\) goes AT ONCE/,
    );
    expect(NEEDS_CONFIRMATION_NOTE).toMatch(/უარის ღილაკის ტექსტი/);
  });
});

/**
 * Row 302's residue, the seat's 855: Test 27 typed „…ჩემი კონტაქტია.
 * დავაკავშირებ, თუ გინდა." and his assistant tried relay_ask, then showed a
 * rewritten draft with [გაუგზავნე]. The „third person beyond a name" check
 * caught an offer to connect. A recommendation or an offer to connect is a
 * clear answer; the check stays only for a third person's PRIVATE details.
 */
describe('a recommendation or an offer to connect goes at once, as typed', () => {
  const section = buildIncomingAskSection(ASK);
  const tool = toolDescription('send_answer_to_asker');

  it('names them as clear answers in the prompt, the tool and the server note', () => {
    expect(section).toMatch(/რეკომენდაცია, დაკავშირების შეთავაზება/);
    expect(tool).toMatch(/a recommendation, an offer to connect/);
    expect(NEEDS_CONFIRMATION_NOTE).toMatch(/რეკომენდაცია, დაკავშირების შეთავაზება/);
  });

  // D648 (box 37654): the content in the assistant's words, never quoted; the facts exact.
  it('sends the content in its own words with the facts exact, and forbids an unasked relay', () => {
    expect(section).toMatch(/შენი სიტყვებით, ციტატის გარეშე/);
    expect(section).toMatch(/ზუსტად ისე, როგორც დაწერა \(D648\)/);
    expect(section).toMatch(/არმოთხოვნილი relay_ask/);
    expect(tool).toMatch(/in YOUR words — its content, never/);
    expect(tool).not.toMatch(/exactly as they typed it/);
    expect(tool).toMatch(/no relay_ask they did not ask for/);
  });

  it('keeps the check only for private details about a third person', () => {
    expect(section).not.toMatch(/სახელს მიღმა/);
    expect(tool).not.toMatch(/beyond a name/);
    expect(section).toMatch(/პირად დეტალებს ამხელს \(ჯანმრთელობა, ოჯახი, ფული/);
    expect(tool).toMatch(/private details \(health, family, money/);
  });
});

/**
 * Row 302's last residue — the seat's 864: „სამწუხაროდ არავის ვიცნობ." and
 * „ვერ დაგეხმარები, ელექტრიკოსი არ მყავს ნაცნობი." each got a „გაგზავნე"
 * button. The plate's DONE WHEN: every typed answer goes at once as typed.
 */
describe('a no typed in their own words goes at once', () => {
  const section = buildIncomingAskSection(ASK);
  it('names it as a clear answer in the prompt, the tool and the server note', () => {
    expect(section).toMatch(/უარი მისივე სიტყვებით \(„სამწუხაროდ არავის ვიცნობ"\)/);
    expect(toolDescription('send_answer_to_asker')).toMatch(
      /a no in their own words\) goes AT ONCE/,
    );
    expect(NEEDS_CONFIRMATION_NOTE).toMatch(/ან უარი მისივე სიტყვებით/);
  });
  it('no longer lists a typed no among the cases shown first', () => {
    expect(section).not.toMatch(/უარი მისივე სიტყვებითაა დაწერილი/);
    expect(toolDescription('send_answer_to_asker')).not.toMatch(/when the answer is a no/);
  });
});

/** The tester's 38744: „შენახულია" after a profile note read as an automatic answer saved. */
describe('a request to answer for the user automatically', () => {
  it('is told plainly that no new rule is made, and a profile note is named', () => {
    const description = toolDescription('list_answer_rules');
    expect(description).toContain('A NEW rule can no longer be made');
    expect(description).toContain('never a bare „saved"');
    // #1090: the line read as „cannot send" to an English „ask X…" — it is scoped now.
    expect(description).toContain('only about questions OTHER people send TO the user');
    expect(description).toContain('„ask X…" is ask_contact as always');
  });
});
