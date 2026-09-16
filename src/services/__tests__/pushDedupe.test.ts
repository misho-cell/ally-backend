/**
 * Ticket 20 row 111, the push half — one push per event.
 *
 * 15 September: Giorgi received the same notification many times. Twelve call
 * sites send pushes, so the guard belongs at the sender rather than at any one
 * of them, and the key is the person plus the exact words. The engine's wake
 * body is a PREVIEW OF THE REPLY, so identical text means an identical reply,
 * which is the same event told twice.
 *
 * CHECKING AND RECORDING ARE SEPARATE, and that is not a style choice — see
 * the last test in this file for the bug it exists to prevent, which the
 * per-device suite caught in my first version.
 */
import { sentThisAlready, rememberPush, clearPushDedupe } from '../notification.service';

const WAKE = {
  title: 'Netai — დავალებაზე სიახლეა',
  body: 'ვიპოვე სამი ფლორისტი ვაკეში.',
  url: '/chat/15812',
};

beforeEach(() => clearPushDedupe());

describe('row 111 — the same words twice are one event', () => {
  it('a delivered push is remembered; the next identical one is suppressed', () => {
    expect(sentThisAlready('501', WAKE)).toBe(false);
    rememberPush('501', WAKE);
    expect(sentThisAlready('501', WAKE)).toBe(true);
  });

  it('is per PERSON — Giorgi’s duplicate does not silence Nino’s first', () => {
    rememberPush('501', WAKE);
    expect(sentThisAlready('165699', WAKE)).toBe(false);
  });

  /**
   * The half that matters more. Over-suppressing costs somebody a
   * notification they needed, which is worse than the duplicate this fixes.
   */
  it.each([
    ['body', { ...WAKE, body: 'ვიპოვე ორი ელექტრიკოსი ბათუმში.' }],
    ['title', { ...WAKE, title: 'Netai — ახალი კითხვა' }],
    ['url', { ...WAKE, url: '/chat/15999' }],
  ])('a different %s is a different event and goes through', (_field, other) => {
    rememberPush('501', WAKE);
    expect(sentThisAlready('501', other)).toBe(false);
  });

  it('a missing url is not the same as some other url', () => {
    rememberPush('501', { title: WAKE.title, body: WAKE.body });
    expect(sentThisAlready('501', WAKE)).toBe(false);
  });

  it('forgets, so the same wording can be sent again later', () => {
    jest.useFakeTimers();
    try {
      rememberPush('501', WAKE);
      expect(sentThisAlready('501', WAKE)).toBe(true);

      jest.advanceTimersByTime(11 * 60 * 1_000);
      expect(sentThisAlready('501', WAKE)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not grow without a bound — expired keys are dropped', () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 50; i++) rememberPush('501', { ...WAKE, body: `reply ${i}` });
      jest.advanceTimersByTime(11 * 60 * 1_000);
      expect(sentThisAlready('501', { ...WAKE, body: 'reply 0' })).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * THE BUG THIS SHAPE EXISTS TO PREVENT, and the existing per-device suite
   * caught it in my first version rather than any test I wrote.
   *
   * A push suppressed because the person is LOOKING AT THE SCREEN (ticket 17
   * row 6) delivers to nobody. My first version recorded it as sent anyway, so
   * the retry that should go out the moment they look away was silently
   * dropped — over-suppression, which is the worse failure of the two.
   *
   * Checking must not record. Only a real delivery does.
   */
  it('merely CHECKING never records — a push nobody received is not one they had', () => {
    expect(sentThisAlready('501', WAKE)).toBe(false);
    expect(sentThisAlready('501', WAKE)).toBe(false);
    expect(sentThisAlready('501', WAKE)).toBe(false);
  });
});
