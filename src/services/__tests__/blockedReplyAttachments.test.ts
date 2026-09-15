/**
 * Ticket 19 [6] — the apology that kept the blocked reply's buttons.
 *
 * Run 38, thread 14792: „ვინ ხარ შენ?" was stopped by the content checker.
 * The text was replaced by „პასუხის ტექსტი შიდა შემოწმებამ შეაჩერა…" and the
 * eight goal buttons the blocked reply had offered were still attached to it.
 *
 * So the person was handed an apology for a reply they never saw, under eight
 * choices belonging to it. Pressing one would have answered a sentence that
 * had just been ruled unfit to show them — and on this product a button can
 * send a message to a real person.
 */
import { attachmentsAfterModeration } from '../chat.service';

const EIGHT_GOAL_BUTTONS = [
  'ვეტერინარი',
  'ელექტრიკოსი',
  'ნავის ოსტატი',
  'იურისტი',
  'დიჯეი',
  'ბუღალტერი',
  'არქიტექტორი',
  'თარჯიმანი',
];

describe('what a blocked reply leaves behind', () => {
  it('takes its buttons with it', () => {
    const out = attachmentsAfterModeration(false, {
      choices: EIGHT_GOAL_BUTTONS,
      options: { kind: 'picker' },
    });

    expect(out.choices).toBeNull();
    expect(out.options).toBeUndefined();
  });

  it('leaves a reply that passed exactly as it was', () => {
    const options = { kind: 'picker' };
    const out = attachmentsAfterModeration(true, { choices: EIGHT_GOAL_BUTTONS, options });

    expect(out.choices).toBe(EIGHT_GOAL_BUTTONS);
    expect(out.options).toBe(options);
  });

  it('reports no buttons the same way whether there were none or they were taken', () => {
    // The caller stores `null` and omits the field; undefined and null must
    // not mean two different things downstream.
    expect(attachmentsAfterModeration(true, { choices: undefined, options: undefined })).toEqual({
      choices: null,
      options: undefined,
    });
    expect(attachmentsAfterModeration(false, { choices: undefined, options: undefined })).toEqual({
      choices: null,
      options: undefined,
    });
  });
});
