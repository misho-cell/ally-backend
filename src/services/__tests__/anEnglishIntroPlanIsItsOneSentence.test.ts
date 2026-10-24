import { planReplyText } from '../chat.service';
import { carriesPlanSentence } from '../planJustification';

/** 2909 / 1454 (box 54165, conv 50265): an English plan through two go-betweens. */
describe('an introduction plan in English is its one sentence', () => {
  const PLAN = {
    text: "I'll talk to Levan's and Maia's assistants and try to arrange an introduction to Bakhva Gamogonili for you.",
    names: ['Levan Nimushadze', 'Maia Fiktiuri'],
  };

  it('knows the plan sentence with one go-between or several', () => {
    expect(carriesPlanSentence(PLAN.text)).toBe(true);
    expect(carriesPlanSentence("I'll talk to Levan's assistant and try to arrange it.")).toBe(true);
    expect(carriesPlanSentence('поговорю с ассистентами Левана и Майи')).toBe(true);
    expect(carriesPlanSentence('hablaré con los asistentes de Levan y Maia')).toBe(true);
    expect(carriesPlanSentence('I searched your contacts.')).toBe(false);
  });

  // #6367 (Misho's yes, 24 Oct): what was found stays above the plan; the reason asked twice goes.
  it('keeps what was found and drops the reason asked twice', () => {
    const reply =
      "They're not in your own contacts, but they show up one ring out.\n\n" +
      'Levan Nimushadze and Maia Fiktiuri both know Bakhva.\n\n' +
      '1. Could you tell me in a line why you want to meet Bakhva?\n\n' +
      'And if you can share why you would like to meet Bakhva, that line will help.\n\nShall I start?';
    expect(planReplyText(reply, PLAN, 'en')).toBe(
      "They're not in your own contacts, but they show up one ring out.\n\n" +
        'Levan Nimushadze and Maia Fiktiuri both know Bakhva.\n\n' +
        `${PLAN.text}\n\nShall I start?`,
    );
  });
});
