jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { buildPushPreview, PUSH_PREVIEW_WHEN_NOTHING_IS_SAFE } from '../threads.routes';

/**
 * A PUSH THAT GOES OUT WITH A BLANK BODY.
 *
 * The push body is the reply, scrubbed, collapsed and truncated. When all of
 * that leaves nothing, the person's lock screen shows a notification with a
 * title and no body at all. The line that stops it:
 *
 *     if (safe.length === 0) return 'შენი პასუხი მზადაა';
 *
 * ⚠️ FOUND BY `sabotage.py` ON 27 SEPTEMBER, in line mode: commented out, and
 * the whole suite stayed green.
 *
 * ⚠️ AND THE FIRST VERSION OF THIS TEST WAS WRONG ABOUT WHY. It asserted that
 * a reply which is nothing but a phone number is what empties the preview.
 * `scrubText` SUBSTITUTES — that reply comes back as „[hidden]" — so the empty
 * case is an empty or whitespace-only reply, and the assertion is written
 * against what the scrubber actually does rather than what it sounded like it
 * did. The measurement is below, in its own test, so the next person does not
 * have to guess either.
 */
const A_LONG_REPLY = 'ა'.repeat(200);

describe('the push body when there is nothing safe to show', () => {
  it('says the answer is ready rather than going out blank', () => {
    expect(buildPushPreview('')).toBe(PUSH_PREVIEW_WHEN_NOTHING_IS_SAFE);
  });

  it('does the same for a reply that was only whitespace', () => {
    expect(buildPushPreview('   \n\t  ')).toBe(PUSH_PREVIEW_WHEN_NOTHING_IS_SAFE);
  });

  /**
   * And it does NOT say it when there is something to say — without this the
   * two above would pass on a function that replaced every preview with the
   * fallback, which is the same notification broken from the other side.
   */
  it('shows the reply when the reply survives scrubbing', () => {
    expect(buildPushPreview('  ნაპოვნია  ორი  ადამიანი  ')).toBe('ნაპოვნია ორი ადამიანი');
  });
});

describe('the push body is scrubbed on its own', () => {
  /**
   * On the function's own argument — „the reply is already scrubbed for SSE,
   * but THIS PATH IS INDEPENDENT". A push body is the one piece of this
   * product that appears on a screen the owner has not unlocked, where anybody
   * standing near them can read it. If the scrub were dropped from this path,
   * nothing else would notice.
   */
  it('takes the number out and keeps the sentence', () => {
    const preview = buildPushPreview('დაურეკე ნინოს: +995599112233');

    expect(preview).not.toContain('599112233');
    expect(preview).toContain('ნინოს');
  });

  /** What it leaves behind, measured: a placeholder, not a hole. */
  it('substitutes rather than deletes — a number-only reply is not empty', () => {
    expect(buildPushPreview('+995 599 11 22 33')).not.toBe(PUSH_PREVIEW_WHEN_NOTHING_IS_SAFE);
  });
});

describe('the push body is short enough to be read', () => {
  it('truncates with an ellipsis rather than overflowing the lock screen', () => {
    const preview = buildPushPreview(A_LONG_REPLY);

    expect(preview).toHaveLength(120);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('leaves a reply that already fits exactly as it is', () => {
    const fits = 'ა'.repeat(120);

    expect(buildPushPreview(fits)).toBe(fits);
  });
});
