/**
 * Ticket 19 G3 — the tool texts still asked for wording approval.
 *
 * The founder, 15 September (D255, D256): „I speak with my assistant, Ninia
 * speaks with her assistant, both assistants know what kind of tone of voice
 * their users prefer, so I don't understand why it wants my approval about
 * wording … when I have a clear goal, it should not need to approve that."
 *
 * The prompt blocks were rewritten to say this. Two tool descriptions and one
 * SERVER-WRITTEN tool result still said the opposite, and a model reads all
 * three as rules:
 *
 *   ask_contact          „confirm once … showing the recipient AND the exact wording"
 *   send_answer_to_asker „SHOW it to them verbatim … only after they explicitly approve"
 *   the confirmed gate   „აჩვენე მომხმარებელს გასაგზავნი ტექსტი სიტყვასიტყვით"
 *
 * Evidence: 15380 17:59:38 („აი დრაფტი … გავაგზავნო?") and 15445 17:39:51
 * („თორნიკეს გავუგზავნო ეს?") — one extra tap for a clear one-line message.
 *
 * The third one is the reason this test exists at the level it does: no edit to
 * a prompt block could ever have reached a sentence the server writes into a
 * tool result.
 */
import { TOOL_TEXTS } from '../mcp/texts';
import { NEEDS_CONFIRMATION_NOTE, toolDescription } from '../chat.service';

// The phrases the report quoted, and the shape of the instruction behind them.
const ASKS_FOR_A_DRAFT = [
  /exact wording/i,
  /SHOW it to them verbatim/i,
  /verbatim/i,
  /სიტყვასიტყვით/,
];

describe('Ticket 19 G3 — no tool text asks the user to approve wording', () => {
  it.each(['ask_contact', 'send_answer_to_asker'])('%s', (name) => {
    const text = toolDescription(name);
    expect(text).not.toBe('');
    for (const phrase of ASKS_FOR_A_DRAFT) expect(text).not.toMatch(phrase);
  });

  it('the connector copy of ask_contact says the same as the in-app one', () => {
    const text = TOOL_TEXTS['ask_contact']?.description ?? '';
    expect(text).not.toBe('');
    for (const phrase of ASKS_FOR_A_DRAFT) expect(text).not.toMatch(phrase);
  });

  it('send_answer_to_asker still says a clear answer goes at once', () => {
    expect(toolDescription('send_answer_to_asker')).toMatch(/AT ONCE with confirmed=true/);
  });

  it('both still keep the one-line check for something delicate', () => {
    expect(toolDescription('send_answer_to_asker')).toMatch(/delicate/i);
    expect(toolDescription('ask_contact')).toMatch(/ONE short line/);
  });

  it('ask_contact still refuses to write to someone the plan does not name', () => {
    expect(toolDescription('ask_contact')).toMatch(/plan change/);
  });

  // The one a prompt edit could never have reached.
  describe('the note the SERVER writes when confirmed is missing', () => {
    it('no longer tells the model to show the text word for word', () => {
      expect(NEEDS_CONFIRMATION_NOTE).not.toMatch(/სიტყვასიტყვით/);
    });

    it('tells it to send a clear answer at once, with no draft', () => {
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/დრაფტის ჩვენების გარეშე/);
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/confirmed=true/);
    });

    it('still names the three cases that are shown first', () => {
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/უარია/);
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/მესამე ადამიანი/);
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/ნაზია/);
    });

    it('still says plainly that nothing was sent', () => {
      expect(NEEDS_CONFIRMATION_NOTE).toMatch(/^არაფერი გაგზავნილა\./);
    });
  });
});
