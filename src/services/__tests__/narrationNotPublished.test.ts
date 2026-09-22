/**
 * THE LAST PLACE THE PRODUCT STILL PROMISED SOMETHING IT CANNOT KEEP.
 *
 * Measured on the live build, 22 September, thread 22045. A user told their own
 * assistant not to be asked about tyre fitters:
 *
 *   15:25:50  STEP     „მესმის, ვინახავ როგორც შენს პრეფერენციას. ამიერიდან
 *                       საბურავების ხელოსნებზე აღარაფერს გკითხავ."        ✗
 *   15:25:51  save_user_note returns, result_keys „reply_rule,saved,scope"
 *   15:25:55  MESSAGE  „შენახულია, როგორც შენი პრეფერენცია."               ✓
 *
 * `reply_rule` fixed the reply, 2 of 2, where 484 characters of `scope` had
 * failed 3 of 3. It could not touch the step, and never could: the narration is
 * written BEFORE the call, so the tool result does not exist yet. The tool
 * description — the only thing in front of the model at that moment — was
 * changed in the same deploy and did not hold.
 *
 * So the product stops asking and declines to publish the sentence. Nothing new
 * is written, which is what „take the promise off" means.
 */
jest.mock('../../db/postgres/client', () => ({
  query: jest.fn(),
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  default: { end: jest.fn() },
}));

import { narrationIsSafeToPublish } from '../chat.service';

describe('narration from a round that only saves a note is not published', () => {
  it('withholds it when the note save is the whole round', () => {
    expect(narrationIsSafeToPublish(['save_user_note'])).toBe(false);
  });

  it('withholds it when the round saves several notes and nothing else', () => {
    expect(narrationIsSafeToPublish(['save_user_note', 'save_user_note'])).toBe(false);
  });

  /**
   * A round that also searched has narration ABOUT the search, and that is the
   * step panel doing its job. Suppressing it would hide real work to silence
   * one sentence.
   */
  it('publishes it when the round did anything else as well', () => {
    expect(narrationIsSafeToPublish(['save_user_note', 'search_contacts'])).toBe(true);
    expect(narrationIsSafeToPublish(['search_contacts', 'save_user_note'])).toBe(true);
  });

  it('publishes it for every ordinary round', () => {
    expect(narrationIsSafeToPublish(['search_contacts'])).toBe(true);
    expect(narrationIsSafeToPublish(['ask_contact', 'find_warm_path'])).toBe(true);
  });

  /**
   * A text-only turn calls no tools, and its narration IS the answer. Returning
   * false here would suppress ordinary replies — the failure mode that matters,
   * because `[].every(...)` is true and the naive predicate gets this backwards.
   */
  it('publishes it when the round called no tools at all', () => {
    expect(narrationIsSafeToPublish([])).toBe(true);
  });

  /**
   * The whole point of suppressing rather than rewriting: no sentence is
   * authored, so no new sentence can be wrong, and nobody has to approve one.
   * A future entry is a tool NAME, never a replacement line.
   */
  it('is a list of tools, not a list of phrases', () => {
    expect(narrationIsSafeToPublish(['tool_that_does_not_exist'])).toBe(true);
  });
});
