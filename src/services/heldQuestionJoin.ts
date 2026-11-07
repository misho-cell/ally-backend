/**
 * Giorgi's review, case 3 (Misho's yes, 7 Nov): a go-between got Dato, then
 * Nika, then Dato G. — each in a message of its own. A question held for one
 * person on one goal (until the last message is seen, #7659, or until their
 * 24-hour window reopens, #391) kept only the FIRST: a second question to the
 * same person was dropped while the run was told it would go by itself.
 *
 * Now a later question joins the one already waiting, so the person gets one
 * message with all of them. It joins only while the joined text still fits in
 * one ask; a question already in it is not added twice.
 */

/** The longest question one ask carries; createAsk trims to the same. */
export const MAX_QUESTION_CHARS = 600;

/** Between two held questions joined into one message. */
export const HELD_QUESTION_SEPARATOR = '\n\n';
