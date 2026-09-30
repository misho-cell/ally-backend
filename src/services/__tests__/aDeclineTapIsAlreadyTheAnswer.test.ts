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

  it('keeps the one-line check for a no in their own words, a third person, or something delicate', () => {
    expect(section).toMatch(/მისივე სიტყვებითაა დაწერილი/);
    expect(section).toMatch(/მესამე ადამიანი/);
    expect(section).toMatch(/ნაზია/);
  });

  it('moves the remember offer into the line that says it went', () => {
    expect(section).toMatch(/D120/);
    expect(section).toMatch(/არასდროს დააყოვნო/);
  });

  it('still forbids a name or detail the person did not give', () => {
    expect(section).toMatch(/არასდროს ჩასვა სახელი ან დეტალი/);
  });

  it('the tool and the server note say the same about the button', () => {
    expect(toolDescription('send_answer_to_asker')).toMatch(/decline button/);
    expect(toolDescription('send_answer_to_asker')).toMatch(/no in their own words/);
    expect(NEEDS_CONFIRMATION_NOTE).toMatch(/უარის ღილაკის ტექსტი/);
  });
});
