import { planReplyText } from '../chat.service';

/**
 * 2909 / 1454 (box 54165, conv 50265): an English plan through two go-betweens.
 * #8779 c: the model's reply that names both stands as written — what it found
 * and its own question are its own; the server cuts nothing by words.
 */
describe('an English introduction plan that names both go-betweens', () => {
  const PLAN = {
    text: "I'll talk to Levan's and Maia's assistants and try to arrange an introduction to Bakhva Gamogonili for you.",
    names: ['Levan Nimushadze', 'Maia Fiktiuri'],
  };

  it('is the model’s own reply, unchanged', () => {
    const reply =
      "They're not in your own contacts, but they show up one ring out.\n\n" +
      'Levan Nimushadze and Maia Fiktiuri both know Bakhva. Shall I ask Levan first, then Maia?';
    expect(planReplyText(reply, PLAN, 'en')).toBe(reply);
  });
});
