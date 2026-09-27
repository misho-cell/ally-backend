import { readFileSync } from 'fs';
import { join } from 'path';
import { scrubMechanicalForStorage } from '../privacyScrub';

/**
 * THE CARD THE PERSON SAW AND THE CARD THE THREAD KEEPS WERE TWO TEXTS.
 *
 * A pending card is delivered twice over: written to `conversations`, and
 * pushed live over SSE so it appears under the answer without a reload. The
 * store was handed `scrubMechanicalForStorage(rendered.text)` and the stream
 * was handed `rendered.text` RAW — so somebody present saw one thing and the
 * same card, re-read a minute later, could say another.
 *
 * That breaks an invariant this codebase states out loud, in
 * `scrubMechanicalForStorage`'s own comment: "applied BEFORE the reply is
 * stored, so `/threads/:id/messages`, the list's `last_message` and the SSE
 * stream all read the same clean text."
 *
 * ⚠️ WHAT THIS IS NOT. Found while hunting the missing question mark on an
 * intro card, and it does NOT explain it — `scrubMechanicalForStorage` does
 * not touch "?", which the first test below pins so nobody later reads this
 * fix as that one's answer. Two faults, one search.
 *
 * WHAT IT DID DIVERGE ON is ordinary: a contact's name stored in MTAVRULI —
 * Georgian caps, and plenty of names in this database are — folds to
 * mkhedruli in the store and did not on the wire. "GIORGI-თან გაცნობა" live
 * and "გიორგი-თან გაცნობა" on reload is one message in two versions.
 */
const CHAT = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/** The delivery block: scrub once, then store and emit the same value. */
const DELIVERY = CHAT.slice(
  CHAT.indexOf('const choices = rendered.choices.map(scrubButtonLabel);'),
  CHAT.indexOf('[pending-message] delivery failed'),
);

describe('what the scrub does and does not do', () => {
  /**
   * First, so the fix below cannot be misread as the question mark's answer.
   */
  it('leaves a question mark exactly where it was', () => {
    const card = 'Netai Test 6-თან გაცნობა დადასტურდა. გამოდგა?';

    expect(scrubMechanicalForStorage(card)).toBe(card);
  });

  /** And this is what it DOES do, which is what was diverging. */
  it('folds MTAVRULI to mkhedruli, which a contact name can be written in', () => {
    expect(scrubMechanicalForStorage('ᲒᲘᲝᲠᲒᲘ-თან გაცნობა დადასტურდა. გამოდგა?')).toBe(
      'გიორგი-თან გაცნობა დადასტურდა. გამოდგა?',
    );
  });
});

describe('a pending card is one text, not two', () => {
  it('scrubs once, before either door', () => {
    expect(DELIVERY).toContain('const text = scrubMechanicalForStorage(rendered.text);');
  });

  it('stores that text', () => {
    expect(DELIVERY).toContain(
      'const messageId = await savePendingMessage(userId, target, runId, text, choices, rendered);',
    );
  });

  it('sends the same text live', () => {
    expect(DELIVERY).toContain('content: text,');
  });

  /**
   * The assertion that actually holds the bug shut: the raw value must not
   * reach either door. Written as an absence because that is the shape of the
   * mistake — one call site kept the unscrubbed variable while the other was
   * fixed.
   */
  it('hands the raw text to neither', () => {
    expect(DELIVERY).not.toContain('content: rendered.text,');
    expect(DELIVERY).not.toContain('scrubMechanicalForStorage(rendered.text),\n        choices,');
  });
});
